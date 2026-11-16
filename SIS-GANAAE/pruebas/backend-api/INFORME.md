# Informe de pruebas de API — Rol EPI (Equipo de Permanencia Estudiantil)

**Alcance:** `GET /api/epi/reporte-asistencia`, `GET /api/epi/secciones/:idSeccion/estudiantes`, `GET /api/epi/reporte-asistencia/pdf` (y, como control de regresión de roles, `GET /api/reportes/estadisticas` y `GET /api/reportes/permanencia-alertas`).
**Fecha:** 2026-11-14 · **Ventana de trabajo:** 18:55 – 20:55 (hora local), en ciclos.
**Entorno:** Windows 11, Node v22.14.0, vitest 3.2.4, supertest 7.1.4, autocannon 8.0.0. Una sola máquina: el generador de carga y el servidor comparten CPU.

> **Importante:** todas las cifras son con **BD simulada en memoria**. Se mide el costo *del lado de la aplicación* (Express, middlewares, agregación, serialización JSON, generación del PDF). La latencia real de PostgreSQL **no** está incluida. Docker estaba instalado pero el daemon no estaba corriendo, así que **no** se levantó un Postgres desechable; no se tocó la BD de `backend-node/.env`.

---

## Resumen ejecutivo

- **12 ciclos** entre 19:14 y ~20:48 (inicio del trabajo 18:55). Último ciclo completo con suite ampliada: **323 pruebas, 287 pasaron, 36 fallaron**. Las 36 que fallan son pruebas `[DEFECTO…]` escritas a propósito para evidenciar defectos; **0 pruebas inestables** entre ciclos.
- **Funcionalmente correcto** en lo esencial: matriz de roles 401/403/200 completa, sesión/JWT/revocación, cálculo de periodos (semanas que cruzan año, bisiestos), sumas materias = sección = general y % verificados contra un oráculo independiente en 12 combinaciones de filtros, PDF válido en todas las combinaciones.
- **Defectos principales:** (1) el PDF bloquea el event loop y escala linealmente (~5 ms/página; >5 s a partir de ~20–40 k incidencias; 17–49 s con 500 k filas); (2) ~240–310 ms de costo fijo por PDF (logo PNG enorme + fuentes TTF re-parseadas); (3) validación débil de fechas/ids que termina en 500; (4) revocación de tokens *fail-open*; (5) `id_estudiante` expone nombre y cédula de cualquier persona.
- **JSON:** 4–40 ms de costo de app; ~130–230 req/s y p99 1,4–2,2 s a 100 conexiones; 0 errores en todas las corridas de carga. **PDF:** ≈1–2 PDF/s.

## 1. Cómo ejecutar

```bash
cd SIS-GANAAE/pruebas/backend-api
npm install                      # vitest, supertest, autocannon (solo en esta carpeta)
npx vitest run                   # suite funcional / caja negra (≈30–40 s)
# rendimiento (servidor en 127.0.0.1:4510, BD simulada)
node --expose-gc --import ./perf/register.mjs perf/perf.mjs --ciclo manual --tamanos 10000,100000 [--anual-max 500000]
# barrido de escalado del PDF (puerto 4512)
node --expose-gc --import ./perf/register.mjs perf/escalado.mjs --ciclo manual
# costo fijo de pdfkit con los recursos de la app
node perf/costo-fijo-pdf.mjs
# ciclo completo (suite + perf) -> resultados/ciclos.jsonl ; tablas -> resultados/tablas.md
node perf/ciclo.mjs <n> --tamanos 10000,100000
node perf/tablas.mjs
```

No se modificó ningún archivo fuera de `pruebas/backend-api/`. Las dependencias de la app (express, cookie-parser, jsonwebtoken, pdfkit…) se resuelven desde `backend-node/node_modules` con `createRequire`; los módulos de la app se importan por ruta absoluta.

### Estructura

| Ruta | Propósito |
|---|---|
| `support/fakeDb.mjs` | Fake de Knex en memoria (join/leftJoin con hash, where/whereIn/whereNot/whereBetween, groupBy+count, distinct, orderBy, first). Emula 2 errores de PostgreSQL: entero fuera de int4 (22003) y fecha inválida (22007/22008). Mide su propio tiempo para restarlo. |
| `support/seed.mjs` | Datos sintéticos deterministas: 17 secciones (7-1 … 11-3) + 1 vacía, 8 materias + 1 sin lecciones, 30 estudiantes/sección, asistencias feb–nov 2025 con los 4 estados (80 % presente, 7 % tardanza, 8 % ausente, 5 % justificado), nombres con tildes/ñ/apóstrofos, un nombre de ~200 caracteres con `<script>`. Incluye un **oráculo independiente** que cuenta directamente sobre los datos. |
| `support/auth.mjs` | Fabrica cookies `token` como las observadas: JWT HS256 cifrado AES-256-GCM (iv+tag+cipher en base64) con secretos **de prueba** fijados por variables de entorno (`support/env.mjs`). |
| `support/app.mjs` | App Express de prueba: `cookie-parser` + `reportesRoutes` + `epiRoutes` bajo `/api` + `notFound` / `errorHandler` reales. |
| `tests/*.test.mjs` | Suite vitest (el módulo `src/db/knex.js` se sustituye con `vi.mock`). |
| `perf/register.mjs`, `perf/hooks.mjs` | Loader hook de Node que redirige `src/db/knex.js` al fake fuera de vitest. |
| `perf/perf.mjs`, `perf/escalado.mjs`, `perf/costo-fijo-pdf.mjs`, `perf/ciclo.mjs`, `perf/tablas.mjs` | Rendimiento, barrido, micro-benchmark, orquestador de ciclos y generador de tablas. |
| `resultados/` | JSON de vitest por ciclo, JSON de perf/escalado por ciclo, `ciclos.jsonl`, logs y `tablas.md`. |

---

## 2. Estrategia

**Caja negra.** Todas las aserciones se hacen sobre respuestas HTTP (código, cabeceras, cuerpo JSON, bytes del PDF). El código fuente se leyó solo para saber cómo fabricar un token válido y qué consultas simular.

**Funcionales.**
- *Clases de equivalencia y valores límite* para `periodo`, `fecha_referencia`, `fecha_inicio`, `fecha_fin`, `id_seccion`, `id_materia`, `id_estudiante`, `:idSeccion`, `anio`: válidos, ausentes, vacíos, mal formados, fechas imposibles, rango invertido (incluido por 1 día), `0`, negativos, decimales, prefijos numéricos (`12abc`), int4 máx y máx+1, números enormes, `NaN`/`Infinity`, inyección SQL, arreglos (`x[]=`), prototype pollution, query de 8 KB.
- *Consistencia matemática*: Σ materias = total de sección; Σ secciones = resumen general; `total = presentes + tardías + aus. just. + aus. injust. + otros`; `% = round((presentes+tardías)/total·1000)/10`; verificación contra el oráculo para 12 combinaciones de filtros; casos de redondeo (33,3; 66,7; 99,9; 99,95→100; 14,3) y división por cero.
- *Matriz de roles*: sin cookie → 401; `epi`/`administrador`/`super_administrador` → 200; `profesor`/`orientador`/`padre_de_familia`/`estudiante`/rol vacío/`EPI` (mayúsculas) → 403, en los 3 endpoints EPI; además el control inverso en `/api/reportes/*` (EPI → 403).
- *Sesión*: cookie basura, sin cifrar, con otra clave, bit alterado, JWT con otro secreto, expirado, `nbf` futuro, HS512, `alg=none`, id no numérico, usuario inexistente, persona inactiva, cuenta inactiva, sin usuario de sistema, rol tomado de BD y no del JWT, `jti` revocado, token legado sin `jti`, header `Authorization`.
- *PDF*: estado, `Content-Type`, `Content-Disposition` (nombre por periodo), cabecera `%PDF-` y `%%EOF`, nº de páginas, PDF vacío, filtros combinados 2×2×2, nombres con caracteres especiales, errores 400/500 en JSON (no PDF parcial).
- *HTTP*: 404 de rutas desconocidas, POST/PUT/PATCH/DELETE, HEAD, barra final, mayúsculas en la ruta, URI mal codificada, formato de errores en `test` y `production`, aislamiento entre peticiones concurrentes.

**Rendimiento.** Servidor HTTP real en 127.0.0.1:4510–4513 con la app de prueba.
- *Secuencial*: p50/p95/p99 por endpoint; “app” = latencia total − tiempo consumido dentro del fake.
- *Concurrente*: autocannon 10/50/100 conexiones. Aquí el fake usa **caché de resultados** (la 2ª consulta idéntica cuesta ~0), de modo que lo medido es solo costo de la app.
- *Datasets*: 10 k, 100 k y 500 k filas de asistencia.
- *Peor caso*: PDF anual de todo el colegio; barrido de 0 → 80 k incidencias; memoria (RSS, heap) y bloqueo del event loop (`monitorEventLoopDelay`) + sonda de peticiones ligeras durante la generación.

Convención: las pruebas cuyo nombre empieza con **[DEFECTO…]** codifican el comportamiento *esperado*; **fallan a propósito** mientras el defecto exista (evidencia reproducible). Las marcadas **[OBSERVACIÓN]** pasan y documentan un comportamiento discutible actual.

<!--RESULTADOS-->

---

## 3. Archivos de prueba y conteos (último ciclo: 12)

| Archivo | Qué cubre | Pruebas | Pasaron | Fallaron |
|---|---|---|---|---|
| `01_autenticacion_roles.test.mjs` | Matriz de roles 401/403/200 (3 endpoints EPI + /reportes), validación de cookie/JWT/cuenta/revocación | 61 | 61 | 0 |
| `02_reporte_json_parametros.test.mjs` | Clases de equivalencia y valores límite de todos los parámetros del JSON | 88 | 66 | 22 |
| `03_reporte_json_consistencia.test.mjs` | Forma de respuesta, coherencia de sumas, fórmula del %, oráculo independiente | 33 | 32 | 1 |
| `04_estudiantes_seccion.test.mjs` | Endpoint de estudiantes por sección (anio, idSeccion) | 20 | 15 | 5 |
| `05_reporte_pdf.test.mjs` | PDF: cabeceras, nombre, %PDF/%%EOF, páginas, errores, fallos de BD | 19 | 16 | 3 |
| `06_http_general.test.mjs` | 404, métodos, variantes de ruta, formato de errores, concurrencia/aislamiento | 40 | 39 | 1 |
| `07_casos_adicionales.test.mjs` | Modo producción, orden de validación, matriz 2×2×2 de filtros en PDF, calendario | 23 | 23 | 0 |
| `08_robustez_cookies.test.mjs` | Variantes de cookie/JWT y privacidad de id_estudiante | 10 | 9 | 1 |
| `09_ciclo3_fechas_y_detalle.test.mjs` | Años de <4 cifras, determinismo, igualdad entre roles permitidos | 7 | 5 | 2 |
| `10_ciclo4_bloqueo_y_carga.test.mjs` | Bloqueo del event loop por PDF grande; estudiantes en paralelo | 2 | 1 | 1 |
| `11_ciclo5_reportes_regresion.test.mjs` | Regresión /reportes y comparación cruzada con EPI | 7 | 7 | 0 |
| `12_ciclo6_tamano_y_fechas_date.test.mjs` | Tamaño JSON acotado; fechas Date como node-postgres | 3 | 3 | 0 |
| `13_ciclo7_detalle_estudiante.test.mjs` | Detalle diario por estudiante (todas las marcas) y agrupación de materias | 2 | 2 | 0 |
| `14_ciclo8_head_pdf.test.mjs` | HEAD sobre el PDF ejecuta las mismas consultas que GET | 1 | 1 | 0 |
| `15_ciclo9_vacios_y_unicode.test.mjs` | Parámetros vacíos, dígitos unicode/ancho completo, byte nulo, hexadecimal | 7 | 7 | 0 |
| **Total** | | **323** | **287** | **36** |

Las 36 pruebas que fallan son **todas** pruebas `[DEFECTO…]` (comportamiento esperado no cumplido). Ninguna prueba funcional “normal” falla, y ninguna prueba cambió de resultado entre ciclos (ver §5.6).

## 4. Resultados por prueba

### 4.1 Pruebas que FALLARON (defectos)

| Archivo | Prueba | Motivo (aserción) |
|---|---|---|
| 02 | periodo / fechas: clases inválidas [DEFECTO] personalizado con fecha imposible 2025-02-30 debería => 400 (se envía a la BD => 500) | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | periodo / fechas: clases inválidas [DEFECTO] personalizado con mes 13 (2025-13-01) debería => 400 | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | periodo / fechas: clases inválidas [DEFECTO] periodo desconocido ("diario") debería => 400; hoy se ignora y se usa mensual | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | periodo / fechas: clases inválidas [DEFECTO] fecha_referencia mal formada debería => 400; hoy se usa la fecha actual en silencio | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | periodo / fechas: clases inválidas [DEFECTO] fecha_referencia imposible (2025-02-31) en mensual debería => 400 o febrero; hoy se desplaza a marzo | AssertionError: expected false to be true // Object.is equality |
| 02 | periodo / fechas: clases inválidas [DEFECTO] rango personalizado sin límite (0001-01-01 a 9999-12-31) debería => 400 por rango excesivo | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | periodo / fechas: clases inválidas [DEFECTO] fecha_inicio como arreglo (fecha_inicio[]=…) debería => 400; hoy se acepta y filtros.fecha_inicio sale como arreglo | AssertionError: expected false to be true // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_seccion="1' OR '1'='1" debería => 400; parseInt lo trunca a 1 y responde 200 | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_seccion="12abc" debería => 400 (parseInt parcial) | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_seccion="1.9" debería => 400 (decimal truncado a 1) | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_seccion=2147483648 (int4 max + 1) debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_seccion=99999999999999999999 debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_materia="1' OR '1'='1" debería => 400; parseInt lo trunca a 1 y responde 200 | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_materia="12abc" debería => 400 (parseInt parcial) | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_materia="1.9" debería => 400 (decimal truncado a 1) | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_materia=2147483648 (int4 max + 1) debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_materia=99999999999999999999 debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_estudiante="1' OR '1'='1" debería => 400; parseInt lo trunca a 1 y responde 200 | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_estudiante="12abc" debería => 400 (parseInt parcial) | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_estudiante="1.9" debería => 400 (decimal truncado a 1) | AssertionError: expected 200 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_estudiante=2147483648 (int4 max + 1) debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 02 | ids (id_seccion, id_materia, id_estudiante): equivalencias y límites [DEFECTO] id_estudiante=99999999999999999999 debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 03 | Forma de la respuesta [DEFECTO] catalogos.secciones debería estar en orden natural (7-1 … 11-3); hoy usa orden lexicográfico de BD (10-1 antes de 7-1) | AssertionError: expected '10-1' to be '7-1' // Object.is equality |
| 04 | Clases inválidas / límites [DEFECTO] idSeccion="1abc" debería => 400 (parseInt parcial lo acepta como 1) | AssertionError: expected 200 to be 400 // Object.is equality |
| 04 | Clases inválidas / límites [DEFECTO] idSeccion=2147483648 debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 04 | Clases inválidas / límites [DEFECTO] anio=-5 debería => 400, no 500 (genera fecha "-5-01-01") | AssertionError: expected 500 to be 400 // Object.is equality |
| 04 | Clases inválidas / límites [DEFECTO] anio=0 debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 04 | Clases inválidas / límites [DEFECTO] anio=99999999999 debería => 400, no 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 05 | Errores en el endpoint PDF [DEFECTO-SEGURIDAD] si falla la consulta de revocación (jwt_revocado) un token REVOCADO se acepta (fail-open); debería => 401/503 | AssertionError: expected 200 not to be 200 // Object.is equality |
| 05 | Errores en el endpoint PDF [DEFECTO] fecha imposible (2025-02-30) en PDF debería => 400; hoy => 500 | AssertionError: expected 500 to be 400 // Object.is equality |
| 05 | Errores en el endpoint PDF [DEFECTO] fecha_inicio como arreglo (fecha_inicio[]=…) en PDF debería => 400; hoy => 200 | AssertionError: expected 200 to be 400 // Object.is equality |
| 06 | Formato de errores [DEFECTO] errores 500 de BD exponen el mensaje interno de PostgreSQL cuando NODE_ENV≠production | AssertionError: expected 'date/time field value out of range: "…' not to match /date\/ti…/time field value out of range |
| 08 | Privacidad de id_estudiante [DEFECTO-PRIVACIDAD] id_estudiante de una persona que no es estudiante (encargado, id 6) no debería devolver su nombre/cédula | AssertionError: expected '1-0000-0006' to be null |
| 09 | Años con menos de 4 cifras significativas [DEFECTO] anual con fecha_referencia=0050-06-01 debería cubrir 0050 (o => 400); hoy calcula 1950 | AssertionError: expected false to be true // Object.is equality |
| 09 | Años con menos de 4 cifras significativas [DEFECTO] mensual con fecha_referencia=0001-01-15 debería => 0001-01 (o 400); hoy => 1901-01 | AssertionError: expected false to be true // Object.is equality |
| 10 | Bloqueo del event loop por el PDF [DEFECTO-RENDIMIENTO] una petición ligera concurrente con un PDF anual de 20k incidencias debería responder en < 1 s | AssertionError: expected 18713.1723 to be less than 1000 |

### 4.2 Pruebas que PASARON

<details><summary>287 pruebas (expandir)</summary>


**01_autenticacion_roles.test.mjs**

- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia sin cookie => 401
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol epi => 200
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol administrador => 200
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol super_administrador => 200
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol profesor => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol orientador => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol padre_de_familia => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol estudiante => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol sin_rol => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia rol EPI_mayus => 403
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes sin cookie => 401
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol epi => 200
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol administrador => 200
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol super_administrador => 200
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol profesor => 403
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol orientador => 403
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol padre_de_familia => 403
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol estudiante => 403
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol sin_rol => 403
- Matriz de roles sobre endpoints EPI /api/epi/secciones/1/estudiantes rol EPI_mayus => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf sin cookie => 401
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol epi => 200
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol administrador => 200
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol super_administrador => 200
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol profesor => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol orientador => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol padre_de_familia => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol estudiante => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol sin_rol => 403
- Matriz de roles sobre endpoints EPI /api/epi/reporte-asistencia/pdf rol EPI_mayus => 403
- Validación del token / sesión cookie con basura (no base64 válido) => 401
- Validación del token / sesión JWT sin cifrar en la cookie => 401
- Validación del token / sesión cookie cifrada con otra clave => 401
- Validación del token / sesión JWT firmado con otro secreto => 403
- Validación del token / sesión JWT expirado => 403
- Validación del token / sesión JWT HS512 (algoritmo no permitido) => 403
- Validación del token / sesión JWT alg=none => 403
- Validación del token / sesión JWT con id no numérico => 403
- Validación del token / sesión JWT de usuario inexistente => 403
- Validación del token / sesión persona inactiva => 403
- Validación del token / sesión cuenta de sistema inactiva => 403
- Validación del token / sesión persona sin usuario de sistema => 403
- Validación del token / sesión el rol se toma de la BD, no del JWT (profesor con rol=epi en el token) => 403
- Validación del token / sesión JWT con rol=profesor pero BD dice epi => 200
- Validación del token / sesión jti revocado => 401
- Validación del token / sesión token sin jti (legado) es aceptado => 200
- Validación del token / sesión token en header Authorization (no cookie) => 401
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas sin cookie => 401
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas rol administrador => 200
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas rol super_administrador => 200
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas rol orientador => 200
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas rol epi => 403
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas rol profesor => 403
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/estadisticas rol padre_de_familia => 403
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas sin cookie => 401
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas rol administrador => 200
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas rol super_administrador => 200
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas rol orientador => 200
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas rol epi => 403
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas rol profesor => 403
- Matriz de roles sobre /api/reportes/* (control de regresión) /api/reportes/permanencia-alertas rol padre_de_familia => 403

**02_reporte_json_parametros.test.mjs**

- periodo: clases válidas y cálculo de rango semanal (miércoles 2025-03-12) => lunes 10 a domingo 16
- periodo: clases válidas y cálculo de rango semanal con referencia lunes (límite inferior de la semana)
- periodo: clases válidas y cálculo de rango semanal con referencia domingo (límite superior de la semana)
- periodo: clases válidas y cálculo de rango semanal que cruza cambio de año (2025-01-01 => 2024-12-30 a 2025-01-05)
- periodo: clases válidas y cálculo de rango mensual febrero año no bisiesto => 28 días
- periodo: clases válidas y cálculo de rango mensual febrero año bisiesto => 29 días
- periodo: clases válidas y cálculo de rango mensual diciembre => 31 días
- periodo: clases válidas y cálculo de rango anual => 1 ene a 31 dic
- periodo: clases válidas y cálculo de rango personalizado válido
- periodo: clases válidas y cálculo de rango personalizado de un solo día (inicio = fin, límite)
- periodo: clases válidas y cálculo de rango personalizado 29-feb en año bisiesto => 200
- periodo: clases válidas y cálculo de rango sin parámetros => mensual del mes actual
- periodo: clases válidas y cálculo de rango mensual sin fecha_referencia => mes actual
- periodo: clases válidas y cálculo de rango personalizado ignora fecha_referencia
- periodo / fechas: clases inválidas personalizado sin fechas => 400
- periodo / fechas: clases inválidas personalizado solo con fecha_inicio => 400
- periodo / fechas: clases inválidas personalizado solo con fecha_fin => 400
- periodo / fechas: clases inválidas personalizado con rango invertido => 400
- periodo / fechas: clases inválidas personalizado con rango invertido por 1 día (límite) => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "2025/03/01" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "01-03-2025" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "2025-3-1" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "abc" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "20250301" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "2025-03-01' OR '1'='1" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada "2025-03-01T00:00:00" => 400
- periodo / fechas: clases inválidas personalizado con fecha mal formada " 2025-03-01" => 400
- periodo / fechas: clases inválidas periodo con mayúsculas ("SEMANAL") cae a mensual (observación, 200)
- periodo / fechas: clases inválidas periodo como arreglo (periodo[]=anual) no provoca 500
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion=1 (mínimo válido) => 200 y eco en filtros
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion vacío => se ignora (null)
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="0" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="-1" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="abc" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="; DROP TABLE asistencia;--" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="NaN" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="Infinity" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion="-0" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion=2147483647 (int4 max) => 200 sin datos
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia=1 (mínimo válido) => 200 y eco en filtros
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia vacío => se ignora (null)
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="0" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="-1" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="abc" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="; DROP TABLE asistencia;--" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="NaN" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="Infinity" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia="-0" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_materia=2147483647 (int4 max) => 200 sin datos
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante=1 (mínimo válido) => 200 y eco en filtros
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante vacío => se ignora (null)
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="0" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="-1" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="abc" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="; DROP TABLE asistencia;--" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="NaN" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="Infinity" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante="-0" => 400
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_estudiante=2147483647 (int4 max) => 200 sin datos
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion inexistente (12345) => 200, sin secciones y nombre_seccion null
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id_seccion repetido (id_seccion=1&id_seccion=2) no provoca 500
- ids (id_seccion, id_materia, id_estudiante): equivalencias y límites id con espacios (" 3 ") => se acepta como 3
- Parámetros desconocidos / inyección parámetros extra se ignoran
- Parámetros desconocidos / inyección payload de prototype pollution en query no rompe
- Parámetros desconocidos / inyección fecha_referencia con inyección SQL => se ignora (cae a hoy) y no hay 500
- Parámetros desconocidos / inyección query string muy largo (8 KB) no provoca 500

**03_reporte_json_consistencia.test.mjs**

- Forma de la respuesta contiene filtros, resumen_general, secciones[].materias[] y catalogos
- Forma de la respuesta el JSON no incluye detalle_diario (solo el PDF)
- Forma de la respuesta secciones ordenadas por nombre con orden numérico (7-x antes que 10-x)
- Forma de la respuesta materias dentro de cada sección ordenadas alfabéticamente (es)
- Forma de la respuesta sección y materia sin asistencias no aparecen en secciones[] pero sí en catalogos
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05"}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"mensual","fecha_referencia":"2025-03-20"}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"semanal","fecha_referencia":"2025-09-17"}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"personalizado","fecha_inicio":"2025-02-01","fecha_fin":"2025-02-01"}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"personalizado","fecha_inicio":"2025-04-01","fecha_fin":"2025-06-30"}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05","id_seccion":3}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05","id_materia":2}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05","id_seccion":3,"id_materia":2}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05","id_estudiante":1005}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05","id_seccion":1,"id_materia":4,"id_estudiante":1005}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2025-05-05","id_seccion":2,"id_estudiante":1005}
- Coherencia matemática y oráculo coherencia + oráculo para {"periodo":"anual","fecha_referencia":"2024-05-05"}
- Coherencia matemática y oráculo filtros nombre_* se completan cuando hay selección
- Coherencia matemática y oráculo id_estudiante que no es estudiante (id de un usuario administrador) => 200 y expone su nombre/cédula (observación)
- Fórmula de % y redondeo (datos controlados) 1 registros (presente) => 100%
- Fórmula de % y redondeo (datos controlados) 1 registros (ausente) => 0%
- Fórmula de % y redondeo (datos controlados) 1 registros (tardanza) => 100%
- Fórmula de % y redondeo (datos controlados) 1 registros (justificado) => 0%
- Fórmula de % y redondeo (datos controlados) 3 registros (presente+ausente) => 33.3%
- Fórmula de % y redondeo (datos controlados) 3 registros (presente+ausente) => 66.7%
- Fórmula de % y redondeo (datos controlados) 4 registros (presente+tardanza+ausente+justificado) => 50%
- Fórmula de % y redondeo (datos controlados) 1000 registros (presente+ausente) => 99.9%
- Fórmula de % y redondeo (datos controlados) 2000 registros (presente+ausente) => 100%
- Fórmula de % y redondeo (datos controlados) 7 registros (presente+ausente) => 14.3%
- Fórmula de % y redondeo (datos controlados) sin registros => porcentaje 0 (no NaN) y total 0
- Fórmula de % y redondeo (datos controlados) [OBSERVACIÓN] un estado fuera del enum cae en "otros" y cuenta en el total (baja el %)
- Fórmula de % y redondeo (datos controlados) fechas como objetos Date (como devuelve pg) se procesan igual

**04_estudiantes_seccion.test.mjs**

- Clases válidas sección 1, año 2025 => 200 con forma {id_seccion, anio, estudiantes[]}
- Clases válidas incluye matriculados activos (29) + el de matrícula cancelada que tiene asistencia (1) = 30, sin duplicados
- Clases válidas ordenados por nombre (localeCompare es)
- Clases válidas sin anio => usa el año actual
- Clases válidas anio no numérico ("abc") => cae al año actual (200)
- Clases válidas año anterior (2024) sin matrícula pero con 1 asistencia => lista solo ese estudiante
- Clases válidas sección vacía (99) => lista vacía
- Clases válidas sección inexistente (5000) => 200 con lista vacía (no 404)
- Clases inválidas / límites idSeccion=0 => 400
- Clases inválidas / límites idSeccion=-1 => 400
- Clases inválidas / límites idSeccion=abc => 400
- Clases inválidas / límites idSeccion=NaN => 400
- Clases inválidas / límites idSeccion='%20OR%201=1-- => 400
- Clases inválidas / límites anio=1900 (pasado lejano) => 200 y lista vacía
- Clases inválidas / límites ruta sin id (/api/epi/secciones//estudiantes) => 404

**05_reporte_pdf.test.mjs**

- Respuesta PDF mensual => 200, application/pdf, attachment con nombre esperado, %PDF válido
- Respuesta PDF filename para semanal
- Respuesta PDF filename para anual
- Respuesta PDF filename para personalizado
- Respuesta PDF periodo sin datos (2030) => PDF válido con mensaje de vacío y 2 páginas
- Respuesta PDF filtro por estudiante => PDF con todas sus marcas (incluye "Presente")
- Respuesta PDF filtro combinado sección + materia + estudiante => 200 y PDF válido
- Respuesta PDF estudiante con nombre muy largo, tildes, ñ y <script> => PDF válido
- Respuesta PDF más filas => más páginas (anual > semanal)
- Respuesta PDF content streams FlateDecode inflables (PDF bien formado, >1 página)
- Errores en el endpoint PDF personalizado sin fechas => 400 JSON (no PDF)
- Errores en el endpoint PDF id_seccion=abc => 400 JSON
- Errores en el endpoint PDF rango invertido => 400
- Errores en el endpoint PDF fallo de BD en la consulta del reporte => 500 JSON con formato del errorHandler (no PDF parcial)
- Errores en el endpoint PDF fallo de BD en el middleware (consulta de persona) => no 200
- Contenido de detalle diario (datos controlados) sin estudiante: el detalle solo lista incidencias (no presentes) — tamaño no crece con presentes

**06_http_general.test.mjs**

- Rutas desconocidas => 404 con formato del errorHandler GET /api/epi => 404
- Rutas desconocidas => 404 con formato del errorHandler GET /api/epi/reporte => 404
- Rutas desconocidas => 404 con formato del errorHandler GET /api/epi/reporte-asistencia/xlsx => 404
- Rutas desconocidas => 404 con formato del errorHandler GET /api/epi/secciones/1 => 404
- Rutas desconocidas => 404 con formato del errorHandler GET /api/EPI/reporte-asistencia-x => 404
- Rutas desconocidas => 404 con formato del errorHandler GET /api/noexiste => 404
- Rutas desconocidas => 404 con formato del errorHandler GET /epi/reporte-asistencia => 404
- Rutas desconocidas => 404 con formato del errorHandler en NODE_ENV=test el mensaje 404 incluye la URL (en producción no) — observación
- Métodos HTTP no permitidos POST /api/epi/reporte-asistencia => 404 (Express no distingue 405)
- Métodos HTTP no permitidos PUT /api/epi/reporte-asistencia => 404 (Express no distingue 405)
- Métodos HTTP no permitidos PATCH /api/epi/reporte-asistencia => 404 (Express no distingue 405)
- Métodos HTTP no permitidos DELETE /api/epi/reporte-asistencia => 404 (Express no distingue 405)
- Métodos HTTP no permitidos HEAD /api/epi/reporte-asistencia => igual que GET sin cuerpo (200 con sesión)
- Métodos HTTP no permitidos HEAD /api/epi/reporte-asistencia sin sesión => 401
- Métodos HTTP no permitidos POST /api/epi/reporte-asistencia/pdf => 404 (Express no distingue 405)
- Métodos HTTP no permitidos PUT /api/epi/reporte-asistencia/pdf => 404 (Express no distingue 405)
- Métodos HTTP no permitidos PATCH /api/epi/reporte-asistencia/pdf => 404 (Express no distingue 405)
- Métodos HTTP no permitidos DELETE /api/epi/reporte-asistencia/pdf => 404 (Express no distingue 405)
- Métodos HTTP no permitidos HEAD /api/epi/reporte-asistencia/pdf => igual que GET sin cuerpo (200 con sesión)
- Métodos HTTP no permitidos HEAD /api/epi/reporte-asistencia/pdf sin sesión => 401
- Métodos HTTP no permitidos POST /api/epi/secciones/1/estudiantes => 404 (Express no distingue 405)
- Métodos HTTP no permitidos PUT /api/epi/secciones/1/estudiantes => 404 (Express no distingue 405)
- Métodos HTTP no permitidos PATCH /api/epi/secciones/1/estudiantes => 404 (Express no distingue 405)
- Métodos HTTP no permitidos DELETE /api/epi/secciones/1/estudiantes => 404 (Express no distingue 405)
- Métodos HTTP no permitidos HEAD /api/epi/secciones/1/estudiantes => igual que GET sin cuerpo (200 con sesión)
- Métodos HTTP no permitidos HEAD /api/epi/secciones/1/estudiantes sin sesión => 401
- Métodos HTTP no permitidos [OBSERVACIÓN] POST a ruta existente responde 404 en vez de 405 + Allow
- Variantes de ruta barra final (/api/epi/reporte-asistencia/) => 200 (Express no estricto)
- Variantes de ruta mayúsculas en la ruta (/api/EPI/REPORTE-ASISTENCIA) => 200 (Express no sensible a mayúsculas)
- Variantes de ruta id con codificación URL (%31 = "1") => 200
- Variantes de ruta id con path traversal codificado (..%2F) => 400 o 404, nunca 500
- Variantes de ruta URI mal codificada (%E0%A4%A) => 400, nunca 500
- Formato de errores 400 de validación usa {status, message, code, error}
- Formato de errores [OBSERVACIÓN] 401/403 usan formatos distintos ({mensaje} vs {error}) al de 400/404 ({status,message,code,error})
- Formato de errores respuestas JSON llevan charset utf-8
- Formato de errores [OBSERVACIÓN] la respuesta JSON no lleva Cache-Control: no-store pese a contener datos personales
- Aislamiento bajo concurrencia 40 peticiones paralelas con filtros distintos devuelven cada una su propio resultado (oráculo)
- Aislamiento bajo concurrencia 10 PDF paralelos con roles distintos => todos 200 y PDF válido
- Aislamiento bajo concurrencia mezcla paralela de 401/403/200 no contamina req.user entre peticiones

**07_casos_adicionales.test.mjs**

- errorHandler en NODE_ENV=production 500 de BD => mensaje genérico "Error interno del servidor"
- errorHandler en NODE_ENV=production 404 => "Ruta no encontrada" sin eco de la URL
- errorHandler en NODE_ENV=production 400 de validación conserva su mensaje en producción
- Orden de validación sin sesión + parámetros inválidos => 401 (la autenticación va antes que la validación)
- Orden de validación rol no autorizado + parámetros inválidos => 403
- Orden de validación personalizado inválido Y id inválido => 400 por fechas (primera validación)
- PDF: combinaciones de filtros (matriz 2x2x2) sección=- materia=- estudiante=- => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=- materia=- estudiante=1031 => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=- materia=3 estudiante=- => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=- materia=3 estudiante=1031 => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=2 materia=- estudiante=- => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=2 materia=- estudiante=1031 => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=2 materia=3 estudiante=- => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) sección=2 materia=3 estudiante=1031 => PDF válido
- PDF: combinaciones de filtros (matriz 2x2x2) PDF y JSON con mismos filtros reportan el mismo periodo (filename = filtros JSON)
- Límites de calendario semanal con referencia 2024-02-29 (bisiesto) => 26-feb a 3-mar
- Límites de calendario semanal con referencia 2025-12-31 => 29-dic-2025 a 4-ene-2026
- Límites de calendario anual con año 9999 => 200 sin datos
- Límites de calendario anual con año 0000 => no 500
- Límites de calendario registro en el último segundo del rango (fecha = fecha_fin) se incluye
- Cabeceras de seguridad en el PDF [OBSERVACIÓN] PDF con datos personales sin Cache-Control: no-store
- Cabeceras de seguridad en el PDF [OBSERVACIÓN] filename del Content-Disposition sin comillas (RFC 6266 recomienda filename="…")
- Cabeceras de seguridad en el PDF PDF no envía Content-Length (streaming chunked)

**08_robustez_cookies.test.mjs**

- Variantes de cookie cookie token vacía => 401
- Variantes de cookie cookie con base64 de longitud < 28 bytes => 401
- Variantes de cookie cookie con 1 bit alterado (auth tag GCM falla) => 401
- Variantes de cookie cookie muy grande (16 KB de basura) => 401, no 500
- Variantes de cookie dos cookies token (válida + basura): cookie-parser toma la primera
- Variantes de cookie cookie válida con otro nombre (Token) => 401 (nombre sensible a mayúsculas)
- Variantes de cookie JWT con id como string numérico ("1") => 200
- Variantes de cookie [OBSERVACIÓN] JWT con id "1abc" se acepta como id 1 (parseInt parcial en el middleware)
- Variantes de cookie JWT con nbf futuro => 403

**09_ciclo3_fechas_y_detalle.test.mjs**

- Años con menos de 4 cifras significativas anual con fecha_referencia=1000-06-01 => 1000-01-01..1000-12-31
- Determinismo 10 llamadas idénticas devuelven exactamente el mismo cuerpo
- Determinismo el orden de los parámetros no altera el resultado
- Rol administrador / super_administrador ven lo mismo que epi mismo cuerpo JSON para los tres roles permitidos
- Rol administrador / super_administrador ven lo mismo que epi PDF del administrador es válido

**10_ciclo4_bloqueo_y_carga.test.mjs**

- Estudiantes en paralelo 17 secciones en paralelo => cada respuesta corresponde a su sección

**11_ciclo5_reportes_regresion.test.mjs**

- /api/reportes/estadisticas forma básica y catálogos
- /api/reportes/estadisticas id_seccion=abc => 400
- /api/reportes/estadisticas rango invertido => 400
- /api/reportes/estadisticas mismo rango: nº de filas de matriz_exportacion = total EPI
- /api/reportes/estadisticas mismo rango y sección: por_seccion.total_registros = total sección EPI
- /api/reportes/estadisticas [OBSERVACIÓN] id_seccion=0 es aceptado por /reportes (200) mientras EPI lo rechaza (400): validación inconsistente
- /api/reportes/permanencia-alertas forma básica

**12_ciclo6_tamano_y_fechas_date.test.mjs**

- Tamaño de la respuesta JSON el JSON anual no crece con el volumen (2k vs 60k filas difieren < 10 %)
- Fechas como Date (node-postgres) PDF mensual con fechas Date => válido y mismas páginas que con strings
- Fechas como Date (node-postgres) JSON con fechas Date => mismos totales que con strings

**13_ciclo7_detalle_estudiante.test.mjs**

- Detalle diario por estudiante estudiante con 200 días "presente": con id_estudiante el PDF tiene más páginas que sin él
- Detalle diario por estudiante mismo estudiante + misma fecha + mismo estado en 8 materias => una sola fila (materias agrupadas)

**14_ciclo8_head_pdf.test.mjs**

- HEAD /api/epi/reporte-asistencia/pdf [OBSERVACIÓN] HEAD responde 200 con cabeceras de PDF y ejecuta las mismas consultas que GET (incluye detalle)

**15_ciclo9_vacios_y_unicode.test.mjs**

- Parámetros vacíos y unicode periodo vacío (periodo=) => 200 mensual (fallback)
- Parámetros vacíos y unicode personalizado con fechas vacías => 400
- Parámetros vacíos y unicode fecha con dígitos unicode (٢٠٢٥-٠٣-٠١, árabe-índicos) => 400 en personalizado
- Parámetros vacíos y unicode fecha con espacio final codificado (2025-03-01%20) => 400
- Parámetros vacíos y unicode id con dígitos de ancho completo (１２) => 400
- Parámetros vacíos y unicode id con byte nulo (1%00) => no 500
- Parámetros vacíos y unicode id hexadecimal (0x10) => 400 (parseInt base 10 da 0)

</details>

## 5. Rendimiento (BD simulada; costo app-side)

**Condiciones.** BD simulada en memoria (se mide Express + middlewares + agregación + JSON + pdfkit). Servidor y generador de carga en el mismo proceso/equipo (8 CPU lógicas). La máquina era **compartida con otros dos agentes** que corrían sus propias suites a la vez (se observaron hasta ~11 procesos `node` ajenos y ~41 % de carga de CPU antes de empezar algunos ciclos); por eso hay ciclos “ruidosos” (sobre todo 2, 4 y 5) y se reportan **medianas** y rangos. Las medianas de 5.1–5.3 usan los ciclos 1–7; los ciclos 8–9 (aún más cargados por los otros agentes) están en las tablas completas de 5.x. “app” = latencia total − tiempo dentro del fake. En concurrencia el fake usa caché, así que esas cifras son casi puramente costo de la app.

### 5.1 Latencia secuencial — medianas entre ciclos (ms)

| Endpoint | 10 k filas p50 / p95 / p99 (app p50) | 100 k filas p50 / p95 / p99 (app p50) | 500 k filas p50 / p95 (app p50) |
|---|---|---|---|
| JSON mensual (todo el colegio) | 21 / 54 / 92 (11) | 50 / 88 / 101 (7) | 216–474 / 414–605 (9–19) |
| JSON anual (todo el colegio) | 43 / 62 / 79 (8) | 427 / 750 / 779 (8) | 1 880–2 949 / 3 368–4 342 (14–40) |
| JSON anual sección+materia | 11 / 22 / 26 (4) | 73 / 96 / 99 (5) | 205–553 / 442–826 (4–13) |
| Estudiantes de sección | 17 / 34 / 36 (6) | 89 / 122 / 126 (5) | 271–621 / 469–2 824 (4–13) |
| PDF semanal | 498 / 911 / 911 (493) | 628 / 1 075 / 1 075 (589) | 797–5 817 / 1 031–12 619 |
| PDF mensual | 592 / 798 / 798 (578) | 959 / 1 605 / 1 605 (876) | 2 043–13 017 / 2 202–19 316 |
| PDF anual de una sección | 473 / 581 / 581 (459) | 748 / 1 114 / 1 114 (624) | 1 513–6 180 / 1 675–13 948 |
| PDF anual de un estudiante | 415 / 541 / 541 (413) | 377 / 582 / 582 (373) | 612–1 282 / 985–1 337 |

Lectura: el costo de la app en JSON es de **4–40 ms** y casi no depende del volumen (la agregación la hace la BD; el JSON pesa ~31–32 KB con 2 k o 60 k filas, prueba `12_…`). Lo que crece con el volumen en la columna “total” es el fake (escaneo en memoria), **no** la app. El PDF, en cambio, cuesta **≥ 250–500 ms incluso vacío** y crece con el número de incidencias.

### 5.2 Concurrencia (autocannon; medianas entre ciclos)

| Escenario | Conexiones | 10 k: req/s · p50 · p99 (ms) | 100 k: req/s · p50 · p99 (ms) | 500 k: req/s · p50 · p99 (ms) | Errores |
|---|---|---|---|---|---|
| JSON mensual | 10 | 146 · 66 · 278 | 140 · 58 · 135 | 146–150 · 57–61 · 469–493 | 0 |
| JSON mensual | 50 | 160 · 341 · 591 | 160 · 268 · 634 | 210–230 · 222–241 · 348–516 | 0 |
| JSON mensual | 100 | 185 · 816 · 1 523 | 131 · 882 · 1 432 | 119–184 · 573–664 · 1 162–2 158 | 0 |
| JSON anual | 50 | 150 · 484 · 1 399 | 120 · 371 · 1 511 | 33–117 · 337–846 · 3 078–9 918 | 0 |
| PDF semanal (30 peticiones) | 10 | 1,9 · 7 215 · 14 651 | 1,1 · 8 556 · 18 095 | 0,4–0,6 · 15 166–18 928 · 34 403–53 521 | 0 |
| PDF semanal (50 peticiones) | 50 | 1,4 · 37 140 · 42 790 | 0,9 · 43 479 · 53 264 | 0,2–0,7 · 70 653–273 971 · 73 345–283 331 | 0 |
| PDF mensual (20 peticiones) | 10 | 1,5 · 6 050 · 10 848 | 0,7 · 11 224 · 23 009 | — | 0 |

Lectura: el JSON se satura en ~130–230 req/s en este equipo (un solo proceso Node; el generador comparte CPU), con p99 ≈ 1,4–2,2 s a 100 conexiones. **No hubo errores, timeouts ni respuestas no-2xx en ningún escenario.** El PDF se satura en **≈1–2 PDF/s**: con 50 clientes pidiendo el PDF semanal a la vez la mediana de espera es 37–43 s (10 k–100 k filas) y llegó a 274 s con 500 k.

### 5.3 PDF de todo el colegio (peor caso)

| Filas | Incidencias del periodo | Periodo | Tiempo total (mediana; rango) | Páginas | Tamaño | Event loop bloqueado (máx) |
|---|---|---|---|---|---|---|
| 10 k | 189 | mensual | 828 ms (582–1 487) | 21 | 0,1 MB | 481 ms |
| 10 k | 1 968 | anual | 1 471 ms (1 182–1 652) | 152 | 0,5 MB | 1 193 ms |
| 100 k | 1 866 | mensual | 1 218 ms (1 154–2 797) | 77 | 0,3 MB | 885 ms |
| 100 k | 19 744 | anual | **6 736 ms** (3 539–17 690) | 736 | 2,3 MB | 6 136 ms |
| 500 k | 9 649 | mensual | 2 264 / 6 005 ms | 252 | 0,9 MB | 1 774 / 3 064 ms |
| 500 k | 100 120 | anual | **16 951 / 48 764 ms** | 2 542 | 8,1 MB | 15 460 / 46 674 ms |

Referencia de volumen real: ~510 estudiantes × ~8 lecciones/día × ~190 días ≈ **775 k marcas/año**; con ~20 % de incidencias, el PDF anual de todo el colegio tendría ≈150 k incidencias (más que el peor caso medido).

### 5.4 Barrido de escalado (PDF anual, todas las filas son incidencias)

Ciclos “tranquilos” (3 y 6) — los ciclos 4 y 5 coincidieron con alta carga externa y dieron entre 1,1× y 10× más tiempo (ver tabla completa):

| Incidencias | Tiempo (ciclo 3 / 6) | Páginas | ms/página | RSS tras el PDF | Δ heap total |
|---|---|---|---|---|---|
| 0 | 517 / 455 ms | 2 | — | 162–164 MB | +24 MB |
| 2 500 | 1 820 / 1 556 ms | 186 | 8–10 | 211–214 MB | +35–39 MB |
| 5 000 | 2 225 / 1 655 ms | 303 | 5–7 | 241–242 MB | +44 MB |
| 10 000 | 2 428 / 2 133 ms | 472 | 5 | 255–283 MB | +70–72 MB |
| 20 000 | 4 033 / 3 396 ms | 745 | 5 | 327–349 MB | +79–114 MB |
| **40 000** | **5 745 / 5 553 ms** | 1 234 | 5 | 434–470 MB | +132–202 MB |
| 80 000 | 11 803 / 11 165 ms | 2 143 | 5 | 574–591 MB | +138–318 MB |

**Límite identificado:** el PDF supera **~5 s entre 20 k y 40 k incidencias** (≈1 000–1 200 páginas) y crece linealmente (~5 ms/página). La memoria del proceso sube ~+430 MB de RSS a 80 k incidencias (`bufferPages: true` retiene todas las páginas hasta el final). Durante todo ese tiempo el event loop está bloqueado: la prueba `10_…` midió 3,98 s de espera para una petición ligera concurrente con un PDF de 20 k incidencias.

### 5.5 Desglose del costo fijo del PDF (micro-benchmark con pdfkit y los recursos de la app)

| Variante | p50 ciclo 3 (ms) | p50 ciclo 5 (ms) | Bytes |
|---|---|---|---|
| Documento vacío Helvetica | 15,7 | 10,5 | 1 298 |
| + fuentes Roboto (2 TTF) | 157,7 | 163,9 | 9 034 |
| + logo PNG MEP (4182×704 RGBA) | 177,9 | 218,0 | 65 344 |
| + logo JPG liceo | 3,9 | 4,2 | 18 845 |
| Completo (como la app) | 237,6 | 313,7 | 90 599 |

El perfil de CPU (`--cpu-prof`, 10 PDFs vacíos) confirmó el reparto: `png-js` + `zlib` (≈1,7 s) y `fontkit/restructure` (≈1,4 s) dominan; el código propio del reporte es marginal. Para el JSON (200 peticiones) la función más costosa fue `compararNombre` (≈695 ms, ~3,5 ms/petición).

### 5.6 Estabilidad entre ciclos

`perf/estabilidad.mjs` comparó cada prueba en todos los ciclos: **0 pruebas con resultado distinto entre ciclos** (sin flakiness funcional). La variabilidad está solo en los tiempos (coeficientes de variación altos en los ciclos con carga externa; ver “Variabilidad entre ciclos” en las tablas generadas).

### 5.7 Bitácora de ciclos (qué se agregó en cada uno)

Inicio del trabajo: 18:55:10 (hora local, UTC−6). Fin de ciclos: ≈20:35. Resumen numérico por ciclo (hora UTC, totales) en “Bitácora por ciclo” más abajo.

| Ciclo | Hora local de inicio | Datasets perf | Pruebas nuevas en el ciclo | Total / Pasaron / Fallaron |
|---|---|---|---|---|
| 1 | 19:14 | 10 k, 100 k | 01–07 (suite base) | 284 / 252 / 32 |
| 2 | 19:20 | 10 k, 500 k (+PDF anual 500 k) | 08 robustez de cookies, privacidad id_estudiante | 294 / 261 / 33 |
| 3 | 19:33 | 10 k, 100 k + barrido de escalado + micro-benchmark | 09 años <4 cifras, determinismo, roles | 301 / 266 / 35 |
| 4 | 19:41 | 10 k, 100 k + barrido | 10 bloqueo del event loop, estudiantes en paralelo | 303 / 267 / 36 |
| 5 | 19:47 | 10 k, 100 k + barrido + micro-benchmark | 11 regresión /reportes | 310 / 274 / 36 |
| 6 | 19:57 | 10 k, 100 k + barrido | 12 tamaño JSON, fechas Date | 313 / 277 / 36 |
| 7 | 20:05 | 500 k (+PDF anual 500 k) | 13 detalle diario por estudiante | 315 / 279 / 36 |
| 8 | 20:10 | 10 k, 100 k + barrido | 14 HEAD sobre PDF | 316 / 280 / 36 |
| 9 | 20:20 | 10 k, 100 k | 15 vacíos/unicode/hex | 323 / 287 / 36 |
| 10 | 20:29 | 10 k (modo rápido) | — (re-ejecución para variabilidad) | 323 / 287 / 36 |
| 11 | 20:31 | 10 k, 100 k | — (re-ejecución para variabilidad) | 323 / 287 / 36 |
| 12 | 20:40 | 10 k, 100 k | — (re-ejecución final para variabilidad) | 323 / 287 / 36 |

El número de fallos solo creció cuando se agregaron nuevas pruebas `[DEFECTO]`; ninguna prueba existente cambió de estado.

### 5.x Tablas completas por ciclo (generadas)

#### Bitácora por ciclo

| Ciclo | Inicio (UTC) | Tests | Pasaron | Fallaron | Suite (s) | Perf (s) | Datasets |
|---|---|---|---|---|---|---|---|
| 1 | 01:14:28 | 284 | 252 | 32 | 30 | 296 | 10000, 100000 |
| 2 | 01:20:12 | 294 | 261 | 33 | 33 | 739 | 10000, 500000 |
| 3 | 01:33:21 | 301 | 266 | 35 | 36 | 291 | 10000, 100000 |
| 4 | 01:41:01 | 303 | 267 | 36 | 20 | 251 | 10000, 100000 |
| 5 | 01:47:15 | 310 | 274 | 36 | 28 | 374 | 10000, 100000 |
| 6 | 01:57:13 | 313 | 277 | 36 | 54 | 341 | 10000, 100000 |
| 7 | 02:05:04 | 315 | 279 | 36 | 71 | 215 | 500000 |
| 8 | 02:10:33 | 316 | 280 | 36 | 47 | 433 | 10000, 100000 |
| 9 | 02:20:27 | 323 | 287 | 36 | 83 | 381 | 10000, 100000 |
| 10 | 02:28:50 | 323 | 287 | 36 | 32 | 96 | 10000 |
| 11 | 02:31:07 | 323 | 287 | 36 | 73 | 419 | 10000, 100000 |
| 12 | 02:39:41 | 323 | 287 | 36 | 68 | 395 | 10000, 100000 |

#### Secuencial (ms) por ciclo y dataset

| Ciclo | Filas | Endpoint | n | p50 | p95 | p99 | app p50 | app p95 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 10000 | json_mensual | 30 | 21 | 49.5 | 92.3 | 11.6 | 16.3 | 92.3 |
| 1 | 10000 | json_anual | 30 | 43.3 | 62.2 | 79.1 | 8.3 | 11.8 | 79.1 |
| 1 | 10000 | json_anual_filtrado | 30 | 10.5 | 15.9 | 18.7 | 4.3 | 5.9 | 18.7 |
| 1 | 10000 | estudiantes | 30 | 16.7 | 34.9 | 35.8 | 6.3 | 11.2 | 35.8 |
| 1 | 10000 | pdf_semanal | 8 | 497.5 | 911 | 911 | 492.8 | 902.1 | 911 |
| 1 | 10000 | pdf_mensual | 8 | 707.8 | 1442.1 | 1442.1 | 693.7 | 1423.1 | 1442.1 |
| 1 | 10000 | pdf_anual_seccion | 8 | 467.7 | 580.5 | 580.5 | 459.3 | 565.7 | 580.5 |
| 1 | 10000 | pdf_anual_estudiante | 8 | 302.9 | 403.7 | 403.7 | 302.3 | 401 | 403.7 |
| 1 | 100000 | json_mensual | 30 | 46.6 | 75.3 | 77.3 | 6.5 | 8.9 | 77.3 |
| 1 | 100000 | json_anual | 30 | 371.1 | 602.2 | 664 | 7 | 21.4 | 664 |
| 1 | 100000 | json_anual_filtrado | 30 | 57.8 | 77.9 | 79.9 | 3.7 | 5.8 | 79.9 |
| 1 | 100000 | estudiantes | 30 | 88.6 | 132.1 | 150.9 | 5.6 | 10.8 | 150.9 |
| 1 | 100000 | pdf_semanal | 8 | 559.3 | 1360.9 | 1360.9 | 537.1 | 1158.3 | 1360.9 |
| 1 | 100000 | pdf_mensual | 8 | 886.1 | 1437.8 | 1437.8 | 820.4 | 1310.8 | 1437.8 |
| 1 | 100000 | pdf_anual_seccion | 8 | 618.7 | 711.9 | 711.9 | 512 | 594.2 | 711.9 |
| 1 | 100000 | pdf_anual_estudiante | 8 | 359.4 | 457 | 457 | 356.3 | 453.7 | 457 |
| 2 | 10000 | json_mensual | 30 | 20.1 | 55.3 | 114.4 | 10.3 | 31.5 | 114.4 |
| 2 | 10000 | json_anual | 30 | 37.7 | 53.5 | 53.9 | 6.9 | 9.4 | 53.9 |
| 2 | 10000 | json_anual_filtrado | 30 | 10.1 | 16.5 | 25.8 | 4.2 | 7.5 | 25.8 |
| 2 | 10000 | estudiantes | 30 | 17.5 | 33.6 | 37.9 | 7.1 | 10.5 | 37.9 |
| 2 | 10000 | pdf_semanal | 8 | 445.1 | 610.4 | 610.4 | 441.2 | 605.7 | 610.4 |
| 2 | 10000 | pdf_mensual | 8 | 592.3 | 1090.5 | 1090.5 | 577.7 | 1079.5 | 1090.5 |
| 2 | 10000 | pdf_anual_seccion | 8 | 567.1 | 1071.9 | 1071.9 | 550.3 | 1007.7 | 1071.9 |
| 2 | 10000 | pdf_anual_estudiante | 8 | 432.2 | 519.1 | 519.1 | 431.1 | 518.6 | 519.1 |
| 2 | 500000 | json_mensual | 10 | 474 | 605.1 | 605.1 | 19.3 | 71 | 605.1 |
| 2 | 500000 | json_anual | 10 | 2948.9 | 4341.9 | 4341.9 | 40 | 96.9 | 4341.9 |
| 2 | 500000 | json_anual_filtrado | 10 | 552.9 | 825.7 | 825.7 | 12.8 | 20.5 | 825.7 |
| 2 | 500000 | estudiantes | 10 | 621.2 | 2824.2 | 2824.2 | 12.7 | 105.9 | 2824.2 |
| 2 | 500000 | pdf_semanal | 3 | 5816.6 | 12618.8 | 12618.8 | 4448.8 | 5396.9 | 12618.8 |
| 2 | 500000 | pdf_mensual | 3 | 13017.4 | 19316.1 | 19316.1 | 11811.4 | 13863.3 | 19316.1 |
| 2 | 500000 | pdf_anual_seccion | 3 | 6180.3 | 13948.1 | 13948.1 | 3363.6 | 5482.7 | 13948.1 |
| 2 | 500000 | pdf_anual_estudiante | 3 | 1281.5 | 1336.7 | 1336.7 | 1137.8 | 1195.1 | 1336.7 |
| 3 | 10000 | json_mensual | 30 | 30.7 | 54.1 | 79.7 | 15.9 | 40.5 | 79.7 |
| 3 | 10000 | json_anual | 30 | 73.3 | 111.1 | 112.4 | 11.9 | 21.3 | 112.4 |
| 3 | 10000 | json_anual_filtrado | 30 | 16.7 | 31.6 | 32.9 | 6.3 | 8.1 | 32.9 |
| 3 | 10000 | estudiantes | 30 | 16.6 | 35.7 | 37.4 | 5.8 | 9 | 37.4 |
| 3 | 10000 | pdf_semanal | 8 | 459.2 | 894.5 | 894.5 | 450.3 | 887.4 | 894.5 |
| 3 | 10000 | pdf_mensual | 8 | 562.1 | 700.8 | 700.8 | 548.5 | 692.6 | 700.8 |
| 3 | 10000 | pdf_anual_seccion | 8 | 377.4 | 528.8 | 528.8 | 368.4 | 514.7 | 528.8 |
| 3 | 10000 | pdf_anual_estudiante | 8 | 398.6 | 541 | 541 | 398 | 537 | 541 |
| 3 | 100000 | json_mensual | 30 | 51.6 | 88.2 | 103 | 6.9 | 10 | 103 |
| 3 | 100000 | json_anual | 30 | 483.6 | 1050.5 | 1255.4 | 9.1 | 22.7 | 1255.4 |
| 3 | 100000 | json_anual_filtrado | 30 | 144.2 | 247 | 283.7 | 8.5 | 31.8 | 283.7 |
| 3 | 100000 | estudiantes | 30 | 158.4 | 233.5 | 300.3 | 7.6 | 30.3 | 300.3 |
| 3 | 100000 | pdf_semanal | 8 | 690.4 | 1075 | 1075 | 647.3 | 1011.1 | 1075 |
| 3 | 100000 | pdf_mensual | 8 | 959.4 | 1105.4 | 1105.4 | 875.8 | 1004.1 | 1105.4 |
| 3 | 100000 | pdf_anual_seccion | 8 | 635.8 | 751.9 | 751.9 | 524.1 | 642.4 | 751.9 |
| 3 | 100000 | pdf_anual_estudiante | 8 | 377.2 | 563.7 | 563.7 | 373.3 | 557.8 | 563.7 |
| 4 | 10000 | json_mensual | 30 | 11.5 | 25.4 | 32.6 | 6.6 | 12.8 | 32.6 |
| 4 | 10000 | json_anual | 30 | 31.5 | 41.6 | 42 | 5.4 | 6.6 | 42 |
| 4 | 10000 | json_anual_filtrado | 30 | 7.7 | 11.4 | 12.5 | 3.1 | 4.6 | 12.5 |
| 4 | 10000 | estudiantes | 30 | 10.5 | 16.4 | 16.7 | 4 | 4.9 | 16.7 |
| 4 | 10000 | pdf_semanal | 8 | 284.1 | 445.7 | 445.7 | 281.9 | 442.3 | 445.7 |
| 4 | 10000 | pdf_mensual | 8 | 343.4 | 390.8 | 390.8 | 336.7 | 384.8 | 390.8 |
| 4 | 10000 | pdf_anual_seccion | 8 | 289.7 | 517 | 517 | 277.4 | 506.7 | 517 |
| 4 | 10000 | pdf_anual_estudiante | 8 | 244.3 | 270.3 | 270.3 | 243.9 | 269.9 | 270.3 |
| 4 | 100000 | json_mensual | 30 | 50.3 | 95.6 | 101.2 | 6.9 | 10.1 | 101.2 |
| 4 | 100000 | json_anual | 30 | 449 | 750.2 | 779.1 | 8.7 | 28.3 | 779.1 |
| 4 | 100000 | json_anual_filtrado | 30 | 79.1 | 116.6 | 130.4 | 5.1 | 10.6 | 130.4 |
| 4 | 100000 | estudiantes | 30 | 76.8 | 100.6 | 103.7 | 4.8 | 7.5 | 103.7 |
| 4 | 100000 | pdf_semanal | 8 | 733.4 | 1184 | 1184 | 692.6 | 1081.1 | 1184 |
| 4 | 100000 | pdf_mensual | 8 | 923.1 | 1725.8 | 1725.8 | 758 | 1592.4 | 1725.8 |
| 4 | 100000 | pdf_anual_seccion | 8 | 1132.9 | 1326.3 | 1326.3 | 919.5 | 1191.7 | 1326.3 |
| 4 | 100000 | pdf_anual_estudiante | 8 | 420.6 | 965.9 | 965.9 | 415.8 | 963 | 965.9 |
| 5 | 10000 | json_mensual | 30 | 21.4 | 67 | 148.1 | 11.4 | 35.5 | 148.1 |
| 5 | 10000 | json_anual | 30 | 38.6 | 47.2 | 50.5 | 6.9 | 9.6 | 50.5 |
| 5 | 10000 | json_anual_filtrado | 30 | 9.4 | 22.9 | 26.5 | 4.3 | 6.8 | 26.5 |
| 5 | 10000 | estudiantes | 30 | 14.1 | 28.1 | 33.7 | 5.7 | 8.1 | 33.7 |
| 5 | 10000 | pdf_semanal | 8 | 613.7 | 1706.8 | 1706.8 | 606.6 | 1703.3 | 1706.8 |
| 5 | 10000 | pdf_mensual | 8 | 658.3 | 797.7 | 797.7 | 646.2 | 781.6 | 797.7 |
| 5 | 10000 | pdf_anual_seccion | 8 | 472.9 | 525.8 | 525.8 | 456.2 | 510.3 | 525.8 |
| 5 | 10000 | pdf_anual_estudiante | 8 | 415.1 | 1159.7 | 1159.7 | 412.6 | 1156.7 | 1159.7 |
| 5 | 100000 | json_mensual | 30 | 48 | 76.9 | 93.6 | 6.8 | 9.9 | 93.6 |
| 5 | 100000 | json_anual | 30 | 426.6 | 917 | 938.3 | 8.2 | 23.9 | 938.3 |
| 5 | 100000 | json_anual_filtrado | 30 | 72.7 | 95.9 | 99.1 | 4.9 | 7.7 | 99.1 |
| 5 | 100000 | estudiantes | 30 | 90.6 | 121.5 | 126.2 | 5.4 | 8.1 | 126.2 |
| 5 | 100000 | pdf_semanal | 8 | 628.4 | 821.5 | 821.5 | 589.4 | 755.5 | 821.5 |
| 5 | 100000 | pdf_mensual | 8 | 1367.5 | 2397.3 | 2397.3 | 1260.4 | 2255 | 2397.3 |
| 5 | 100000 | pdf_anual_seccion | 8 | 851.2 | 1190.3 | 1190.3 | 697.4 | 1072.4 | 1190.3 |
| 5 | 100000 | pdf_anual_estudiante | 8 | 362.6 | 581.5 | 581.5 | 359.5 | 576.4 | 581.5 |
| 6 | 10000 | json_mensual | 30 | 15.3 | 32.3 | 56.7 | 9 | 17.7 | 56.7 |
| 6 | 10000 | json_anual | 30 | 48.5 | 87.5 | 124.8 | 9.3 | 15.5 | 124.8 |
| 6 | 10000 | json_anual_filtrado | 30 | 10.8 | 22.4 | 25.1 | 4.8 | 7.3 | 25.1 |
| 6 | 10000 | estudiantes | 30 | 15.5 | 23.7 | 27.5 | 6.1 | 8.6 | 27.5 |
| 6 | 10000 | pdf_semanal | 8 | 649.2 | 1886.7 | 1886.7 | 641.6 | 1873.1 | 1886.7 |
| 6 | 10000 | pdf_mensual | 8 | 558.9 | 780.6 | 780.6 | 543 | 771.2 | 780.6 |
| 6 | 10000 | pdf_anual_seccion | 8 | 684.9 | 2606 | 2606 | 665 | 2598.7 | 2606 |
| 6 | 10000 | pdf_anual_estudiante | 8 | 435 | 599.3 | 599.3 | 434 | 597.7 | 599.3 |
| 6 | 100000 | json_mensual | 30 | 52 | 104.4 | 133.8 | 7.1 | 12.7 | 133.8 |
| 6 | 100000 | json_anual | 30 | 337 | 488.9 | 510.8 | 6.4 | 9.7 | 510.8 |
| 6 | 100000 | json_anual_filtrado | 30 | 53.9 | 73.9 | 76.1 | 3.4 | 4.3 | 76.1 |
| 6 | 100000 | estudiantes | 30 | 69.6 | 89.1 | 110.9 | 3.7 | 5.3 | 110.9 |
| 6 | 100000 | pdf_semanal | 8 | 481.5 | 544 | 544 | 453.7 | 513.3 | 544 |
| 6 | 100000 | pdf_mensual | 8 | 1424.4 | 1605 | 1605 | 1300.1 | 1539.7 | 1605 |
| 6 | 100000 | pdf_anual_seccion | 8 | 748.2 | 1113.8 | 1113.8 | 624.2 | 951.1 | 1113.8 |
| 6 | 100000 | pdf_anual_estudiante | 8 | 391.4 | 590.2 | 590.2 | 385.1 | 586.8 | 590.2 |
| 7 | 500000 | json_mensual | 10 | 215.5 | 413.6 | 413.6 | 8.8 | 32.7 | 413.6 |
| 7 | 500000 | json_anual | 10 | 1879.6 | 3367.5 | 3367.5 | 14.2 | 19.9 | 3367.5 |
| 7 | 500000 | json_anual_filtrado | 10 | 205.4 | 441.9 | 441.9 | 3.7 | 5.2 | 441.9 |
| 7 | 500000 | estudiantes | 10 | 270.6 | 468.8 | 468.8 | 4.1 | 14.1 | 468.8 |
| 7 | 500000 | pdf_semanal | 3 | 796.6 | 1030.8 | 1030.8 | 654.2 | 909.6 | 1030.8 |
| 7 | 500000 | pdf_mensual | 3 | 2043.2 | 2202.4 | 2202.4 | 1735.9 | 1862.4 | 2202.4 |
| 7 | 500000 | pdf_anual_seccion | 3 | 1512.6 | 1674.6 | 1674.6 | 1071 | 1231.3 | 1674.6 |
| 7 | 500000 | pdf_anual_estudiante | 3 | 612.1 | 985.2 | 985.2 | 591.1 | 905.4 | 985.2 |
| 8 | 10000 | json_mensual | 30 | 39.2 | 112.1 | 128.1 | 16 | 81.3 | 128.1 |
| 8 | 10000 | json_anual | 30 | 100.9 | 139.2 | 207.9 | 13.9 | 25.9 | 207.9 |
| 8 | 10000 | json_anual_filtrado | 30 | 19.5 | 47.5 | 50.9 | 7.3 | 18.7 | 50.9 |
| 8 | 10000 | estudiantes | 30 | 27.1 | 61.6 | 73.2 | 8.8 | 17.3 | 73.2 |
| 8 | 10000 | pdf_semanal | 8 | 1267.7 | 2193.7 | 2193.7 | 1222.9 | 2179.7 | 2193.7 |
| 8 | 10000 | pdf_mensual | 8 | 591.2 | 859.7 | 859.7 | 573.4 | 847.7 | 859.7 |
| 8 | 10000 | pdf_anual_seccion | 8 | 365.1 | 921.1 | 921.1 | 356.4 | 898.4 | 921.1 |
| 8 | 10000 | pdf_anual_estudiante | 8 | 285.9 | 661.5 | 661.5 | 284.8 | 660.7 | 661.5 |
| 8 | 100000 | json_mensual | 30 | 64.6 | 91.4 | 124.8 | 8.5 | 11.9 | 124.8 |
| 8 | 100000 | json_anual | 30 | 414.8 | 544.7 | 837.3 | 7.8 | 11.9 | 837.3 |
| 8 | 100000 | json_anual_filtrado | 30 | 81.9 | 187.6 | 206.2 | 4.7 | 10.4 | 206.2 |
| 8 | 100000 | estudiantes | 30 | 128.1 | 193 | 204.7 | 7.1 | 17.1 | 204.7 |
| 8 | 100000 | pdf_semanal | 8 | 630.9 | 943.7 | 943.7 | 593.8 | 887.5 | 943.7 |
| 8 | 100000 | pdf_mensual | 8 | 667.9 | 775.1 | 775.1 | 609 | 714.6 | 775.1 |
| 8 | 100000 | pdf_anual_seccion | 8 | 678.8 | 2910.6 | 2910.6 | 535.5 | 2776.8 | 2910.6 |
| 8 | 100000 | pdf_anual_estudiante | 8 | 1790.9 | 8771.1 | 8771.1 | 1765.1 | 8733.7 | 8771.1 |
| 9 | 10000 | json_mensual | 30 | 15.6 | 28.3 | 43 | 9 | 13.1 | 43 |
| 9 | 10000 | json_anual | 30 | 44 | 69.5 | 74.5 | 8.2 | 11.2 | 74.5 |
| 9 | 10000 | json_anual_filtrado | 30 | 10.3 | 24.3 | 26 | 4.7 | 7 | 26 |
| 9 | 10000 | estudiantes | 30 | 22.6 | 38.7 | 46.6 | 9 | 22.5 | 46.6 |
| 9 | 10000 | pdf_semanal | 8 | 2356.6 | 4319.7 | 4319.7 | 2288.4 | 4257.1 | 4319.7 |
| 9 | 10000 | pdf_mensual | 8 | 2435.8 | 5546.4 | 5546.4 | 2418.7 | 5541.4 | 5546.4 |
| 9 | 10000 | pdf_anual_seccion | 8 | 495.5 | 2176.8 | 2176.8 | 485.8 | 2128.9 | 2176.8 |
| 9 | 10000 | pdf_anual_estudiante | 8 | 361.9 | 835.6 | 835.6 | 361.5 | 834.9 | 835.6 |
| 9 | 100000 | json_mensual | 30 | 69.7 | 109.5 | 109.9 | 9 | 19.8 | 109.9 |
| 9 | 100000 | json_anual | 30 | 445.5 | 596.1 | 765.6 | 8.1 | 12.1 | 765.6 |
| 9 | 100000 | json_anual_filtrado | 30 | 81.5 | 113.2 | 127.8 | 5.1 | 9.1 | 127.8 |
| 9 | 100000 | estudiantes | 30 | 97.6 | 143.1 | 176.4 | 5.2 | 7.2 | 176.4 |
| 9 | 100000 | pdf_semanal | 8 | 682.9 | 3014.8 | 3014.8 | 642.1 | 2971.5 | 3014.8 |
| 9 | 100000 | pdf_mensual | 8 | 1397.9 | 3193.8 | 3193.8 | 1225.5 | 3124.8 | 3193.8 |
| 9 | 100000 | pdf_anual_seccion | 8 | 671.7 | 777.6 | 777.6 | 563.8 | 664.1 | 777.6 |
| 9 | 100000 | pdf_anual_estudiante | 8 | 966 | 7938.2 | 7938.2 | 960.9 | 7929.1 | 7938.2 |
| 10 | 10000 | json_mensual | 10 | 15.3 | 48.9 | 48.9 | 9.1 | 35.9 | 48.9 |
| 10 | 10000 | json_anual | 10 | 47.4 | 50.9 | 50.9 | 8.2 | 9.6 | 50.9 |
| 10 | 10000 | json_anual_filtrado | 10 | 11.3 | 15.9 | 15.9 | 3.9 | 5.3 | 15.9 |
| 10 | 10000 | estudiantes | 10 | 17.2 | 32.2 | 32.2 | 5.8 | 12 | 32.2 |
| 10 | 10000 | pdf_semanal | 3 | 475.8 | 587.5 | 587.5 | 471.2 | 580.4 | 587.5 |
| 10 | 10000 | pdf_mensual | 3 | 393.5 | 447.9 | 447.9 | 387.9 | 432.8 | 447.9 |
| 10 | 10000 | pdf_anual_seccion | 3 | 337.8 | 346 | 346 | 328.8 | 338.2 | 346 |
| 10 | 10000 | pdf_anual_estudiante | 3 | 314.3 | 322.2 | 322.2 | 312.3 | 321.5 | 322.2 |
| 11 | 10000 | json_mensual | 30 | 26.6 | 36.1 | 74 | 14.2 | 21.9 | 74 |
| 11 | 10000 | json_anual | 30 | 68.6 | 103.8 | 105.4 | 11 | 16.2 | 105.4 |
| 11 | 10000 | json_anual_filtrado | 30 | 14.9 | 31.3 | 45 | 5.9 | 11.3 | 45 |
| 11 | 10000 | estudiantes | 30 | 22.5 | 35.6 | 38.4 | 8.1 | 10.8 | 38.4 |
| 11 | 10000 | pdf_semanal | 8 | 670.2 | 862 | 862 | 662.5 | 854.1 | 862 |
| 11 | 10000 | pdf_mensual | 8 | 456.7 | 712.4 | 712.4 | 450.7 | 673.5 | 712.4 |
| 11 | 10000 | pdf_anual_seccion | 8 | 761.4 | 1363.3 | 1363.3 | 737.6 | 1353.4 | 1363.3 |
| 11 | 10000 | pdf_anual_estudiante | 8 | 435.8 | 563.9 | 563.9 | 434.5 | 563 | 563.9 |
| 11 | 100000 | json_mensual | 30 | 72.7 | 109.6 | 115.2 | 9.5 | 13 | 115.2 |
| 11 | 100000 | json_anual | 30 | 575.7 | 1277.5 | 1483.2 | 10.7 | 35.3 | 1483.2 |
| 11 | 100000 | json_anual_filtrado | 30 | 178.4 | 403.5 | 410.9 | 7.2 | 60.5 | 410.9 |
| 11 | 100000 | estudiantes | 30 | 215.5 | 316.5 | 340.2 | 8.6 | 24.4 | 340.2 |
| 11 | 100000 | pdf_semanal | 8 | 2275 | 3955.6 | 3955.6 | 2207.8 | 3834.2 | 3955.6 |
| 11 | 100000 | pdf_mensual | 8 | 1605.3 | 4374 | 4374 | 1464 | 4141.8 | 4374 |
| 11 | 100000 | pdf_anual_seccion | 8 | 1010 | 1314 | 1314 | 812.1 | 1127.4 | 1314 |
| 11 | 100000 | pdf_anual_estudiante | 8 | 656.1 | 1529.5 | 1529.5 | 651.1 | 1523.4 | 1529.5 |
| 12 | 10000 | json_mensual | 30 | 16.7 | 31.9 | 47.5 | 9.6 | 15.4 | 47.5 |
| 12 | 10000 | json_anual | 30 | 50.3 | 62.9 | 64.2 | 7.7 | 11.1 | 64.2 |
| 12 | 10000 | json_anual_filtrado | 30 | 10.7 | 19.5 | 21.1 | 4.6 | 5.9 | 21.1 |
| 12 | 10000 | estudiantes | 30 | 20.6 | 44.4 | 45.3 | 7.7 | 16.5 | 45.3 |
| 12 | 10000 | pdf_semanal | 8 | 485.9 | 846.7 | 846.7 | 476.5 | 841.3 | 846.7 |
| 12 | 10000 | pdf_mensual | 8 | 1220.9 | 6272.2 | 6272.2 | 1206.4 | 6254.9 | 6272.2 |
| 12 | 10000 | pdf_anual_seccion | 8 | 5118.7 | 7679.4 | 7679.4 | 5092.8 | 7644.9 | 7679.4 |
| 12 | 10000 | pdf_anual_estudiante | 8 | 841.5 | 3578 | 3578 | 829.9 | 3577 | 3578 |
| 12 | 100000 | json_mensual | 30 | 59.1 | 118.5 | 123.6 | 7.7 | 17.7 | 123.6 |
| 12 | 100000 | json_anual | 30 | 695.2 | 1123.5 | 1287.9 | 11.5 | 18.8 | 1287.9 |
| 12 | 100000 | json_anual_filtrado | 30 | 185.5 | 322.4 | 382.4 | 8.8 | 38 | 382.4 |
| 12 | 100000 | estudiantes | 30 | 311.4 | 519.7 | 525.2 | 11.1 | 117 | 525.2 |
| 12 | 100000 | pdf_semanal | 8 | 1458.5 | 10366.7 | 10366.7 | 1392.2 | 10128.2 | 10366.7 |
| 12 | 100000 | pdf_mensual | 8 | 1681.4 | 3084.1 | 3084.1 | 1510 | 2928.1 | 3084.1 |
| 12 | 100000 | pdf_anual_seccion | 8 | 884.1 | 1103.8 | 1103.8 | 691.5 | 938.7 | 1103.8 |
| 12 | 100000 | pdf_anual_estudiante | 8 | 445.4 | 914.1 | 914.1 | 442.9 | 910.1 | 914.1 |

#### Concurrente (autocannon, caché del fake activa) por ciclo y dataset

| Ciclo | Filas | Escenario | Conex. | Reqs | req/s | p50 | p90 | p97.5 | p99 | max | errores | timeouts | non2xx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 10000 | json_mensual_c10 | 10 | 680 | 136 | 56 | 98 | 223 | 478 | 593 | 0 | 0 | 0 |
| 1 | 10000 | json_mensual_c50 | 50 | 750 | 150 | 326 | 615 | 825 | 825 | 836 | 0 | 0 | 0 |
| 1 | 10000 | json_mensual_c100 | 100 | 923 | 184.6 | 566 | 765 | 1123 | 1131 | 1131 | 0 | 0 | 0 |
| 1 | 10000 | json_anual_c50 | 50 | 800 | 160 | 310 | 454 | 612 | 613 | 614 | 0 | 0 | 0 |
| 1 | 10000 | pdf_semanal_c10 | 10 | 30 | 1.9 | 4499 | 6746 | 7766 | 7766 | 7766 | 0 | 0 | 0 |
| 1 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.9 | 22440 | 24234 | 24548 | 24722 | 24722 | 0 | 0 | 0 |
| 1 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.9 | 4233 | 6312 | 7052 | 7052 | 7052 | 0 | 0 | 0 |
| 1 | 100000 | json_mensual_c10 | 10 | 510 | 102 | 58 | 191 | 274 | 425 | 448 | 0 | 0 | 0 |
| 1 | 100000 | json_mensual_c50 | 50 | 400 | 80 | 573 | 1547 | 1614 | 1616 | 1617 | 0 | 0 | 0 |
| 1 | 100000 | json_mensual_c100 | 100 | 776 | 155.2 | 594 | 842 | 1416 | 1417 | 1419 | 0 | 0 | 0 |
| 1 | 100000 | json_anual_c50 | 50 | 600 | 120 | 371 | 805 | 1133 | 1133 | 1136 | 0 | 0 | 0 |
| 1 | 100000 | pdf_semanal_c10 | 10 | 30 | 1.3 | 6861 | 10717 | 12452 | 12452 | 12452 | 0 | 0 | 0 |
| 1 | 100000 | pdf_semanal_c50 | 50 | 50 | 0.9 | 45508 | 54313 | 56346 | 56831 | 56831 | 0 | 0 | 0 |
| 1 | 100000 | pdf_mensual_c10 | 10 | 20 | 0.5 | 12986 | 35170 | 36941 | 36941 | 36941 | 0 | 0 | 0 |
| 2 | 10000 | json_mensual_c10 | 10 | 560 | 112 | 67 | 150 | 369 | 540 | 571 | 0 | 0 | 0 |
| 2 | 10000 | json_mensual_c50 | 50 | 250 | 50 | 601 | 2455 | 2467 | 2469 | 2470 | 0 | 0 | 0 |
| 2 | 10000 | json_mensual_c100 | 100 | 422 | 84.4 | 1197 | 1506 | 2144 | 2145 | 2155 | 0 | 0 | 0 |
| 2 | 10000 | json_anual_c50 | 50 | 300 | 60 | 815 | 1551 | 1555 | 1557 | 1557 | 0 | 0 | 0 |
| 2 | 10000 | pdf_semanal_c10 | 10 | 30 | 1.0 | 7215 | 18250 | 21482 | 21482 | 21482 | 0 | 0 | 0 |
| 2 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.4 | 32992 | 34761 | 35567 | 35786 | 35786 | 0 | 0 | 0 |
| 2 | 10000 | pdf_mensual_c10 | 10 | 20 | 0.6 | 15676 | 22351 | 24104 | 24104 | 24104 | 0 | 0 | 0 |
| 2 | 500000 | json_mensual_c10 | 10 | 730 | 146 | 61 | 90 | 109 | 469 | 469 | 0 | 0 | 0 |
| 2 | 500000 | json_mensual_c50 | 50 | 1150 | 230 | 222 | 325 | 346 | 348 | 352 | 0 | 0 | 0 |
| 2 | 500000 | json_mensual_c100 | 100 | 476 | 119 | 664 | 1559 | 2142 | 2158 | 2161 | 0 | 0 | 0 |
| 2 | 500000 | json_anual_c50 | 50 | 100 | 33.3 | 846 | 9882 | 9918 | 9918 | 9918 | 0 | 0 | 0 |
| 2 | 500000 | pdf_semanal_c10 | 10 | 30 | 0.4 | 18928 | 48930 | 53521 | 53521 | 53521 | 0 | 0 | 0 |
| 2 | 500000 | pdf_semanal_c50 | 50 | 50 | 0.2 | 273971 | 281581 | 283327 | 283331 | 283331 | 0 | 0 | 0 |
| 3 | 10000 | json_mensual_c10 | 10 | 730 | 146 | 66 | 95 | 99 | 106 | 107 | 0 | 0 | 0 |
| 3 | 10000 | json_mensual_c50 | 50 | 900 | 180 | 293 | 479 | 525 | 540 | 542 | 0 | 0 | 0 |
| 3 | 10000 | json_mensual_c100 | 100 | 976 | 195.2 | 594 | 766 | 827 | 1289 | 1290 | 0 | 0 | 0 |
| 3 | 10000 | json_anual_c50 | 50 | 750 | 150 | 314 | 410 | 662 | 663 | 665 | 0 | 0 | 0 |
| 3 | 10000 | pdf_semanal_c10 | 10 | 30 | 2.1 | 4204 | 6472 | 7878 | 7878 | 7878 | 0 | 0 | 0 |
| 3 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.7 | 23764 | 26703 | 27756 | 27757 | 27757 | 0 | 0 | 0 |
| 3 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.1 | 8212 | 13255 | 14791 | 14791 | 14791 | 0 | 0 | 0 |
| 3 | 100000 | json_mensual_c10 | 10 | 970 | 194 | 50 | 65 | 78 | 85 | 85 | 0 | 0 | 0 |
| 3 | 100000 | json_mensual_c50 | 50 | 1000 | 200 | 268 | 366 | 449 | 463 | 464 | 0 | 0 | 0 |
| 3 | 100000 | json_mensual_c100 | 100 | 1223 | 244.6 | 444 | 513 | 548 | 850 | 854 | 0 | 0 | 0 |
| 3 | 100000 | json_anual_c50 | 50 | 895 | 179 | 240 | 375 | 773 | 774 | 776 | 0 | 0 | 0 |
| 3 | 100000 | pdf_semanal_c10 | 10 | 30 | 1.1 | 8556 | 13397 | 18095 | 18095 | 18095 | 0 | 0 | 0 |
| 3 | 100000 | pdf_semanal_c50 | 50 | 50 | 1.3 | 33307 | 34552 | 36384 | 36978 | 36978 | 0 | 0 | 0 |
| 3 | 100000 | pdf_mensual_c10 | 10 | 20 | 0.7 | 11224 | 21940 | 23817 | 23817 | 23817 | 0 | 0 | 0 |
| 4 | 10000 | json_mensual_c10 | 10 | 1300 | 260 | 37 | 46 | 53 | 56 | 74 | 0 | 0 | 0 |
| 4 | 10000 | json_mensual_c50 | 50 | 1450 | 290 | 177 | 188 | 194 | 194 | 200 | 0 | 0 | 0 |
| 4 | 10000 | json_mensual_c100 | 100 | 1423 | 284.6 | 351 | 413 | 456 | 736 | 737 | 0 | 0 | 0 |
| 4 | 10000 | json_anual_c50 | 50 | 1300 | 260 | 172 | 262 | 412 | 414 | 414 | 0 | 0 | 0 |
| 4 | 10000 | pdf_semanal_c10 | 10 | 30 | 2.7 | 3142 | 4219 | 5060 | 5060 | 5060 | 0 | 0 | 0 |
| 4 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.2 | 37140 | 40924 | 42456 | 42790 | 42790 | 0 | 0 | 0 |
| 4 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.4 | 6050 | 9907 | 10848 | 10848 | 10848 | 0 | 0 | 0 |
| 4 | 100000 | json_mensual_c10 | 10 | 550 | 110 | 85 | 115 | 145 | 163 | 164 | 0 | 0 | 0 |
| 4 | 100000 | json_mensual_c50 | 50 | 950 | 190 | 252 | 333 | 356 | 374 | 374 | 0 | 0 | 0 |
| 4 | 100000 | json_mensual_c100 | 100 | 523 | 130.8 | 882 | 1103 | 1431 | 1432 | 1433 | 0 | 0 | 0 |
| 4 | 100000 | json_anual_c50 | 50 | 800 | 160 | 299 | 349 | 1509 | 1511 | 1512 | 0 | 0 | 0 |
| 4 | 100000 | pdf_semanal_c10 | 10 | 30 | 1.6 | 5232 | 8190 | 10334 | 10334 | 10334 | 0 | 0 | 0 |
| 4 | 100000 | pdf_semanal_c50 | 50 | 50 | 1.6 | 29141 | 30169 | 30418 | 30639 | 30639 | 0 | 0 | 0 |
| 4 | 100000 | pdf_mensual_c10 | 10 | 20 | 1.1 | 8431 | 11442 | 14863 | 14863 | 14863 | 0 | 0 | 0 |
| 5 | 10000 | json_mensual_c10 | 10 | 770 | 154 | 62 | 83 | 100 | 107 | 109 | 0 | 0 | 0 |
| 5 | 10000 | json_mensual_c50 | 50 | 650 | 130 | 374 | 451 | 591 | 591 | 592 | 0 | 0 | 0 |
| 5 | 10000 | json_mensual_c100 | 100 | 476 | 119 | 980 | 1193 | 1898 | 1898 | 1898 | 0 | 0 | 0 |
| 5 | 10000 | json_anual_c50 | 50 | 400 | 80 | 637 | 1387 | 1395 | 1399 | 1399 | 0 | 0 | 0 |
| 5 | 10000 | pdf_semanal_c10 | 10 | 30 | 1.0 | 7995 | 12552 | 14651 | 14651 | 14651 | 0 | 0 | 0 |
| 5 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.1 | 37824 | 42313 | 43520 | 44045 | 44045 | 0 | 0 | 0 |
| 5 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.6 | 5493 | 8887 | 10015 | 10015 | 10015 | 0 | 0 | 0 |
| 5 | 100000 | json_mensual_c10 | 10 | 700 | 140 | 72 | 105 | 112 | 135 | 143 | 0 | 0 | 0 |
| 5 | 100000 | json_mensual_c50 | 50 | 700 | 140 | 411 | 471 | 846 | 855 | 855 | 0 | 0 | 0 |
| 5 | 100000 | json_mensual_c100 | 100 | 375 | 75 | 1241 | 2001 | 3071 | 3071 | 3071 | 0 | 0 | 0 |
| 5 | 100000 | json_anual_c50 | 50 | 200 | 66.7 | 631 | 3197 | 3200 | 3200 | 3201 | 0 | 0 | 0 |
| 5 | 100000 | pdf_semanal_c10 | 10 | 30 | 0.5 | 16783 | 30228 | 36141 | 36141 | 36141 | 0 | 0 | 0 |
| 5 | 100000 | pdf_semanal_c50 | 50 | 50 | 0.9 | 43479 | 52054 | 53262 | 53264 | 53264 | 0 | 0 | 0 |
| 5 | 100000 | pdf_mensual_c10 | 10 | 20 | 0.7 | 12829 | 17301 | 23009 | 23009 | 23009 | 0 | 0 | 0 |
| 6 | 10000 | json_mensual_c10 | 10 | 540 | 108 | 87 | 131 | 207 | 278 | 278 | 0 | 0 | 0 |
| 6 | 10000 | json_mensual_c50 | 50 | 800 | 160 | 341 | 425 | 456 | 457 | 464 | 0 | 0 | 0 |
| 6 | 10000 | json_mensual_c100 | 100 | 622 | 124.4 | 816 | 1117 | 1523 | 1523 | 1524 | 0 | 0 | 0 |
| 6 | 10000 | json_anual_c50 | 50 | 450 | 90 | 484 | 1414 | 1481 | 1482 | 1483 | 0 | 0 | 0 |
| 6 | 10000 | pdf_semanal_c10 | 10 | 30 | 0.8 | 14041 | 16363 | 19677 | 19677 | 19677 | 0 | 0 | 0 |
| 6 | 10000 | pdf_semanal_c50 | 50 | 50 | 0.8 | 54041 | 59042 | 59496 | 59716 | 59716 | 0 | 0 | 0 |
| 6 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.5 | 5893 | 7750 | 9396 | 9396 | 9396 | 0 | 0 | 0 |
| 6 | 100000 | json_mensual_c10 | 10 | 1060 | 212 | 43 | 69 | 91 | 96 | 102 | 0 | 0 | 0 |
| 6 | 100000 | json_mensual_c50 | 50 | 800 | 160 | 227 | 616 | 621 | 634 | 640 | 0 | 0 | 0 |
| 6 | 100000 | json_mensual_c100 | 100 | 376 | 94 | 1249 | 1588 | 2293 | 2293 | 2294 | 0 | 0 | 0 |
| 6 | 100000 | json_anual_c50 | 50 | 300 | 75 | 623 | 2377 | 2415 | 2416 | 2416 | 0 | 0 | 0 |
| 6 | 100000 | pdf_semanal_c10 | 10 | 30 | 1.0 | 8640 | 17793 | 21016 | 21016 | 21016 | 0 | 0 | 0 |
| 6 | 100000 | pdf_semanal_c50 | 50 | 50 | 0.8 | 57492 | 58828 | 59245 | 59245 | 59245 | 0 | 0 | 0 |
| 6 | 100000 | pdf_mensual_c10 | 10 | 20 | 1.3 | 6396 | 11976 | 12901 | 12901 | 12901 | 0 | 0 | 0 |
| 7 | 500000 | json_mensual_c10 | 10 | 750 | 150 | 57 | 75 | 128 | 493 | 493 | 0 | 0 | 0 |
| 7 | 500000 | json_mensual_c50 | 50 | 1050 | 210 | 241 | 381 | 515 | 516 | 525 | 0 | 0 | 0 |
| 7 | 500000 | json_mensual_c100 | 100 | 922 | 184.4 | 573 | 688 | 1154 | 1162 | 1162 | 0 | 0 | 0 |
| 7 | 500000 | json_anual_c50 | 50 | 350 | 116.7 | 337 | 3044 | 3077 | 3078 | 3079 | 0 | 0 | 0 |
| 7 | 500000 | pdf_semanal_c10 | 10 | 30 | 0.6 | 15166 | 27316 | 34403 | 34403 | 34403 | 0 | 0 | 0 |
| 7 | 500000 | pdf_semanal_c50 | 50 | 50 | 0.7 | 70653 | 72705 | 73184 | 73345 | 73345 | 0 | 0 | 0 |
| 8 | 10000 | json_mensual_c10 | 10 | 790 | 158 | 61 | 88 | 112 | 138 | 141 | 0 | 0 | 0 |
| 8 | 10000 | json_mensual_c50 | 50 | 950 | 190 | 253 | 499 | 621 | 639 | 642 | 0 | 0 | 0 |
| 8 | 10000 | json_mensual_c100 | 100 | 1423 | 284.6 | 379 | 433 | 443 | 708 | 709 | 0 | 0 | 0 |
| 8 | 10000 | json_anual_c50 | 50 | 1000 | 200 | 219 | 366 | 596 | 597 | 599 | 0 | 0 | 0 |
| 8 | 10000 | pdf_semanal_c10 | 10 | 30 | 2.2 | 3946 | 5327 | 6136 | 6136 | 6136 | 0 | 0 | 0 |
| 8 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.4 | 29772 | 32051 | 33831 | 34971 | 34971 | 0 | 0 | 0 |
| 8 | 10000 | pdf_mensual_c10 | 10 | 20 | 0.3 | 23427 | 39396 | 45869 | 45869 | 45869 | 0 | 0 | 0 |
| 8 | 100000 | json_mensual_c10 | 10 | 80 | 26.7 | 355 | 3326 | 3327 | 3327 | 3327 | 0 | 0 | 0 |
| 8 | 100000 | json_mensual_c50 | 50 | 50 | 25 | 5846 | 7478 | 7481 | 7491 | 7491 | 0 | 0 | 0 |
| 8 | 100000 | json_mensual_c100 | 100 | 23 | 7.7 | 4775 | 4902 | 4918 | 4918 | 4918 | 0 | 0 | 0 |
| 8 | 100000 | json_anual_c50 | 50 | 40 | 13.3 | 11079 | 11186 | 11188 | 11191 | 11191 | 0 | 0 | 0 |
| 8 | 100000 | pdf_semanal_c10 | 10 | 30 | 0.7 | 8658 | 31852 | 34187 | 34187 | 34187 | 0 | 0 | 0 |
| 8 | 100000 | pdf_semanal_c50 | 50 | 50 | 0.7 | 64136 | 66439 | 67004 | 67261 | 67261 | 0 | 0 | 0 |
| 8 | 100000 | pdf_mensual_c10 | 10 | 20 | 1.0 | 9211 | 10820 | 12714 | 12714 | 12714 | 0 | 0 | 0 |
| 9 | 10000 | json_mensual_c10 | 10 | 660 | 132 | 71 | 100 | 170 | 197 | 197 | 0 | 0 | 0 |
| 9 | 10000 | json_mensual_c50 | 50 | 850 | 170 | 313 | 386 | 480 | 481 | 488 | 0 | 0 | 0 |
| 9 | 10000 | json_mensual_c100 | 100 | 823 | 164.6 | 640 | 771 | 1041 | 1042 | 1052 | 0 | 0 | 0 |
| 9 | 10000 | json_anual_c50 | 50 | 800 | 160 | 340 | 575 | 936 | 936 | 939 | 0 | 0 | 0 |
| 9 | 10000 | pdf_semanal_c10 | 10 | 30 | 2.9 | 3096 | 4191 | 5162 | 5162 | 5162 | 0 | 0 | 0 |
| 9 | 10000 | pdf_semanal_c50 | 50 | 50 | 0.8 | 60534 | 62860 | 63125 | 63384 | 63384 | 0 | 0 | 0 |
| 9 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.3 | 5859 | 10650 | 11568 | 11568 | 11568 | 0 | 0 | 0 |
| 9 | 100000 | json_mensual_c10 | 10 | 360 | 72 | 123 | 198 | 620 | 624 | 625 | 0 | 0 | 0 |
| 9 | 100000 | json_mensual_c50 | 50 | 350 | 87.5 | 562 | 1130 | 1158 | 1158 | 1159 | 0 | 0 | 0 |
| 9 | 100000 | json_mensual_c100 | 100 | 476 | 95.2 | 1060 | 1537 | 2148 | 2148 | 2148 | 0 | 0 | 0 |
| 9 | 100000 | json_anual_c50 | 50 | 350 | 87.5 | 540 | 2293 | 2306 | 2307 | 2307 | 0 | 0 | 0 |
| 9 | 100000 | pdf_semanal_c10 | 10 | 30 | 1.2 | 7195 | 12505 | 14260 | 14260 | 14260 | 0 | 0 | 0 |
| 9 | 100000 | pdf_semanal_c50 | 50 | 50 | 1.6 | 25766 | 28265 | 28900 | 29404 | 29404 | 0 | 0 | 0 |
| 9 | 100000 | pdf_mensual_c10 | 10 | 20 | 0.9 | 10157 | 12879 | 15700 | 15700 | 15700 | 0 | 0 | 0 |
| 10 | 10000 | json_mensual_c10 | 10 | 550 | 183.3 | 53 | 68 | 78 | 81 | 82 | 0 | 0 | 0 |
| 10 | 10000 | json_mensual_c50 | 50 | 550 | 183.3 | 292 | 328 | 329 | 336 | 338 | 0 | 0 | 0 |
| 10 | 10000 | json_mensual_c100 | 100 | 275 | 91.7 | 1161 | 1230 | 2000 | 2000 | 2001 | 0 | 0 | 0 |
| 10 | 10000 | json_anual_c50 | 50 | 200 | 66.7 | 632 | 1093 | 1095 | 1099 | 1099 | 0 | 0 | 0 |
| 10 | 10000 | pdf_semanal_c10 | 10 | 20 | 1.0 | 8010 | 13131 | 13657 | 13657 | 13657 | 0 | 0 | 0 |
| 10 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.3 | 36381 | 37494 | 38403 | 38586 | 38586 | 0 | 0 | 0 |
| 10 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.9 | 4131 | 5804 | 7059 | 7059 | 7059 | 0 | 0 | 0 |
| 11 | 10000 | json_mensual_c10 | 10 | 630 | 126 | 71 | 113 | 150 | 152 | 167 | 0 | 0 | 0 |
| 11 | 10000 | json_mensual_c50 | 50 | 850 | 170 | 322 | 391 | 407 | 408 | 411 | 0 | 0 | 0 |
| 11 | 10000 | json_mensual_c100 | 100 | 876 | 175.2 | 611 | 934 | 1134 | 1148 | 1148 | 0 | 0 | 0 |
| 11 | 10000 | json_anual_c50 | 50 | 650 | 130 | 333 | 514 | 792 | 793 | 796 | 0 | 0 | 0 |
| 11 | 10000 | pdf_semanal_c10 | 10 | 30 | 1.2 | 7521 | 10024 | 10531 | 10531 | 10531 | 0 | 0 | 0 |
| 11 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.2 | 39801 | 40902 | 42374 | 42967 | 42967 | 0 | 0 | 0 |
| 11 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.3 | 6697 | 9362 | 11054 | 11054 | 11054 | 0 | 0 | 0 |
| 11 | 100000 | json_mensual_c10 | 10 | 520 | 104 | 96 | 126 | 147 | 190 | 191 | 0 | 0 | 0 |
| 11 | 100000 | json_mensual_c50 | 50 | 450 | 90 | 550 | 620 | 630 | 632 | 632 | 0 | 0 | 0 |
| 11 | 100000 | json_mensual_c100 | 100 | 476 | 95.2 | 1063 | 1590 | 2550 | 2556 | 2556 | 0 | 0 | 0 |
| 11 | 100000 | json_anual_c50 | 50 | 700 | 140 | 308 | 466 | 1463 | 1464 | 1467 | 0 | 0 | 0 |
| 11 | 100000 | pdf_semanal_c10 | 10 | 30 | 0.7 | 12940 | 19953 | 22686 | 22686 | 22686 | 0 | 0 | 0 |
| 11 | 100000 | pdf_semanal_c50 | 50 | 50 | 1.0 | 48587 | 50262 | 50712 | 51010 | 51010 | 0 | 0 | 0 |
| 11 | 100000 | pdf_mensual_c10 | 10 | 20 | 0.4 | 20482 | 28937 | 29950 | 29950 | 29950 | 0 | 0 | 0 |
| 12 | 10000 | json_mensual_c10 | 10 | 620 | 124 | 82 | 101 | 120 | 164 | 174 | 0 | 0 | 0 |
| 12 | 10000 | json_mensual_c50 | 50 | 750 | 150 | 345 | 426 | 516 | 516 | 524 | 0 | 0 | 0 |
| 12 | 10000 | json_mensual_c100 | 100 | 1023 | 204.6 | 529 | 597 | 655 | 896 | 896 | 0 | 0 | 0 |
| 12 | 10000 | json_anual_c50 | 50 | 695 | 139 | 340 | 557 | 626 | 626 | 628 | 0 | 0 | 0 |
| 12 | 10000 | pdf_semanal_c10 | 10 | 30 | 1.0 | 9265 | 12142 | 16334 | 16334 | 16334 | 0 | 0 | 0 |
| 12 | 10000 | pdf_semanal_c50 | 50 | 50 | 1.1 | 43997 | 44403 | 45770 | 46088 | 46088 | 0 | 0 | 0 |
| 12 | 10000 | pdf_mensual_c10 | 10 | 20 | 1.7 | 4637 | 6841 | 8272 | 8272 | 8272 | 0 | 0 | 0 |
| 12 | 100000 | json_mensual_c10 | 10 | 810 | 162 | 58 | 80 | 104 | 139 | 139 | 0 | 0 | 0 |
| 12 | 100000 | json_mensual_c50 | 50 | 1000 | 200 | 264 | 326 | 359 | 361 | 361 | 0 | 0 | 0 |
| 12 | 100000 | json_mensual_c100 | 100 | 1076 | 215.2 | 490 | 583 | 723 | 1072 | 1073 | 0 | 0 | 0 |
| 12 | 100000 | json_anual_c50 | 50 | 800 | 160 | 272 | 376 | 1023 | 1024 | 1025 | 0 | 0 | 0 |
| 12 | 100000 | pdf_semanal_c10 | 10 | 30 | 0.8 | 11060 | 18544 | 22777 | 22777 | 22777 | 0 | 0 | 0 |
| 12 | 100000 | pdf_semanal_c50 | 50 | 50 | 1.8 | 23775 | 26384 | 26563 | 26766 | 26766 | 0 | 0 | 0 |
| 12 | 100000 | pdf_mensual_c10 | 10 | 20 | 0.7 | 13980 | 22584 | 26040 | 26040 | 26040 | 0 | 0 | 0 |

#### PDF de todo el colegio (peor caso)

| Ciclo | Filas | Incidencias | Periodo | ms total | ms fake BD | ms app | MB | Páginas | maxRSS (MB) | ΔmaxRSS (MB) | Event loop max (ms) | Sonda max (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 10000 | 189 | mensual_colegio | 581.5 | 43.2 | 538.3 | 0.1 | 21 | 592.9 | 0 | 354.4 | 27.4 |
| 1 | 10000 | 1968 | anual_colegio | 1181.6 | 94.6 | 1087.1 | 0.5 | 152 | 592.9 | 0 | 880.8 | 37.2 |
| 1 | 100000 | 1866 | mensual_colegio | 1217.7 | 341 | 876.7 | 0.3 | 77 | 737.6 | 0 | 885 | 117.2 |
| 1 | 100000 | 19744 | anual_colegio | 7090.9 | 1211.9 | 5879 | 2.3 | 736 | 737.6 | 0 | 6341.8 | 235.7 |
| 2 | 10000 | 189 | mensual_colegio | 1487.2 | 115.6 | 1371.6 | 0.1 | 21 | 641.6 | 0 | 940 | 57.4 |
| 2 | 10000 | 1968 | anual_colegio | 1585.8 | 168.1 | 1417.7 | 0.5 | 152 | 641.6 | 0 | 1205.9 | 56.7 |
| 2 | 500000 | 9649 | mensual_colegio | 6005 | 3370 | 2635 | 0.9 | 252 | 841.1 | 0 | 3063.9 | 1530 |
| 2 | 500000 | 100120 | anual_colegio | 48764.1 | 4717.7 | 44046.4 | 8.1 | 2542 | 841.1 | 0 | 46674.2 | 615.3 |
| 3 | 10000 | 189 | mensual_colegio | 828.1 | 57 | 771.1 | 0.1 | 21 | 1037.7 | 0 | 481 | 41.1 |
| 3 | 10000 | 1968 | anual_colegio | 1651.9 | 115.6 | 1536.2 | 0.5 | 152 | 1037.7 | 0 | 1348.5 | 38.5 |
| 3 | 100000 | 1866 | mensual_colegio | 1524.7 | 406.1 | 1118.6 | 0.3 | 77 | 1127 | 0 | 1056.4 | 177.5 |
| 3 | 100000 | 19744 | anual_colegio | 6736.3 | 1376.1 | 5360.1 | 2.3 | 736 | 1127 | 0 | 6136.3 | 235.5 |
| 4 | 10000 | 189 | mensual_colegio | 730.6 | 71.4 | 659.2 | 0.1 | 21 | 677.7 | 0 | 433.3 | 50 |
| 4 | 10000 | 1968 | anual_colegio | 1197.8 | 119 | 1078.8 | 0.5 | 152 | 677.7 | 0 | 932.7 | 32.5 |
| 4 | 100000 | 1866 | mensual_colegio | 1183.8 | 371 | 812.8 | 0.3 | 77 | 1218 | 0 | 821.6 | 141.8 |
| 4 | 100000 | 19744 | anual_colegio | 5388.7 | 778.7 | 4610.1 | 2.3 | 736 | 1218 | 0 | 4949.3 | 163.2 |
| 5 | 10000 | 189 | mensual_colegio | 997.3 | 68.2 | 929.1 | 0.1 | 21 | 886.9 | 0 | 652.2 | 45.6 |
| 5 | 10000 | 1968 | anual_colegio | 1294.6 | 191 | 1103.6 | 0.5 | 152 | 886.9 | 0 | 1066.4 | 28.6 |
| 5 | 100000 | 1866 | mensual_colegio | 2797.3 | 899.7 | 1897.6 | 0.3 | 77 | 886.9 | 0 | 1604.3 | 367 |
| 5 | 100000 | 19744 | anual_colegio | 17690.3 | 4381.1 | 13309.2 | 2.3 | 736 | 886.9 | 0 | 12339.6 | 766.4 |
| 6 | 10000 | 189 | mensual_colegio | 792.2 | 65.4 | 726.8 | 0.1 | 21 | 531.3 | 0 | 445.9 | 58.6 |
| 6 | 10000 | 1968 | anual_colegio | 1471 | 155.5 | 1315.5 | 0.5 | 152 | 531.3 | 0 | 1193.3 | 39.1 |
| 6 | 100000 | 1866 | mensual_colegio | 1154 | 295.4 | 858.6 | 0.3 | 77 | 766.1 | 0 | 871.4 | 101.2 |
| 6 | 100000 | 19744 | anual_colegio | 3538.9 | 687.4 | 2851.5 | 2.3 | 736 | 766.1 | 0 | 3185.6 | 127.8 |
| 7 | 500000 | 9649 | mensual_colegio | 2264 | 958.6 | 1305.4 | 0.9 | 252 | 937.2 | 0 | 1774.2 | 308.4 |
| 7 | 500000 | 100120 | anual_colegio | 16950.9 | 3302 | 13648.9 | 8.1 | 2542 | 937.2 | 0 | 15460.2 | 409.6 |
| 8 | 10000 | 189 | mensual_colegio | 1235.9 | 96 | 1139.9 | 0.1 | 21 | 1046.8 | 0 | 820 | 41.8 |
| 8 | 10000 | 1968 | anual_colegio | 2305.8 | 257.5 | 2048.3 | 0.5 | 152 | 1046.8 | 0 | 1749 | 72.1 |
| 8 | 100000 | 1866 | mensual_colegio | 4080.7 | 1371.7 | 2708.9 | 0.3 | 77 | 1046.8 | 0 | 2342.5 | 267.7 |
| 8 | 100000 | 19744 | anual_colegio | 26483.8 | 3086.4 | 23397.4 | 2.3 | 736 | 1046.8 | 0 | 23135.8 | 835.4 |
| 9 | 10000 | 189 | mensual_colegio | 1236.8 | 102.6 | 1134.2 | 0.1 | 21 | 595.4 | 0 | 682.1 | 59.7 |
| 9 | 10000 | 1968 | anual_colegio | 2109.2 | 188.1 | 1921.1 | 0.5 | 152 | 595.4 | 0 | 1703.9 | 51 |
| 9 | 100000 | 1866 | mensual_colegio | 5047.3 | 2264.6 | 2782.7 | 0.3 | 77 | 1176.9 | 0 | 2711.6 | 428.7 |
| 9 | 100000 | 19744 | anual_colegio | 25087.5 | 3134.4 | 21953.1 | 2.3 | 736 | 1176.9 | 0 | 22431.1 | 950.3 |
| 10 | 10000 | 189 | mensual_colegio | 1454.7 | 155.3 | 1299.5 | 0.1 | 21 | 869.3 | 0 | 862.5 | 71.9 |
| 10 | 10000 | 1968 | anual_colegio | 1714.6 | 260.8 | 1453.8 | 0.5 | 152 | 869.3 | 0 | 1360 | 111.4 |
| 11 | 10000 | 189 | mensual_colegio | 876.7 | 87.6 | 789.1 | 0.1 | 21 | 862.3 | 0 | 494.9 | 55.8 |
| 11 | 10000 | 1968 | anual_colegio | 1842 | 152.4 | 1689.6 | 0.5 | 152 | 862.3 | 0 | 1443.9 | 50 |
| 11 | 100000 | 1866 | mensual_colegio | 6864.9 | 2476.9 | 4387.9 | 0.3 | 77 | 924.7 | 0 | 3858.8 | 445.5 |
| 11 | 100000 | 19744 | anual_colegio | 18545.7 | 4345.1 | 14200.7 | 2.3 | 736 | 924.7 | 0 | 15678.3 | 332.3 |
| 12 | 10000 | 189 | mensual_colegio | 787.2 | 61.5 | 725.7 | 0.1 | 21 | 943.8 | 0 | 489.7 | 37.4 |
| 12 | 10000 | 1968 | anual_colegio | 1277.6 | 102.4 | 1175.2 | 0.5 | 152 | 943.8 | 0 | 1013.4 | 29.3 |
| 12 | 100000 | 1866 | mensual_colegio | 1429.8 | 373.1 | 1056.6 | 0.3 | 77 | 1188.2 | 0 | 919.6 | 161.7 |
| 12 | 100000 | 19744 | anual_colegio | 5321.8 | 1078.4 | 4243.4 | 2.3 | 736 | 1188.2 | 0 | 4794.1 | 170.5 |

#### Variabilidad entre ciclos

| Dataset | Métrica | n ciclos | media | mín | máx | CV % |
|---|---|---|---|---|---|---|
| 10000 | seq json_mensual p50 | 11 | 21.2 | 11.5 | 39.2 | 38 |
| 10000 | seq json_mensual p95 | 11 | 49.2 | 25.4 | 112.1 | 50 |
| 10000 | seq json_anual p50 | 11 | 53.1 | 31.5 | 100.9 | 38 |
| 10000 | seq json_anual p95 | 11 | 75.4 | 41.6 | 139.2 | 41 |
| 10000 | seq json_anual_filtrado p50 | 11 | 12.0 | 7.7 | 19.5 | 29 |
| 10000 | seq json_anual_filtrado p95 | 11 | 23.6 | 11.4 | 47.5 | 43 |
| 10000 | seq estudiantes p50 | 11 | 18.3 | 10.5 | 27.1 | 25 |
| 10000 | seq estudiantes p95 | 11 | 35.0 | 16.4 | 61.6 | 33 |
| 10000 | seq pdf_semanal p50 | 11 | 745.9 | 284.1 | 2356.6 | 79 |
| 10000 | seq pdf_semanal p95 | 11 | 1387.7 | 445.7 | 4319.7 | 81 |
| 10000 | seq pdf_mensual p50 | 11 | 774.6 | 343.4 | 2435.8 | 77 |
| 10000 | seq pdf_mensual p95 | 11 | 1731.0 | 390.8 | 6272.2 | 121 |
| 10000 | seq pdf_anual_seccion p50 | 11 | 903.5 | 289.7 | 5118.7 | 156 |
| 10000 | seq pdf_anual_seccion p95 | 11 | 1665.1 | 346 | 7679.4 | 128 |
| 10000 | seq pdf_anual_estudiante p50 | 11 | 406.1 | 244.3 | 841.5 | 39 |
| 10000 | seq pdf_anual_estudiante p95 | 11 | 859.5 | 270.3 | 3578 | 109 |
| 10000 | conc json_mensual_c10 p50 | 11 | 64.8 | 37 | 87 | 21 |
| 10000 | conc json_mensual_c10 p99 | 11 | 208.8 | 56 | 540 | 77 |
| 10000 | conc json_mensual_c50 p50 | 11 | 330.6 | 177 | 601 | 31 |
| 10000 | conc json_mensual_c50 p99 | 11 | 677.8 | 194 | 2469 | 91 |
| 10000 | conc json_mensual_c100 p50 | 11 | 711.3 | 351 | 1197 | 41 |
| 10000 | conc json_mensual_c100 p99 | 11 | 1319.6 | 708 | 2145 | 38 |
| 10000 | conc json_anual_c50 p50 | 11 | 417.8 | 172 | 815 | 48 |
| 10000 | conc json_anual_c50 p99 | 11 | 925.4 | 414 | 1557 | 43 |
| 10000 | conc pdf_semanal_c10 p50 | 11 | 6630.4 | 3096 | 14041 | 50 |
| 10000 | conc pdf_semanal_c10 p99 | 11 | 11666.7 | 5060 | 21482 | 50 |
| 10000 | conc pdf_semanal_c50 p50 | 11 | 38062.4 | 22440 | 60534 | 30 |
| 10000 | conc pdf_semanal_c50 p99 | 11 | 41892.0 | 24722 | 63384 | 28 |
| 10000 | conc pdf_mensual_c10 p50 | 11 | 8209.8 | 4131 | 23427 | 73 |
| 10000 | conc pdf_mensual_c10 p99 | 11 | 14548.0 | 7052 | 45869 | 79 |
| 10000 | pdf mensual_colegio ms | 11 | 1000.7 | 581.5 | 1487.2 | 31 |
| 10000 | pdf anual_colegio ms | 11 | 1602.9 | 1181.6 | 2305.8 | 23 |
| 100000 | seq json_mensual p50 | 9 | 57.2 | 46.6 | 72.7 | 17 |
| 100000 | seq json_mensual p95 | 9 | 96.6 | 75.3 | 118.5 | 16 |
| 100000 | seq json_anual p50 | 9 | 466.5 | 337 | 695.2 | 23 |
| 100000 | seq json_anual p95 | 9 | 816.7 | 488.9 | 1277.5 | 35 |
| 100000 | seq json_anual_filtrado p50 | 9 | 103.9 | 53.9 | 185.5 | 49 |
| 100000 | seq json_anual_filtrado p95 | 9 | 182.0 | 73.9 | 403.5 | 65 |
| 100000 | seq estudiantes p50 | 9 | 137.4 | 69.6 | 311.4 | 58 |
| 100000 | seq estudiantes p95 | 9 | 205.5 | 89.1 | 519.7 | 67 |
| 100000 | seq pdf_semanal p50 | 9 | 904.5 | 481.5 | 2275 | 65 |
| 100000 | seq pdf_semanal p95 | 9 | 2585.1 | 544 | 10366.7 | 121 |
| 100000 | seq pdf_mensual p50 | 9 | 1212.6 | 667.9 | 1681.4 | 30 |
| 100000 | seq pdf_mensual p95 | 9 | 2188.7 | 775.1 | 4374 | 53 |
| 100000 | seq pdf_anual_seccion p50 | 9 | 803.5 | 618.7 | 1132.9 | 22 |
| 100000 | seq pdf_anual_seccion p95 | 9 | 1244.5 | 711.9 | 2910.6 | 54 |
| 100000 | seq pdf_anual_estudiante p50 | 9 | 641.1 | 359.4 | 1790.9 | 74 |
| 100000 | seq pdf_anual_estudiante p95 | 9 | 2479.0 | 457 | 8771.1 | 135 |
| 100000 | conc json_mensual_c10 p50 | 9 | 104.4 | 43 | 355 | 93 |
| 100000 | conc json_mensual_c10 p99 | 9 | 576.0 | 85 | 3327 | 182 |
| 100000 | conc json_mensual_c50 p50 | 9 | 994.8 | 227 | 5846 | 183 |
| 100000 | conc json_mensual_c50 p99 | 9 | 1509.3 | 361 | 7491 | 151 |
| 100000 | conc json_mensual_c100 p50 | 9 | 1310.9 | 444 | 4775 | 102 |
| 100000 | conc json_mensual_c100 p99 | 9 | 2195.2 | 850 | 4918 | 57 |
| 100000 | conc json_anual_c50 p50 | 9 | 1595.9 | 240 | 11079 | 223 |
| 100000 | conc json_anual_c50 p99 | 9 | 2780.0 | 774 | 11191 | 117 |
| 100000 | conc pdf_semanal_c10 p50 | 9 | 9547.2 | 5232 | 16783 | 37 |
| 100000 | conc pdf_semanal_c10 p99 | 9 | 21327.6 | 10334 | 36141 | 42 |
| 100000 | conc pdf_semanal_c50 p50 | 9 | 41243.4 | 23775 | 64136 | 34 |
| 100000 | conc pdf_semanal_c50 p99 | 9 | 45710.9 | 26766 | 67261 | 33 |
| 100000 | conc pdf_mensual_c10 p50 | 9 | 11744.0 | 6396 | 20482 | 35 |
| 100000 | conc pdf_mensual_c10 p99 | 9 | 21770.6 | 12714 | 36941 | 39 |
| 100000 | pdf mensual_colegio ms | 9 | 2811.1 | 1154 | 6864.9 | 74 |
| 100000 | pdf anual_colegio ms | 9 | 12876.0 | 3538.9 | 26483.8 | 71 |
| 500000 | seq json_mensual p50 | 2 | 344.8 | 215.5 | 474 | 53 |
| 500000 | seq json_mensual p95 | 2 | 509.4 | 413.6 | 605.1 | 27 |
| 500000 | seq json_anual p50 | 2 | 2414.3 | 1879.6 | 2948.9 | 31 |
| 500000 | seq json_anual p95 | 2 | 3854.7 | 3367.5 | 4341.9 | 18 |
| 500000 | seq json_anual_filtrado p50 | 2 | 379.1 | 205.4 | 552.9 | 65 |
| 500000 | seq json_anual_filtrado p95 | 2 | 633.8 | 441.9 | 825.7 | 43 |
| 500000 | seq estudiantes p50 | 2 | 445.9 | 270.6 | 621.2 | 56 |
| 500000 | seq estudiantes p95 | 2 | 1646.5 | 468.8 | 2824.2 | 101 |
| 500000 | seq pdf_semanal p50 | 2 | 3306.6 | 796.6 | 5816.6 | 107 |
| 500000 | seq pdf_semanal p95 | 2 | 6824.8 | 1030.8 | 12618.8 | 120 |
| 500000 | seq pdf_mensual p50 | 2 | 7530.3 | 2043.2 | 13017.4 | 103 |
| 500000 | seq pdf_mensual p95 | 2 | 10759.3 | 2202.4 | 19316.1 | 112 |
| 500000 | seq pdf_anual_seccion p50 | 2 | 3846.4 | 1512.6 | 6180.3 | 86 |
| 500000 | seq pdf_anual_seccion p95 | 2 | 7811.4 | 1674.6 | 13948.1 | 111 |
| 500000 | seq pdf_anual_estudiante p50 | 2 | 946.8 | 612.1 | 1281.5 | 50 |
| 500000 | seq pdf_anual_estudiante p95 | 2 | 1161.0 | 985.2 | 1336.7 | 21 |
| 500000 | conc json_mensual_c10 p50 | 2 | 59.0 | 57 | 61 | 5 |
| 500000 | conc json_mensual_c10 p99 | 2 | 481.0 | 469 | 493 | 4 |
| 500000 | conc json_mensual_c50 p50 | 2 | 231.5 | 222 | 241 | 6 |
| 500000 | conc json_mensual_c50 p99 | 2 | 432.0 | 348 | 516 | 27 |
| 500000 | conc json_mensual_c100 p50 | 2 | 618.5 | 573 | 664 | 10 |
| 500000 | conc json_mensual_c100 p99 | 2 | 1660.0 | 1162 | 2158 | 42 |
| 500000 | conc json_anual_c50 p50 | 2 | 591.5 | 337 | 846 | 61 |
| 500000 | conc json_anual_c50 p99 | 2 | 6498.0 | 3078 | 9918 | 74 |
| 500000 | conc pdf_semanal_c10 p50 | 2 | 17047.0 | 15166 | 18928 | 16 |
| 500000 | conc pdf_semanal_c10 p99 | 2 | 43962.0 | 34403 | 53521 | 31 |
| 500000 | conc pdf_semanal_c50 p50 | 2 | 172312.0 | 70653 | 273971 | 83 |
| 500000 | conc pdf_semanal_c50 p99 | 2 | 178338.0 | 73345 | 283331 | 83 |
| 500000 | pdf mensual_colegio ms | 2 | 4134.5 | 2264 | 6005 | 64 |
| 500000 | pdf anual_colegio ms | 2 | 32857.5 | 16950.9 | 48764.1 | 68 |
| escalado | 0 incidencias ms | 5 | 1963.4 | 454.8 | 4830.5 | 90 |
| escalado | 2500 incidencias ms | 5 | 5585.9 | 1556.3 | 11331.4 | 73 |
| escalado | 5000 incidencias ms | 5 | 5246.7 | 1655.1 | 9103.2 | 61 |
| escalado | 10000 incidencias ms | 5 | 6026.4 | 2132.7 | 10369.5 | 61 |
| escalado | 20000 incidencias ms | 5 | 10095.5 | 3396.3 | 25340.8 | 88 |
| escalado | 40000 incidencias ms | 5 | 13491.6 | 5553.2 | 27975.8 | 71 |
| escalado | 80000 incidencias ms | 5 | 15825.6 | 11164.7 | 27878.8 | 44 |

#### Barrido de escalado del PDF anual (todas las filas son incidencias)

| Ciclo | Incidencias | ms total | ms app | Páginas | MB | ms/página | RSS tras (MB) | ΔRSS (MB) | Δheap total (MB) | Event loop max (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 0 | 516.9 | 515 | 2 | 0.1 | 258.4 | 161.5 | 73.2 | 23.8 | 262 |
| 3 | 2500 | 1820.3 | 1766.6 | 186 | 0.6 | 9.8 | 213.9 | 98.8 | 39.1 | 1532 |
| 3 | 5000 | 2224.7 | 2126.8 | 303 | 0.9 | 7.3 | 242 | 30.2 | 44.3 | 1986 |
| 3 | 10000 | 2427.5 | 2248.9 | 472 | 1.5 | 5.1 | 254.9 | 36.5 | 71.6 | 2197.8 |
| 3 | 20000 | 4033.4 | 3817 | 745 | 2.3 | 5.4 | 327.2 | 75.2 | 78.9 | 3806.3 |
| 3 | 40000 | 5745.1 | 5309.3 | 1234 | 3.9 | 4.7 | 433.9 | 102.8 | 132.4 | 5448.4 |
| 3 | 80000 | 11802.7 | 10723 | 2143 | 6.8 | 5.5 | 591 | 159.9 | 138.2 | 10947.1 |
| 4 | 0 | 2060.3 | 2056.9 | 2 | 0.1 | 1030.1 | 153.7 | 66.4 | 23.5 | 697.8 |
| 4 | 2500 | 6308.2 | 6200.2 | 186 | 0.6 | 33.9 | 193.4 | 60.3 | 33.6 | 3424.6 |
| 4 | 5000 | 6258.5 | 6017.9 | 303 | 0.9 | 20.7 | 185.3 | -5.9 | 45.1 | 5276.4 |
| 4 | 10000 | 8809.7 | 8212.2 | 472 | 1.5 | 18.7 | 226.3 | 42.8 | 76.6 | 7553.9 |
| 4 | 20000 | 8305.5 | 7533.2 | 745 | 2.3 | 11.1 | 282.7 | 62.3 | 79.3 | 7910.5 |
| 4 | 40000 | 9878.5 | 8961.7 | 1234 | 3.9 | 8 | 421.4 | 140.6 | 180.9 | 9588.2 |
| 4 | 80000 | 12400.2 | 11424.8 | 2143 | 6.8 | 5.8 | 563.3 | 145.1 | 352.9 | 11995.7 |
| 5 | 0 | 4830.5 | 4827.2 | 2 | 0.1 | 2415.2 | 41.2 | -18.9 | 23.5 | 1001.4 |
| 5 | 2500 | 11331.4 | 10845.9 | 186 | 0.6 | 60.9 | 80.1 | 36 | 5.6 | 5238.7 |
| 5 | 5000 | 9103.2 | 8406.2 | 303 | 0.9 | 30 | 171.4 | 114.5 | 73.8 | 8623.5 |
| 5 | 10000 | 6392.6 | 6060.1 | 472 | 1.5 | 13.5 | 214.8 | 44.9 | 76.4 | 5976.9 |
| 5 | 20000 | 9401.4 | 8993.2 | 745 | 2.3 | 12.6 | 261.1 | 43.4 | 73.6 | 8841.6 |
| 5 | 40000 | 18305.2 | 17106.5 | 1234 | 3.9 | 14.8 | 320.7 | 55.8 | 184.9 | 17616.1 |
| 5 | 80000 | 27878.8 | 26123.7 | 2143 | 6.8 | 13 | 300.9 | -23.4 | -27.6 | 26306.7 |
| 6 | 0 | 454.8 | 453.2 | 2 | 0.1 | 227.4 | 163.6 | 78.6 | 23.8 | 231.3 |
| 6 | 2500 | 1556.3 | 1518 | 186 | 0.6 | 8.4 | 211.3 | 80.1 | 34.8 | 1142.9 |
| 6 | 5000 | 1655.1 | 1557.2 | 303 | 0.9 | 5.5 | 240.6 | 31.4 | 43.8 | 1461.7 |
| 6 | 10000 | 2132.7 | 2024.4 | 472 | 1.5 | 4.5 | 283.3 | 44.5 | 70.3 | 1939.9 |
| 6 | 20000 | 3396.3 | 3182 | 745 | 2.3 | 4.6 | 349.1 | 63.6 | 114.1 | 3183.5 |
| 6 | 40000 | 5553.2 | 5140.3 | 1234 | 3.9 | 4.5 | 470.4 | 198 | 202.4 | 5318.4 |
| 6 | 80000 | 11164.7 | 10349.5 | 2143 | 6.8 | 5.2 | 573.9 | 190.8 | 318.4 | 10729 |
| 8 | 0 | 1954.6 | 1950.9 | 2 | 0.1 | 977.3 | 117.7 | 56.5 | 20.3 | 1019.2 |
| 8 | 2500 | 6913.1 | 6724.8 | 186 | 0.6 | 37.2 | 127.5 | 53 | 37.8 | 4064.3 |
| 8 | 5000 | 6991.9 | 6192 | 303 | 0.9 | 23.1 | 164.2 | 30.6 | 46.1 | 5763 |
| 8 | 10000 | 10369.5 | 9641.9 | 472 | 1.5 | 22 | 214.6 | 55.6 | 71.8 | 8292.1 |
| 8 | 20000 | 25340.8 | 24220.2 | 745 | 2.3 | 34 | 116 | -42.8 | 113.4 | 20300.4 |
| 8 | 40000 | 27975.8 | 25958.5 | 1234 | 3.9 | 22.7 | 276.6 | 136 | 6.6 | 27095.2 |
| 8 | 80000 | 15881.4 | 13993.6 | 2143 | 6.8 | 7.4 | 319.6 | 21.7 | 138.7 | 15015.6 |

<!--FIN-RESULTADOS-->

---

## 6. Defectos encontrados

Todos tienen al menos una prueba que los reproduce (nombre `[DEFECTO…]`, falla a propósito; ver §4.1). Correspondencia: DEF-01 → `10_…`; DEF-03 → `02`/`05` fecha imposible y mes 13; DEF-04 → `02`/`04` int4; DEF-05 → `05` fail-open; DEF-06 → `08`; DEF-07 → `02` rango sin límite; DEF-08 → `02`/`04` parseInt parcial; DEF-09 → `02` periodo/fecha_referencia; DEF-10 → `02` 2025-02-31 y `09`; DEF-11 → `04` anio; DEF-12 → `02`/`05` arreglos; DEF-13 → `03`; DEF-14 → `06`. DEF-02 se evidencia con las mediciones de §5.1/§5.5. Ninguno fue corregido. “(emulado)” indica que el 500 depende de cómo responde PostgreSQL ante el valor; el fake reproduce el error que PostgreSQL emite para ese caso (no se pudo confirmar con una BD real porque Docker no estaba disponible). Lo que sí es comprobable con certeza es que **la API no rechaza el valor y lo envía a la BD**.

| ID | Severidad | Endpoint(s) | Petición de reproducción | Esperado | Observado |
|---|---|---|---|---|---|
| DEF-01 | **Alta** (rendimiento / disponibilidad) | `/api/epi/reporte-asistencia/pdf` | `GET …/pdf?periodo=anual&fecha_referencia=2025-03-15` con 500 k filas (≈100 k incidencias) | Generación acotada o asíncrona; el servidor sigue atendiendo otras peticiones | 17,0 s y 48,8 s en los 2 ciclos medidos (máquina compartida), 2 542 páginas, 8,1 MB; **event loop bloqueado 15,5 s / 46,7 s** (todas las demás peticiones del proceso quedan en espera). Con 100 k filas (≈19,7 k incidencias): mediana 6,7 s, 736 páginas. Con 20 k incidencias una petición ligera concurrente tardó entre 3,98 s (máquina libre) y 35 s (máquina cargada) (prueba `10_…`). El costo es lineal (~5 ms/página) y supera 5 s alrededor de 30–40 k incidencias. |
| DEF-02 | Media (rendimiento) | `/api/epi/reporte-asistencia/pdf` | Cualquier PDF, incluso vacío (`?periodo=mensual&fecha_referencia=2030-01-10`) | Costo fijo bajo | ~240–310 ms de costo fijo por PDF: decodificación del logo `logo-mep.png` (4182×704 RGBA, ~180–220 ms) y parseo de Roboto TTF (~160 ms) en cada petición. Rendimiento máximo observado ≈1,9 PDF/s con 10 conexiones (10 k filas). |
| DEF-03 | Media | JSON y PDF | `?periodo=personalizado&fecha_inicio=2025-02-30&fecha_fin=2025-03-31` (también `2025-13-01`) | 400 “fecha inválida” | **500** (emulado): la validación es solo la regex `^\d{4}-\d{2}-\d{2}$`, el valor llega a la BD. |
| DEF-04 | Media | JSON, PDF, estudiantes | `?id_seccion=2147483648`, `?id_materia=99999999999999999999`, `/secciones/2147483648/estudiantes` | 400 | **500** (emulado, error int4 fuera de rango). `parseEntero` no tiene cota superior. |
| DEF-05 | Media (seguridad) | todos los protegidos por `verificarTokenInterno` | Token con `jti` revocado mientras la consulta a `jwt_revocado` falla (BD caída/timeout) | 401/503 (fail-closed) | **200**: `tokenEstaRevocado` captura el error y devuelve `false` (fail-open). |
| DEF-06 | Media (privacidad) | JSON y PDF | `?periodo=anual&fecha_referencia=2025-01-01&id_estudiante=6` (6 = un encargado) o `=2` (un administrador) | Rechazar o no devolver datos de personas que no son estudiantes | 200 con `filtros.nombre_estudiante` y `filtros.cedula_estudiante` de **cualquier persona**: permite enumerar nombre+cédula por id. |
| DEF-07 | Media (DoS) | JSON y PDF | `?periodo=personalizado&fecha_inicio=0001-01-01&fecha_fin=9999-12-31` | 400 por rango excesivo | 200: no hay límite de rango; combinado con DEF-01 permite pedir el PDF de todo el histórico. |
| DEF-08 | Baja | JSON, PDF, estudiantes | `?id_seccion=12abc`, `?id_materia=1.9`, `?id_estudiante=1' OR '1'='1`, `/secciones/1abc/estudiantes` | 400 | 200 tratándolo como 12 / 1 / 1 (`parseInt` parcial). No hay inyección SQL (consultas parametrizadas), pero la entrada inválida se acepta en silencio. |
| DEF-09 | Baja | JSON y PDF | `?periodo=diario`, `?periodo=SEMANAL`, `?periodo=semanal&fecha_referencia=12/03/2025` | 400 | 200 con fallback silencioso a `mensual` y/o a la fecha de hoy: el usuario recibe un periodo distinto al pedido sin aviso. |
| DEF-10 | Baja | JSON y PDF | `?periodo=mensual&fecha_referencia=2025-02-31`; `?periodo=anual&fecha_referencia=0050-06-01` | 400 (o el periodo pedido) | 2025-02-31 → reporte de **marzo**; años 0000–0099 → 1900–1999 (`Date.UTC` interpreta años de 2 cifras). |
| DEF-11 | Baja | estudiantes | `/secciones/1/estudiantes?anio=-5` (también `anio=0`, `anio=99999999999`) | 400 | **500** (emulado; se construye la fecha `-5-01-01`). |
| DEF-12 | Baja | JSON y PDF | `?periodo=personalizado&fecha_inicio[]=2025-03-01&fecha_fin=2025-03-31` | 400 | 200 y `filtros.fecha_inicio` se devuelve como **arreglo** `["2025-03-01"]`. Con PostgreSQL real el arreglo se enviaría como parámetro (no verificado). |
| DEF-13 | Baja (UX) | JSON | `?periodo=anual&fecha_referencia=2025-05-05` | `catalogos.secciones` en orden natural (7-1 … 11-3) | Orden lexicográfico de la BD: `10-1, 10-2, …, 7-1` (las `secciones[]` del reporte sí usan orden natural). |
| DEF-14 | Info | todos (no producción) | `?periodo=personalizado&fecha_inicio=2025-02-30&fecha_fin=2025-03-01` con `NODE_ENV≠production` | Mensaje genérico | El 500 devuelve el mensaje interno de la BD. En `production` se verificó que sí es genérico (prueba `07_…`). |

## 7. Observaciones (pruebas `[OBSERVACIÓN]`, pasan; no se cuentan como defectos)

- Métodos no soportados (`POST/PUT/PATCH/DELETE`) devuelven **404** en lugar de **405** con cabecera `Allow`.
- Formatos de error distintos: 401 → `{mensaje}`, 403 → `{error}`, 400/404/500 → `{status, message, code, error}`.
- Respuestas JSON y PDF con datos personales sin `Cache-Control: no-store`.
- `Content-Disposition` con `filename=` sin comillas; el PDF se envía sin `Content-Length` (streaming).
- Un estado fuera del enum (`permiso_especial`) cae en `otros`, suma al total y baja el % (hoy el enum de BD solo tiene 4 estados, por lo que no ocurre en la práctica).
- `periodo` es sensible a mayúsculas (`SEMANAL` → mensual).
- El middleware acepta un JWT con `id: "1abc"` como id 1 (`parseInt` parcial). El rol se toma de la BD, no del token (correcto).
- `/api/reportes/estadisticas?id_seccion=0` → 200, mientras EPI rechaza `0` con 400: validación inconsistente entre módulos.
- El rol `epi` recibe 403 en `/api/reportes/*` (consistente con `puedeVerReportesEstrategicos`).

## 8. Cosas por mejorar (solo recomendaciones)

1. **PDF fuera del event loop o acotado** (DEF-01/07): generarlo en un `worker_thread`/cola de trabajos, o paginar/limitar el detalle diario (p. ej. máx. N incidencias o rango máximo de 31 días para el detalle; resumen anual sin detalle). Considerar `bufferPages: false` y numerar páginas de otra forma para no retener todo el documento en memoria.
2. **Costo fijo del PDF** (DEF-02): cachear en memoria los recursos (buffer de fuentes, logos) y usar una versión reducida del logo MEP (p. ej. 400 px de ancho, sin canal alfa o en JPG). El micro-benchmark muestra que el logo JPG cuesta ~4 ms frente a ~180–220 ms del PNG actual.
3. **Validación estricta de parámetros** (DEF-03/04/08/09/10/11/12): validar fechas reales (año ≥ 1900, mes/día válidos, sin desbordes), enteros con `/^\d+$/` y cota `≤ 2147483647`, `periodo` dentro de la lista (400 si no), rechazar arreglos (`typeof === 'string'`), y un rango máximo para `personalizado`.
4. **Revocación fail-closed** (DEF-05): si la consulta a `jwt_revocado` falla, responder 503 (o usar una caché local de revocados) en lugar de aceptar el token.
5. **id_estudiante** (DEF-06): resolver el nombre solo si la persona es estudiante (rol/matrícula); si no, 404/400.
6. **CPU del JSON**: el perfil de CPU mostró que `compararNombre` (`localeCompare(…, 'es', {numeric:true})`) es el mayor consumidor del endpoint JSON (~695 ms de 3,6 s en 200 peticiones, ~3,5 ms por petición). Un `Intl.Collator('es', {numeric:true})` reutilizable reduce ese costo.
7. Ordenar `catalogos.secciones` con el mismo comparador natural (DEF-13).
8. Unificar el formato de errores (401/403 con `{status,message,code,error}`), responder 405 con `Allow`, añadir `Cache-Control: no-store` a reportes con datos personales y `filename="…"` entre comillas.
9. Repetir estas pruebas contra un PostgreSQL desechable (Docker) para confirmar los 500 “emulados” y medir la latencia real de las consultas (en especial la del detalle diario, que no tiene `LIMIT`).
