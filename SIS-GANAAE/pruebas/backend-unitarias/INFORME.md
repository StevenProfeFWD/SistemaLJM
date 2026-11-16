# Informe de pruebas unitarias y de caja blanca — Backend Node/Express (SIS-GANAAE)

**Foco principal:** nuevo rol `epi` (Equipo de Permanencia Estudiantil): servicio de reportes, PDF, roles, middlewares, controlador y rutas.
**Foco secundario:** utilidades puras de `src/utils/` y servicios relacionados (justificaciones, orientación, notificaciones, reportes estratégicos).
**Ventana de trabajo:** inicio 2026-11-14 18:55:10 — última corrida 20:48 (hora local, UTC−6); 40 ciclos. Ver bitácora por ciclo (sección 6).
**Herramientas:** Node 22.14.0, Vitest 3.2.4, @vitest/coverage-v8 3.2.4, pdfjs-dist 4.10.38 (extracción de texto de los PDF).

> Todos los resultados de este informe se observaron realmente durante la sesión (archivos en `resultados/`).
> No se modificó ningún archivo fuera de `SIS-GANAAE/pruebas/backend-unitarias/`, no se hizo ninguna operación de git que cambie estado y **nunca se contactó la base de datos**.

---

## 1. Cómo ejecutar las pruebas

```bash
cd SIS-GANAAE/pruebas/backend-unitarias
npm install                 # solo la primera vez (instala vitest, coverage-v8 y pdfjs-dist en ESTA carpeta)
npm test                    # suite completa sin cobertura
npm run coverage            # suite completa + cobertura (texto, HTML en coverage/index.html, JSON)
npm run ciclo -- 20         # corre la suite con cobertura y agrega una fila a resultados/ciclos.csv
npm run lista               # genera resultados/lista-pruebas.md (estado de cada prueba)
npm run cobertura           # imprime la tabla de cobertura por archivo (requiere haber corrido coverage)
node scripts/comparar-ciclos.mjs 18 19   # compara estados por prueba entre dos corridas (inestabilidad)
```

### Aislamiento (cómo se garantiza que no se toca la BD ni la red)

| Mecanismo | Archivo | Efecto |
|---|---|---|
| `vi.mock` global de `src/db/knex.js` | `tests/helpers/setup.js` | Sustituye la conexión Knex por un **doble en memoria** (`tests/helpers/dbMock.js`) que imita el *query builder* encadenable, registra cada llamada (`tabla`, `ops`, callbacks `sub.*`, transacciones) y responde con lo que defina cada prueba. |
| Alias `knex` y `pg` → stub que lanza error | `vitest.config.js`, `tests/helpers/stubs/prohibido.js` | Defensa en profundidad: si algo intentara instanciar knex/pg reales, la prueba falla. |
| Alias `dotenv` → stub | `tests/helpers/stubs/dotenv.js` | Impide cargar `backend-node/.env` (credenciales de la BD remota). |
| Alias `axios` → stub sin red | `tests/helpers/stubs/axios.js` | `pdfService.cargarLogo` intenta descargar logos por HTTP como respaldo; aquí toda petición falla o es simulada. |
| Alias `nodemailer` → stub | `tests/helpers/stubs/nodemailer.js` | Ningún correo sale por SMTP; se registran en memoria. |

Las dependencias de la app (`pdfkit`, `express`, `jsonwebtoken`, `node-cache`, `bcrypt`) se resuelven desde `backend-node/node_modules` (resolución normal de Node a partir del archivo importado); no se instaló nada en las carpetas de la app.

---

## 2. Alcance: unitarias vs. caja blanca

| Tipo | Qué se probó | Ejemplos |
|---|---|---|
| **Unitarias (caja negra)** | Entradas/salidas de funciones puras y matrices de permisos | `calcularRangoPeriodo` (semanal/mensual/anual/personalizado, bisiestos, cruces de mes/año, domingo), `roles.js` (matriz rol × función), `estadoAsistencia.js`, `csvPrecarga.js`, `nombrePersona.js`, `leccionHelper.js`, `cookieEncryption.js`, `emailTemplates.js` (escape XSS). |
| **Caja blanca** | Recorrido de ramas internas usando el doble de BD para inspeccionar **qué consultas se construyen** (`where`, `whereIn`, `whereBetween`, `groupBy`, número de consultas, uso de transacción) y forzar cada rama | `obtenerReporteAsistenciaEpi` (filtros, `incluirDetalle`, estudiante seleccionado, `ESTADOS_INCIDENCIA`, `sumarEstado`/`cerrarTotales`/`construirDetalleDiario`/`compararNombre`), `verificarReportesEpi` con req/res/next falsos, `verificarTokenInterno` con JWT reales firmados y cookies cifradas, `pdfService` con y sin fuentes Roboto (rama Helvetica + `txt()`), logos remotos, paginación. |
| **Integración ligera (sin BD)** | Cadena completa de middlewares de las rutas EPI (`verificarTokenInterno → verificarReportesEpi → handler`) ejecutada sobre el `Router` real; servicio → PDF | `tests/epi/cadenaAutorizacionEpi.test.js`, `reporteEpiPdf.test.js › integración servicio → PDF`. |
| **Validación de PDF** | El PDF se genera en un `Writable` en memoria; se valida cabecera `%PDF-`/`%%EOF`, número de páginas, texto extraído (secciones, estudiantes, tildes/ñ, "Página X de Y"), y posiciones de texto (desbordes) | `tests/pdf/*.test.js` |

---

## 3. Archivos de prueba y conteos (última corrida completa)

Leyenda: **Pasaron** = la aserción se cumplió. **Fallan (it.fails)** = pruebas que expresan el comportamiento *correcto* y **fallan a propósito** porque el defecto existe (Vitest las reporta como "passed" justamente porque fallan; si el defecto se corrige, se volverán rojas y habrá que convertirlas en `it`). **Fallaron (inesperado)** = fallos no previstos.

<!-- TABLA_ARCHIVOS -->
| Archivo | Total | Pasaron | Fallan (it.fails, defecto confirmado) | Fallaron (inesperado) | Omitidas |
|---|---:|---:|---:|---:|---:|
| `tests/epi/cadenaAutorizacionEpi.test.js` | 13 | 13 | 0 | 0 | 0 |
| `tests/epi/calcularRangoPeriodo.test.js` | 62 | 61 | 1 | 0 | 0 |
| `tests/epi/epiBordes.test.js` | 33 | 30 | 3 | 0 | 0 |
| `tests/epi/epiControllerRutas.test.js` | 7 | 7 | 0 | 0 | 0 |
| `tests/epi/gestionPersonalEpi.test.js` | 5 | 4 | 1 | 0 | 0 |
| `tests/epi/listarEstudiantesSeccionEpi.test.js` | 18 | 18 | 0 | 0 | 0 |
| `tests/epi/obtenerReporteAsistenciaEpi.test.js` | 56 | 56 | 0 | 0 | 0 |
| `tests/epi/registroPersonaEpi.test.js` | 14 | 14 | 0 | 0 | 0 |
| `tests/middlewares/tokenRevocation.test.js` | 8 | 8 | 0 | 0 | 0 |
| `tests/middlewares/verificarRoles.test.js` | 147 | 147 | 0 | 0 | 0 |
| `tests/middlewares/verificarToken.test.js` | 23 | 23 | 0 | 0 | 0 |
| `tests/pdf/otrosPdf.test.js` | 14 | 13 | 1 | 0 | 0 |
| `tests/pdf/reporteEpiPdf.test.js` | 23 | 21 | 2 | 0 | 0 |
| `tests/pdf/reporteEpiPdfBordes.test.js` | 11 | 11 | 0 | 0 | 0 |
| `tests/pdf/reporteEpiPdfSinFuentes.test.js` | 5 | 5 | 0 | 0 | 0 |
| `tests/ramas/ramasPdf.test.js` | 4 | 4 | 0 | 0 | 0 |
| `tests/ramas/ramasRestantes.test.js` | 11 | 11 | 0 | 0 | 0 |
| `tests/servicios/justificacionService.test.js` | 25 | 25 | 0 | 0 | 0 |
| `tests/servicios/notificacionController.test.js` | 1 | 1 | 0 | 0 | 0 |
| `tests/servicios/notificacionCorreo.test.js` | 16 | 16 | 0 | 0 | 0 |
| `tests/servicios/notificacionHistorial.test.js` | 32 | 32 | 0 | 0 | 0 |
| `tests/servicios/orientacionService.test.js` | 25 | 24 | 1 | 0 | 0 |
| `tests/servicios/padresAsistencia.test.js` | 10 | 10 | 0 | 0 | 0 |
| `tests/servicios/padresDashboard.test.js` | 6 | 5 | 1 | 0 | 0 |
| `tests/servicios/reportesService.test.js` | 18 | 18 | 0 | 0 | 0 |
| `tests/servicios/seccionService.test.js` | 5 | 5 | 0 | 0 | 0 |
| `tests/servicios/sustituciones.test.js` | 8 | 8 | 0 | 0 | 0 |
| `tests/utils/cacheSeccion.test.js` | 14 | 13 | 1 | 0 | 0 |
| `tests/utils/csvPrecarga.test.js` | 48 | 47 | 1 | 0 | 0 |
| `tests/utils/emailTemplates.test.js` | 4 | 4 | 0 | 0 | 0 |
| `tests/utils/estadoAsistencia.test.js` | 26 | 26 | 0 | 0 | 0 |
| `tests/utils/helpersFecha.test.js` | 54 | 53 | 1 | 0 | 0 |
| `tests/utils/roles.test.js` | 195 | 194 | 1 | 0 | 0 |
| `tests/utils/utilsBd.test.js` | 40 | 40 | 0 | 0 | 0 |
| `tests/utils/utilsVarios.test.js` | 55 | 54 | 1 | 0 | 0 |
| **Total** | **1036** | **1021** | **15** | **0** | **0** |
<!-- /TABLA_ARCHIVOS -->

**Resultado global de la suite (versión final):** 1036 pruebas en 35 archivos: **1021 pasaron**, **15 fallan intencionalmente** (`it.fails`, confirman los defectos D-02, D-03, D-05, D-06, D-07, D-09, D-10, D-11, D-12, D-13, D-14, D-16, D-17, D-19, D-20), 0 omitidas. Hubo **1 fallo inesperado en una sola corrida** (ciclo 22, por tiempo de espera; ver sección 6) que no se repitió. Además, otras pruebas con prefijo `DEFECTO`/`OBSERVACIÓN` en su título **documentan el comportamiento defectuoso observado** (pasan porque afirman lo que el código hace hoy).

La lista completa prueba por prueba (PASÓ / FALLA) está en el **Anexo A** al final de este informe y en `resultados/lista-pruebas.md`.

---

## 4. Lista de pruebas que FALLAN (con motivo)

**Fallo inesperado observado (1 vez):** `pdf/reporteEpiPdf.test.js › el número de páginas crece con los datos y cada página tiene "Página X de Y"` falló en el **ciclo 22** con `Test timed out in 30000ms`. La prueba genera y analiza 4 PDF (1, 5, 20 y 60 secciones); normalmente tarda 10–14 s, pero la máquina estaba saturada por los otros dos agentes. No es un defecto de la app: se subió `testTimeout` a 120 s en `vitest.config.js` (solo infraestructura de pruebas) y en el ciclo 23 pasó (20,2 s). Queda registrada como **prueba sensible a la carga de la máquina (flaky por tiempo)**.

Las siguientes pruebas **fallan intencionalmente** (`it.fails`) porque el código no cumple el comportamiento esperado:

| Prueba (archivo) | Motivo / defecto |
|---|---|
| `D-02 (expectativa correcta): 2026-02-31 debería rechazarse con AppError 400` (`epi/calcularRangoPeriodo.test.js`) | El periodo personalizado solo valida forma `AAAA-MM-DD`; fechas inexistentes pasan a la BD. |
| `D-03 (expectativa correcta): id_seccion="5abc" debería rechazarse` (`epi/epiBordes.test.js`) | `parseEntero` usa `parseInt` y acepta prefijos numéricos. |
| `D-05 (expectativa correcta): etiquetaRolPersona("toString") debería devolver un string` (`utils/roles.test.js`) | Búsqueda en objeto literal hereda de `Object.prototype`. |
| `D-06 (expectativa correcta): fecha vacía en el detalle no debería imprimir "undefined"` (`pdf/reporteEpiPdf.test.js`) | `fechaLarga('')` imprime "undefined undefined de undefined de 0". |
| `D-07 (expectativa correcta): el nombre de materia debería ocupar una sola línea` (`pdf/reporteEpiPdf.test.js`) | `lineBreak:false` + `ellipsis` no truncan en pdfkit 0.18; el texto se parte y desborda la fila. |
| `D-09 (expectativa correcta): cualquier clave válida debería permitir cifrar` (`utils/utilsVarios.test.js`) | Clave con caracteres multibyte → clave AES de más de 32 bytes → excepción. |
| `D-10 (expectativa correcta): fechaDiaAnterior = día anterior en cualquier zona horaria` (`utils/helpersFecha.test.js`) | Mezcla hora local y `toISOString()` (UTC). |
| `D-11 (expectativa correcta): asignaciones ausentes deberían imprimirse como "—"` (`pdf/otrosPdf.test.js`) | `s.asignaciones.map` sin protección → `TypeError`. |
| `D-12 (expectativa correcta): 203/400 = 50,75 % debería mostrarse 50.8` (`epi/epiBordes.test.js`) | Redondeo en coma flotante. |
| `D-13 (expectativa correcta): un arreglo debería rechazarse con 400 o ignorarse` (`epi/epiBordes.test.js`) | `fecha_referencia[]=…` provoca `TypeError` → HTTP 500. |
| `D-14 (expectativa correcta): 31/02/2010 debería devolver null` (`utils/csvPrecarga.test.js`) | `parseFechaNacimiento` no valida rangos. |
| `D-16 (expectativa correcta): no debería volver a crearse "7-3"` (`utils/cacheSeccion.test.js`) | Numeración de nueva sección = cantidad + 1. |
| `D-17 (expectativa correcta): eliminar una expulsión debería rechazarse (403)` (`servicios/orientacionService.test.js`) | `eliminarEstadoPeriodo` no verifica el tipo de estado. |
| `D-19 (expectativa correcta): a las 20:00 hora CR el estado que termina hoy sigue activo` (`servicios/padresDashboard.test.js`) | `hoyIso()` del dashboard de encargados usa UTC. |
| `D-20 (expectativa correcta): un administrador debería poder inactivar una cuenta EPI` (`epi/gestionPersonalEpi.test.js`) | `ROLES_PERSONAL` no incluye `epi`. |

### Pruebas que PASARON

Las 1021 restantes pasaron (ver Anexo A con la lista completa agrupada por archivo y `describe`; cada prueba aparece como PASÓ o FALLA).

---

## 5. Cobertura (última corrida, `@vitest/coverage-v8`, solo archivos cargados por las pruebas)

### 5.1 Alcance EPI solicitado
Archivos: `epiReportesService.js`, `pdfService.js`, `roles.js`, `verificarRoles.js`, `estadoAsistencia.js`, `epiController.js`, `epiRoutes.js`.

| Métrica | Valor |
|---|---:|
| **Sentencias** | **99.81 %** |
| **Ramas** | **99.24 %** |

Las únicas ramas/sentencias sin cubrir del alcance EPI están en `pdfService.js` líneas 28 y 48–51 (`txt(null)` en modo Helvetica e `inferPdfKitType` para `.webp`/extensión desconocida): **no alcanzables desde los llamadores actuales** (todos pasan cadenas no nulas a `txt()` y los nombres de logo son fijos: `logo-mep.png`, `logo-liceo.jpg`).

### 5.2 Por archivo

<!-- TABLA_COBERTURA -->
| Archivo | % Sentencias | % Ramas (cubiertas/total) | % Funciones | % Líneas |
|---|---:|---:|---:|---:|
| `TOTAL (archivos cargados)` | 83 | 95.66 (1479/1546) | 88.23 | 83 |
| `controllers/epiController.js` | 100 | 100 (5/5) | 100 | 100 |
| `controllers/notificacionController.js` | 100 | 100 (1/1) | 100 | 100 |
| `controllers/personaController.js` | 19.6 | 93.54 (29/31) | 6.66 | 19.6 |
| `controllers/reportesController.js` | 100 | 100 (10/10) | 100 | 100 |
| `middlewares/errorHandler.js` | 100 | 96.96 (32/33) | 100 | 100 |
| `middlewares/verificarRoles.js` | 100 | 100 (43/43) | 100 | 100 |
| `middlewares/verificarToken.js` | 100 | 100 (38/38) | 100 | 100 |
| `routes/epiRoutes.js` | 100 | 100 (0/0) | 100 | 100 |
| `routes/notificacionRoutes.js` | 100 | 100 (4/4) | 100 | 100 |
| `services/catalogCacheService.js` | 100 | 100 (15/15) | 100 | 100 |
| `services/emailService.js` | 100 | 88.88 (16/18) | 100 | 100 |
| `services/epiReportesService.js` | 100 | 100 (113/113) | 100 | 100 |
| `services/estudianteService.js` | 7.01 | 100 (0/0) | 0 | 7.01 |
| `services/haciendaService.js` | 17.85 | 100 (0/0) | 0 | 17.85 |
| `services/justificacionService.js` | 99.4 | 95 (114/120) | 100 | 99.4 |
| `services/notificacionHistorialService.js` | 100 | 100 (66/66) | 100 | 100 |
| `services/notificationService.js` | 100 | 84.09 (37/44) | 100 | 100 |
| `services/orientacionService.js` | 99.31 | 93.24 (138/148) | 100 | 99.31 |
| `services/padresAsistenciaService.js` | 100 | 97.67 (42/43) | 100 | 100 |
| `services/padresDashboardService.js` | 100 | 78.57 (11/14) | 100 | 100 |
| `services/padresEstadosService.js` | 100 | 100 (5/5) | 100 | 100 |
| `services/pdfService.js` | 99.68 | 98.13 (158/161) | 100 | 99.68 |
| `services/personalService.js` | 42.28 | 59.01 (36/61) | 50 | 42.28 |
| `services/reportesService.js` | 100 | 94.82 (55/58) | 100 | 100 |
| `services/seccionService.js` | 100 | 100 (24/24) | 100 | 100 |
| `services/tokenRevocationService.js` | 100 | 97.29 (36/37) | 100 | 100 |
| `utils/AppError.js` | 100 | 100 (3/3) | 100 | 100 |
| `utils/asyncHandler.js` | 100 | 100 (2/2) | 100 | 100 |
| `utils/cache.js` | 100 | 100 (7/7) | 100 | 100 |
| `utils/cookieEncryption.js` | 100 | 100 (13/13) | 100 | 100 |
| `utils/cookieOptions.js` | 100 | 100 (9/9) | 100 | 100 |
| `utils/corsConfig.js` | 100 | 100 (13/13) | 100 | 100 |
| `utils/csvPrecarga.js` | 100 | 100 (68/68) | 100 | 100 |
| `utils/cupoSeccionError.js` | 100 | 100 (21/21) | 100 | 100 |
| `utils/emailTemplates.js` | 100 | 88.23 (15/17) | 100 | 100 |
| `utils/encargadoLookup.js` | 100 | 100 (22/22) | 100 | 100 |
| `utils/estadoAsistencia.js` | 100 | 100 (49/49) | 100 | 100 |
| `utils/estadoEstudiantePeriodo.js` | 100 | 100 (46/46) | 100 | 100 |
| `utils/leccionHelper.js` | 100 | 96.42 (27/28) | 100 | 100 |
| `utils/matriculaVisibilidad.js` | 100 | 100 (44/44) | 100 | 100 |
| `utils/nombrePersona.js` | 100 | 100 (11/11) | 100 | 100 |
| `utils/profesorGuiaVisibilidad.js` | 100 | 100 (11/11) | 100 | 100 |
| `utils/roles.js` | 100 | 100 (26/26) | 100 | 100 |
| `utils/seccionHelper.js` | 100 | 100 (8/8) | 100 | 100 |
| `utils/sustitucionHelper.js` | 100 | 100 (29/29) | 100 | 100 |
| `utils/tutorVisibilidad.js` | 100 | 100 (3/3) | 100 | 100 |
| `utils/validateEnv.js` | 100 | 100 (24/24) | 100 | 100 |
<!-- /TABLA_COBERTURA -->

Notas:
- `personaController.js`, `estudianteService.js`, `haciendaService.js` y `personalService.js` aparecen porque se cargan al probar el alta (`postPersona`) y la gestión (`personalService`) de usuarios EPI; solo se probaron las funciones relacionadas con el rol, por eso su cobertura total es baja y arrastra el total global (≈ 83 % sentencias / 95,7 % ramas).
- `padresDashboardService.js` 78,57 % de ramas: las 3 ramas sin cubrir son respaldos inalcanzables (`|| new Date().getFullYear()` y `orientacion.registros || []`), porque las funciones llamadas siempre devuelven un año y un arreglo (comprobado con 2 pruebas adicionales en el ciclo 26).
- Ramas no cubiertas restantes, todas analizadas: `errorHandler.js:27` (condición redundante, inalcanzable), `leccionHelper.js:14` (`Number.isNaN` tras validar mes/día: inalcanzable), `emailTemplates.js:18-48` (`pieExtra` nunca se usa), `emailService.js:42,56` (ramas de valores por defecto `SMTP_PORT`/`noreply`).

---

## 6. Bitácora por ciclo

Inicio de la sesión: **2026-11-14 18:55:10** (hora local, UTC−6). Cada ciclo = suite completa con cobertura. Duraciones con alta variación porque **otros dos agentes ejecutaban pruebas en paralelo** en la misma máquina (contención de CPU); no se debió a pruebas lentas propias.

<!-- TABLA_CICLOS -->
| Ciclo | Fin (hora local) | Min. desde inicio | Total | Pasaron | Fallaron | Omitidas | Duración (s) | % Sent. global | % Ramas global | % Sent. EPI | % Ramas EPI |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 19:06:02 | 11 | 528 | 528 | 0 | 0 | 29.04 | 68.53 | 97.48 | n/d | n/d |
| 2 | 19:09:51 | 15 | 636 | 636 | 0 | 0 | 60.43 | 75.48 | 97.78 | n/d | n/d |
| 3 | 19:14:19 | 19 | 675 | 675 | 0 | 0 | 63.02 | 99.7 | 97.01 | n/d | n/d |
| 4 | 19:18:17 | 23 | 774 | 774 | 0 | 0 | 53.91 | 93.43 | 97.77 | n/d | n/d |
| 5 | 19:23:57 | 29 | 805 | 805 | 0 | 0 | 71.76 | 99.69 | 97.84 | n/d | n/d |
| 6 | 19:31:33 | 36 | 848 | 848 | 0 | 0 | 127.09 | 78.03 | 98.79 | n/d | n/d |
| 7 | 19:34:31 | 39 | 853 | 853 | 0 | 0 | 55.30 | 82.16 | 98.6 | 99.81 | 97.96 |
| 8 | 19:36:50 | 42 | 875 | 875 | 0 | 0 | 45.32 | 82.16 | 98.6 | 99.81 | 97.96 |
| 9 | 19:38:06 | 43 | 875 | 875 | 0 | 0 | 53.37 | 82.16 | 98.6 | 99.81 | 97.96 |
| 10 | 19:40:56 | 46 | 892 | 892 | 0 | 0 | 75.67 | 82.8 | 99.16 | 99.81 | 99.24 |
| 11 | 19:43:11 | 48 | 910 | 910 | 0 | 0 | 60.73 | 81.43 | 98.94 | 99.81 | 99.24 |
| 12 | 19:46:30 | 51 | 945 | 945 | 0 | 0 | 54.62 | 85.33 | 98.49 | 99.81 | 99.24 |
| 13 | 19:49:50 | 55 | 969 | 969 | 0 | 0 | 75.53 | 95.76 | 97.91 | 99.81 | 99.24 |
| 14 | 19:52:38 | 57 | 985 | 985 | 0 | 0 | 95.61 | 99.82 | 97.37 | 99.81 | 99.24 |
| 15 | 19:55:23 | 60 | 987 | 987 | 0 | 0 | 95.04 | 99.82 | 97.37 | 99.81 | 99.24 |
| 16 | 19:58:11 | 63 | 1001 | 1001 | 0 | 0 | 113.46 | 85.78 | 97.29 | 99.81 | 99.24 |
| 17 | 20:00:40 | 66 | 1003 | 1003 | 0 | 0 | 100.69 | 85.78 | 97.29 | 99.81 | 99.24 |
| 18 | 20:02:53 | 68 | 1009 | 1009 | 0 | 0 | 65.83 | 85.78 | 97.29 | 99.81 | 99.24 |
| 19 | 20:06:18 | 71 | 1009 | 1009 | 0 | 0 | 117.90 | 85.78 | 97.29 | 99.81 | 99.24 |
| 20 | 20:08:46 | 74 | 1014 | 1014 | 0 | 0 | 71.74 | 86 | 97.12 | 99.81 | 99.24 |
| 21 | 20:11:45 | 77 | 1019 | 1019 | 0 | 0 | 99.94 | 81.1 | 95.63 | 99.81 | 99.24 |
| 22 | 20:14:28 | 79 | 1024 | 1023 | 1 | 0 | 102.23 | NaN | NaN | NaN | NaN |
| 23 | 20:17:09 | 82 | 1024 | 1024 | 0 | 0 | 127.30 | 81.52 | 95.7 | 99.81 | 99.24 |
| 24 | 20:20:20 | 85 | 1024 | 1024 | 0 | 0 | 101.29 | 81.52 | 95.7 | 99.81 | 99.24 |
| 25 | 20:23:07 | 88 | 1032 | 1032 | 0 | 0 | 67.90 | 83 | 95.66 | 99.81 | 99.24 |
| 26 | 20:24:57 | 90 | 1034 | 1034 | 0 | 0 | 84.92 | 83 | 95.66 | 99.81 | 99.24 |
| 27 | 20:26:52 | 92 | 1034 | 1034 | 0 | 0 | 83.33 | 83 | 95.66 | 99.81 | 99.24 |
| 28 | 20:29:21 | 94 | 1036 | 1036 | 0 | 0 | 86.44 | 83 | 95.66 | 99.81 | 99.24 |
| 29 | 20:30:53 | 96 | 1036 | 1036 | 0 | 0 | 73.99 | 83 | 95.66 | 99.81 | 99.24 |
| 30 | 20:32:51 | 98 | 1036 | 1036 | 0 | 0 | 98.95 | 83 | 95.66 | 99.81 | 99.24 |
| 31 | 20:34:48 | 100 | 1036 | 1036 | 0 | 0 | 74.74 | 83 | 95.66 | 99.81 | 99.24 |
| 32 | 20:36:19 | 101 | 1036 | 1036 | 0 | 0 | 77.94 | 83 | 95.66 | 99.81 | 99.24 |
| 33 | 20:38:04 | 103 | 1036 | 1036 | 0 | 0 | 92.06 | 83 | 95.66 | 99.81 | 99.24 |
| 34 | 20:40:56 | 106 | 1036 | 1036 | 0 | 0 | 151.55 | 83 | 95.66 | 99.81 | 99.24 |
| 35 | 20:42:27 | 107 | 1036 | 1036 | 0 | 0 | 79.60 | 83 | 95.66 | 99.81 | 99.24 |
| 36 | 20:43:59 | 109 | 1036 | 1036 | 0 | 0 | 70.60 | 83 | 95.66 | 99.81 | 99.24 |
| 37 | 20:45:31 | 110 | 1036 | 1036 | 0 | 0 | 66.65 | 83 | 95.66 | 99.81 | 99.24 |
| 38 | 20:46:43 | 112 | 1036 | 1036 | 0 | 0 | 58.51 | 83 | 95.66 | 99.81 | 99.24 |
| 39 | 20:47:41 | 113 | 1036 | 1036 | 0 | 0 | 49.61 | 83 | 95.66 | 99.81 | 99.24 |
| 40 | 20:48:43 | 114 | 1036 | 1036 | 0 | 0 | 45.73 | 83 | 95.66 | 99.81 | 99.24 |

"Pasaron" incluye las pruebas `it.fails` (13 en la versión final), que Vitest cuenta como aprobadas porque su aserción falla mientras el defecto exista. "% EPI" = archivos del alcance EPI (sección 5.1); se empezó a medir en el ciclo 7. Las variaciones del % global se deben a que la cobertura solo incluye los archivos cargados: al probar módulos nuevos entran archivos dependientes aún no probados.
<!-- /TABLA_CICLOS -->

**Inestabilidad (flaky):** a partir del ciclo 7 se guardó el estado de cada prueba (`resultados/estados-ciclo-N.json`) y se comparó cada corrida con la anterior (`scripts/comparar-ciclos.mjs`). En todas las comparaciones `difieren = 0`, **excepto** 21→22→23: la prueba de páginas del PDF EPI pasó a *failed* por *timeout* (30 s) en el ciclo 22 y volvió a *passed* en el ciclo 23 tras subir el tiempo límite (ver sección 4). Ninguna prueba presentó resultados distintos por motivos lógicos (orden, estado compartido, reloj): los relojes se simulan con `vi.useFakeTimers`/`vi.setSystemTime` y la zona horaria se restaura tras cada prueba. Nota: cuando una corrida tiene fallos, Vitest no escribe el resumen de cobertura por defecto (por eso el ciclo 22 muestra `NaN`); desde el ciclo 23 se activó `reportOnFailure`. Además, la prueba "3 generaciones del mismo reporte producen el mismo número de páginas y el mismo texto" confirma que el PDF es determinista (salvo la marca de fecha de generación).

Hitos por ciclo (qué se agregó antes de cada corrida):

| Ciclo | Nuevas pruebas / cambios |
|---|---|
| 1 | `calcularRangoPeriodo`, `obtenerReporteAsistenciaEpi`, `listarEstudiantesSeccionEpi`, `roles`, `verificarRoles`, `estadoAsistencia`, PDF EPI (válido, páginas, texto, tildes, vacío, 0/1/N secciones, detalle) y rama Helvetica/logos remotos. |
| 2 | Utilidades: `leccionHelper`, `sustitucionHelper` (incl. zona horaria), `nombrePersona`, `cupoSeccionError`, `asyncHandler`, `cookieEncryption`, `cookieOptions`, `corsConfig`, `validateEnv`, `errorHandler`. |
| 3 | Bordes EPI (nº de consultas, ids raros, redondeo, invariantes de suma, concurrencia) + PDF de otros reportes. |
| 4 | Controlador y rutas EPI, parámetros como arreglo (D-13), visibilidad/matrícula/encargados/estados, `csvPrecarga`. |
| 5 | `verificarToken` (JWT reales, revocación, cuenta inactiva, alg none, clave ajena, expirado) y `tokenRevocationService`. |
| 6 | Historial de notificaciones (filtros, paginación, escape LIKE, autorización) + ramas restantes. El doble de BD ahora ejecuta *callbacks* de `where/join`. |
| 7 | `emailTemplates` (XSS), `notificacionController`. |
| 8 | Cadena completa de autorización EPI y propiedades de calendario 1896–2104. |
| 9 | Corrida idéntica (estabilidad) + ramas restantes de PDF. |
| 10 | `cache.js`, `catalogCacheService`, `seccionHelper` (D-16). |
| 11 | `reportesService`/`reportesController` (comparación de fórmulas con EPI), `padresAsistenciaService`. |
| 12 | `justificacionService` (alcance por rol, transacción, validaciones). |
| 13 | `orientacionService` (crear/actualizar/anular/eliminar, historial). |
| 14 | `emailService` + `notificationService` con nodemailer simulado. |
| 15 | Desbordes verticales en PDF (título de sección, cédula). |
| 16 | Alta de personas con rol `epi` (`postPersona`). |
| 17 | Rendimiento: 100 000 filas agregadas, 10 000 estudiantes. |
| 18 | `it.fails` con la expectativa correcta para D-03, D-06, D-10, D-11, D-16, D-17. |
| 19 | Corrida idéntica de estabilidad (sin cambios). |
| 20 | `padresEstadosService` / `padresDashboardService` (D-19, reloj y zona horaria simulados) + detalle EPI en modo Helvetica. |
| 21 | Gestión de personal y rol `epi` (D-20). |
| 22 | `seccionService` (cupos y profesor guía). **1 fallo por timeout** (ver sección 4). |
| 23 | Solo infraestructura: `testTimeout` 120 s y `reportOnFailure`. Todo pasa. |
| 24 | Corrida idéntica de estabilidad (sin cambios). |
| 25 | `personalService.registrarSustitucion` (transacción manual commit/rollback, solapamiento). |
| 26 | 2 pruebas de ramas restantes de `padresDashboardService`. |
| 27 | Corrida idéntica de estabilidad (sin cambios). |
| 28 | Zona horaria del servidor en `calcularRangoPeriodo` (O-16). |
| 29–40 | Corridas finales de estabilidad sin cambios (12 corridas idénticas, todas 1036/1036, `difieren = 0`). |

---

## 7. Defectos encontrados (no corregidos)

Severidad: **Alta** (seguridad/datos), **Media** (error 500, regla de negocio violada, información incorrecta), **Baja** (validación laxa, presentación).

| ID | Severidad | Ubicación | Reproducción (entrada) | Esperado | Observado | Prueba |
|---|---|---|---|---|---|---|
| D-01 | Baja | `services/epiReportesService.js:59-62` (`calcularRangoPeriodo`) | `{periodo:'anual', fecha_referencia:'2026-00-15'}`; también `'2026-13-01'`, `'2026-02-30'` | 400 por fecha inexistente | Se normaliza: año 2025, enero 2027, 2 de marzo, respectivamente | `calcularRangoPeriodo.test.js › fechas con formato correcto pero inexistentes` |
| D-02 | **Media** | `services/epiReportesService.js:50-56` | `{periodo:'personalizado', fecha_inicio:'2026-02-31', fecha_fin:'2026-13-45'}` | AppError 400 | Se aceptan y se envían a `whereBetween` → PostgreSQL rechazaría la fecha → HTTP 500 | `calcularRangoPeriodo.test.js › D-02` (+ `it.fails`) |
| D-03 | Baja | `services/epiReportesService.js:32-36` (`parseEntero`) | `id_seccion='5abc'`, `'1 OR 1=1'`, `'1.9'`, `'1e3'`, `1e21`, `['3','4']` | 400 | Se aceptan como 5, 1, 1, 1, 1, 3 (no hay inyección SQL porque se parametriza un entero, pero se filtra por una sección distinta a la pedida en silencio) | `obtenerReporteAsistenciaEpi.test.js › D-03`, `epiBordes.test.js` |
| D-04 | Baja | `services/epiReportesService.js:209-210, 224` | `GET /epi/secciones/1/estudiantes?anio=-5` (o `0`, `20261`, `2026abc`) | 400 o año actual | Se consulta `whereBetween('a.fecha', ['-5-01-01','-5-12-31'])` | `listarEstudiantesSeccionEpi.test.js › D-04` |
| D-05 | Baja | `utils/roles.js:66-68` (`etiquetaRolPersona`) | `etiquetaRolPersona('constructor')` / `'toString'` | `'constructor'` | Devuelve la función `Object`/`toString` (objeto literal hereda de `Object.prototype`) | `roles.test.js` |
| D-06 | Baja | `services/pdfService.js:816-820` (`fechaLarga`) + `epiReportesService.js:148` (`fechaAIso(null)` → `''`) | Fila de detalle con `fecha` nula | Texto "Sin fecha" o fila omitida | Encabezado del día: **"undefined undefined de undefined de 0"** | `reporteEpiPdf.test.js › D-06` |
| D-07 | **Media** | `services/pdfService.js:740-747` (`dibujarFila`: `lineBreak:false, ellipsis:true`); también `:768` (título de sección) y `:926` + `:906-910` (cédula en detalle; la altura de fila solo considera materias y nombre) | Materia de ~650 caracteres; nombre de sección muy largo; cédula de ~100 caracteres | Texto truncado con "…" dentro de su celda | pdfkit 0.18 **igual parte el texto** en ~20 líneas que se superponen con las filas siguientes ("Total sección…"); el título y la cédula también ocupan varias líneas sobre barras/filas de altura fija | `reporteEpiPdf.test.js › D-07`, `reporteEpiPdfBordes.test.js › desbordes verticales` |
| D-08 | Baja | `utils/leccionHelper.js:12-13` (`fechaToIsoDiaSemana`) | `'2026-02-31'` → 2 (martes 3-mar); `'0050-01-01'` → 7 (día de 1950) | `null` / día correcto | Desbordes de `new Date(y,m,d)` y años < 100 mapeados a 19xx | `helpersFecha.test.js` |
| D-09 | Baja | `utils/cookieEncryption.js:13-14` | `COOKIE_ENCRYPTION_KEY='contraseña-del-año-contraseña-del-año-'` (≥ 32 caracteres con ñ) | Cifrado correcto | `Invalid key length`: se toman 32 *caracteres* pero se convierten a más de 32 *bytes*; todos los inicios de sesión fallarían | `utilsVarios.test.js › D-09` |
| D-10 | Baja | `utils/sustitucionHelper.js:14-16` (`fechaDiaAnterior`) | `TZ=Pacific/Kiritimati`, `fechaDiaAnterior('2026-03-10')` | `'2026-03-09'` | `'2026-03-08'` (hora local 12:00 + `toISOString()` en UTC). Correcto en America/Costa_Rica, UTC y Europe/Madrid | `helpersFecha.test.js › D-10` |
| D-11 | **Media** | `services/pdfService.js:590` (`pipeReporteSustitucionesPdf`) | Sustitución con `asignaciones` `undefined`/`null` | Imprimir "—" | `TypeError` **después** de `doc.pipe(res)`: la respuesta queda con cabeceras PDF y cuerpo truncado | `otrosPdf.test.js › D-11` |
| D-12 | Baja | `services/epiReportesService.js:116-120` (`cerrarTotales`) | 201 presentes de 400 (50,25 % exacto); 203/400 | 50.3 y 50.8 (redondeo half-up) | 50.2 y 50.7 por error de coma flotante (`(p/t)*1000`) | `epiBordes.test.js › D-12` |
| D-13 | **Media** | `services/epiReportesService.js:59-60` y `:50` (+ `parseFechaUtc:23`) | `GET /api/epi/reporte-asistencia?periodo=semanal&fecha_referencia[]=2026-03-10` (qs "extended" de Express) | 400 o ignorar | `String(['2026-03-10'])` pasa la regex y luego `iso.split` lanza **TypeError → 500**. Con `fecha_inicio[]=…` en personalizado el arreglo llega a `filtros` y a `whereBetween` | `epiBordes.test.js › D-13/D-13b`, `cadenaAutorizacionEpi.test.js` |
| D-14 | Baja | `utils/csvPrecarga.js:169-178` (`parseFechaNacimiento`) | `'31/02/2010'`, `'2010-13-45'`, `'2010-01-01xyz'`, `'99/99/2010'` | `null` | `'2010-02-31'`, `'2010-13-45'`, `'2010-01-01'`, `'2010-99-99'`. También `parseCsvLine` pierde comillas escapadas `""` (D-14b) | `csvPrecarga.test.js` |
| D-15 | Baja | `services/notificacionHistorialService.js:22-28` | `fecha_inicio='2026-01-01xyz'`, `fecha_fin='2026-02-31'`; `id_profesor=null` → 400 mientras `''` se ignora | 400 por fecha inválida | Se trunca a 10 caracteres y no se valida existencia | `notificacionHistorial.test.js` |
| D-16 | **Media** | `utils/seccionHelper.js:54-58` (`obtenerOAsignarSeccion`) | Grado séptimo con secciones `7-1` y `7-3` (2 filas) llenas | Crear `7-4` (o el siguiente número libre) | Intenta crear **`7-3` otra vez**; la tabla `Seccion` no tiene `UNIQUE(nombre_seccion)` (`database/01_bd_postgresql.sql:38-42`), así que se duplicaría en silencio | `cacheSeccion.test.js › D-16` |
| D-17 | **Media** | `services/orientacionService.js:567-586` (`eliminarEstadoPeriodo`) | Eliminar el id de un registro `tipo_estado='expulsion'` | 403 ("La expulsión es definitiva…", como en actualizar/anular) | Se borra sin verificar el tipo; la matrícula cancelada y `persona.activo=false` no se revierten → datos inconsistentes | `orientacionService.test.js › D-17` |
| D-18 | Baja | `services/orientacionService.js:86-102` (`crearEstadoPeriodo`) | `fecha_inicio='14/11/2026'` | 400 por formato | Se compara como texto y se inserta tal cual (fallaría en BD → 500) | `orientacionService.test.js › D-18` |
| D-19 | **Media** | `services/padresDashboardService.js:52-54` (`hoyIso` usa `toISOString()` = UTC) | Reloj del servidor 2026-11-14 20:00 hora de Costa Rica (02:00 UTC del día 15) | "Hoy" = 2026-11-14 | "Hoy" = 2026-11-15 entre las 18:00 y 23:59 locales: el estado que termina hoy **desaparece** de "estados activos", uno que empieza mañana **aparece** activo, y el rango anual de asistencia llega a mañana | `servicios/padresDashboard.test.js › D-19` (+ `it.fails`) |
| D-20 | **Media** (nuevo rol) | `services/personalService.js:20` (`ROLES_PERSONAL = ['profesor','orientador']`) usado en `listarPersonal:27`, `actualizarPersonal:82`, `cambiarEstadoPersonal:154` | Usuario con `nombre_rol='epi'` (id 77) → `cambiarEstadoPersonal(77, false)` | El administrador puede listar, editar e **inactivar** cuentas EPI | 404 "Personal no encontrado": las cuentas EPI se pueden crear (`postPersona`) pero no aparecen en el módulo de personal ni se pueden inactivar. En el backend no se encontró otra ruta que inactive personas con rol `epi` (`superadminService` solo maneja `administrador`; `archivarEstudiante` solo `estudiante`) | `epi/gestionPersonalEpi.test.js › D-20` (+ `it.fails`) |

### Observaciones (no son defectos estrictos, pero conviene revisarlas)

| ID | Tema | Detalle | Prueba |
|---|---|---|---|
| O-01 | Robustez | 10 de 13 middlewares de `verificarRoles.js` usan `req.user.rol` sin `?.` y lanzan `TypeError` si se montan sin `verificarToken`; `verificarReportesEpi` sí usa `?.` (inconsistente). | `verificarRoles.test.js` |
| O-02 | PDF | `txt()` (modo Helvetica) solo reemplaza vocales con tilde y ñ; el comentario "Helvetica no soporta ñ" es inexacto (WinAnsi sí la incluye). | `reporteEpiPdfSinFuentes.test.js` |
| O-03 | Consistencia | `extractPrecargaRow` arma "Nombre Apellido1 Apellido2" mientras `buildNombreCompletoCr` usa "Apellido1 Apellido2 Nombre". | `csvPrecarga.test.js` |
| O-04 | **Seguridad** | `tokenEstaRevocado` es *fail-open*: si la consulta a `jwt_revocado` falla, un token revocado se acepta (`tokenRevocationService.js:57-60`). | `verificarToken.test.js` |
| O-05 | Seguridad | Si `persona.nombre_rol` es `null` en BD, se conserva el rol del JWT (`verificarToken.js:50`). | `verificarToken.test.js` |
| O-06 | Rendimiento | `getCached` no deduplica cargas concurrentes (dos llamadas → dos consultas). | `cacheSeccion.test.js` |
| O-08 | **Consistencia funcional** | El mismo conjunto de marcas (1 presente, 1 tardía, 1 justificada, 1 injustificada) da **50 %** en el reporte EPI `((P+T)/total)` y **75 %** en reportes estratégicos `((total−AI)/total)`; y `calcularResumenAsistencia` (encargados) usa solo presentes. Tres definiciones de "asistencia". | `reportesService.test.js` |
| O-09 | Seguridad | `reportesController` devuelve `e.message` de errores internos de BD al cliente con HTTP 500 (p. ej. `relation "asistencia" does not exist`). | `reportesService.test.js` |
| O-10 | Rendimiento | `padresAsistenciaService` hace una consulta de horario **por cada marca** (N+1): 50 marcas → 50 consultas. | `padresAsistencia.test.js` |
| O-11 | Seguridad | `documento_adjunto` acepta cualquier dominio `http(s)` y rutas `/uploads/../../etc/passwd` sin normalizar. | `justificacionService.test.js` |
| O-12 | Consistencia | Un estado que termina **hoy** figura `es_vigente=false` en el historial de orientación, pero para asistencia sigue activo (`fecha_fin >= fecha`). | `orientacionService.test.js` |
| O-13 | Redacción | Asunto de correo "Orientación: **Suspensión registrado** para …" (concordancia de género). | `notificacionCorreo.test.js` |
| O-14 | PDF | Ver D-07 (título de sección largo). | `reporteEpiPdfBordes.test.js` |
| O-15 | Validación | `postPersona` (alta de usuarios EPI) no valida formato de correo, cédula ni fecha de nacimiento (`'no-es-correo'`, `'ayer'` → 201). | `registroPersonaEpi.test.js` |
| O-16 | Zona horaria | Sin `fecha_referencia`, `calcularRangoPeriodo` usa la fecha **local del servidor** (`hoyIso`). Si el backend corre en UTC (habitual en la nube), entre las 18:00 y 23:59 de Costa Rica el periodo por defecto ya es el del día siguiente (p. ej. domingo 19:00 → semana siguiente). Con `fecha_referencia` explícita el resultado es independiente de la zona. | `calcularRangoPeriodo.test.js › zona horaria del servidor` |
| — | Seguridad (fuera de alcance, leído sin ejecutar) | `database/34_bd_rol_epi.sql` crea las cuentas EPI con contraseña inicial fija `liceomarti` (con `primer_login=TRUE`). | — |

Aspectos **verificados como correctos** (destacables): rol `epi` con mínimo privilegio (solo `puedeVerReportesEpi`; sin acceso a matrículas, justificaciones, notificaciones ni orientación); el rol se refresca desde BD en cada petición (token "epi" con BD "profesor" → 403); JWT con `alg: none`, clave ajena o expirado → 403; ids basura no generan inyección SQL (siempre se parametrizan enteros); escape de comodines LIKE en búsquedas; escape HTML en plantillas de correo; semanas lunes–domingo correctas en 3 años completos y cruces de mes/año; bisiestos 1896–2104; invariante Σmaterias = Σsecciones = total general; PDF determinista y con "Página X de Y" correcto incluso con 200 secciones o 90 días de detalle.

---

## 8. Cosas por mejorar (recomendaciones, **no aplicadas**)

1. **Validación estricta de fechas** con una función común (`esFechaIsoValida`) que verifique existencia real (p. ej. `Date.UTC` + comparación de componentes) y tipo `string`; usarla en `calcularRangoPeriodo`, `notificacionHistorialService`, `orientacionService`, `csvPrecarga`, `leccionHelper` (D-01, D-02, D-08, D-14, D-15, D-18).
2. **Rechazar parámetros de consulta no escalares**: si `typeof valor !== 'string'` (arreglos/objetos de `qs`), responder 400; o configurar `app.set('query parser', 'simple')` (D-13).
3. **Enteros estrictos**: `/^\d+$/.test(String(v))` antes de `parseInt`, y rango ≤ 2 147 483 647 (D-03, D-04; también `reportesService` acepta 0 y negativos).
4. **PDF**: truncar manualmente con `doc.widthOfString` (o usar `height` + `ellipsis` en vez de `lineBreak:false`), calcular el alto de fila con *todas* las columnas, y mostrar "Sin fecha" cuando `fecha` esté vacía (D-06, D-07). Proteger `s.asignaciones ?? []` y generar el documento **antes** de hacer `pipe` para poder responder un error limpio (D-11).
5. **Redondeo**: `Math.round(((p + t) * 1000) / total) / 10` evita el error de coma flotante (D-12).
6. **Una sola definición de "% de asistencia"** documentada y compartida (`estadoAsistencia.js`) entre EPI, reportes estratégicos y encargados (O-08); si las diferencias son intencionales, rotular cada indicador con su fórmula en la UI.
7. **Orientación**: impedir `DELETE` de expulsiones (o revertir cierre académico) (D-17); alinear `es_vigente` con la regla de asistencia (O-12).
8. **Secciones**: calcular el siguiente número a partir del máximo `numero_seccion` del grado y añadir `UNIQUE(nombre_seccion)` (o `(numero_seccion, prefijo)`) (D-16).
9. **Seguridad**: hacer *fail-closed* la verificación de revocación o al menos alertar (O-04); no reutilizar el rol del JWT si BD devuelve `null` (O-05); no devolver mensajes internos en 500 (O-09); restringir `documento_adjunto` a una lista de dominios/rutas normalizadas (O-11); derivar la clave AES con `sha256` siempre, o medir bytes y no caracteres (D-09); evitar contraseñas iniciales fijas en scripts SQL.
10. **Fechas "de hoy"**: centralizar un único `hoyLocalIso()` (zona `America/Costa_Rica`) y no usar `toISOString()` para la fecha del día (D-19, D-10).
11. **Rol EPI en la administración**: incluir `epi` en `ROLES_PERSONAL` (o crear una gestión genérica de cuentas) para poder listar, editar e inactivar cuentas EPI (D-20).
12. **Robustez**: usar `req.user?.rol` en todos los middlewares (O-01); `Object.hasOwn(ETIQUETAS_ROL, rol)` o `Map` (D-05).
13. **Rendimiento**: consultar los horarios en una sola consulta (`whereIn`) en `padresAsistenciaService` (O-10); deduplicar promesas en `getCached` (O-06).
14. **Pruebas**: integrar esta suite en CI (`npm run coverage` con umbral ≥ 95 % de ramas en el alcance EPI); cuando se corrija un defecto, convertir su `it.fails` en `it` y eliminar la prueba que documenta el comportamiento defectuoso.

---

## 9. Estructura de la carpeta

```
pruebas/backend-unitarias/
├── package.json / vitest.config.js
├── tests/
│   ├── helpers/        dbMock.js (doble de Knex), epiFixtures.js, pdf.js (sumidero + pdfjs), setup.js, stubs/
│   ├── epi/            rango, reporte, estudiantes, bordes, controlador+rutas, cadena de autorización, alta de personas EPI
│   ├── pdf/            reporte EPI (válido, páginas, texto, bordes, sin fuentes), otros PDF
│   ├── middlewares/    verificarRoles, verificarToken, tokenRevocation
│   ├── servicios/      notificaciones (historial, correo), reportes, padres, justificaciones, orientación
│   ├── utils/          roles, estadoAsistencia, fechas, csv, varios, BD, cache/sección, plantillas
│   └── ramas/          pruebas dirigidas a ramas no cubiertas
├── scripts/            ciclo.sh, resumen-ciclo.mjs, comparar-ciclos.mjs, lista-pruebas.mjs, tabla-cobertura.mjs
├── resultados/         ciclos.csv, salida-ciclo-N.txt, estados-ciclo-N.json, fallidas-ciclo-N.txt, lista-pruebas.md, tabla-cobertura.md
└── coverage/           informe HTML/JSON de la última corrida con cobertura
```

---

## Anexo A — Estado de cada prueba (última corrida)

<!-- ANEXO_LISTA -->
#### `tests/epi/cadenaAutorizacionEpi.test.js`

- **GET /epi/reporte-asistencia (cadena completa)**
  - PASÓ — rol en BD epi → 200
  - PASÓ — rol en BD administrador → 200
  - PASÓ — rol en BD super_administrador → 200
  - PASÓ — rol en BD orientador → 403
  - PASÓ — rol en BD profesor → 403
  - PASÓ — rol en BD padre_de_familia → 403
  - PASÓ — token con rol "epi" pero BD dice "profesor" (rol revocado) → 403
  - PASÓ — sin cookie → 401 y nunca se consulta asistencia
  - PASÓ — parámetros inválidos con rol EPI → el AppError 400 llega a next(err)
  - PASÓ — D-13 en la cadena: fecha_referencia[]=… produce TypeError (→ 500 en errorHandler) en lugar de 400
  - PASÓ — /epi/secciones/:idSeccion/estudiantes con EPI devuelve lista vacía
- **propiedades de calcularRangoPeriodo en 2000–2030**
  - PASÓ — mensual: empieza el día 1 y el día siguiente al fin es día 1 del mes siguiente
  - PASÓ — febrero tiene 29 días exactamente en años bisiestos

#### `tests/epi/calcularRangoPeriodo.test.js`

- **calcularRangoPeriodo — semanal (lunes a domingo)**
  - PASÓ — ref 2026-11-11 → 2026-11-09 .. 2026-11-15
  - PASÓ — ref 2026-11-09 → 2026-11-09 .. 2026-11-15
  - PASÓ — ref 2026-11-15 → 2026-11-09 .. 2026-11-15
  - PASÓ — ref 2026-11-14 → 2026-11-09 .. 2026-11-15
  - PASÓ — ref 2026-12-01 → 2026-11-30 .. 2026-12-06
  - PASÓ — ref 2026-04-30 → 2026-04-27 .. 2026-05-03
  - PASÓ — ref 2026-01-01 → 2025-12-29 .. 2026-01-04
  - PASÓ — ref 2025-12-31 → 2025-12-29 .. 2026-01-04
  - PASÓ — ref 2027-01-03 → 2026-12-28 .. 2027-01-03
  - PASÓ — ref 2024-02-29 → 2024-02-26 .. 2024-03-03
  - PASÓ — ref 2023-02-28 → 2023-02-27 .. 2023-03-05
  - PASÓ — ref 2000-02-29 → 2000-02-28 .. 2000-03-05
  - PASÓ — el rango semanal siempre dura 7 días y empieza en lunes (barrido de 3 años)
- **calcularRangoPeriodo — mensual**
  - PASÓ — ref 2026-11-14 → 2026-11-01 .. 2026-11-30
  - PASÓ — ref 2026-01-31 → 2026-01-01 .. 2026-01-31
  - PASÓ — ref 2024-02-10 → 2024-02-01 .. 2024-02-29
  - PASÓ — ref 2023-02-10 → 2023-02-01 .. 2023-02-28
  - PASÓ — ref 1900-02-10 → 1900-02-01 .. 1900-02-28
  - PASÓ — ref 2000-02-10 → 2000-02-01 .. 2000-02-29
  - PASÓ — ref 2026-12-31 → 2026-12-01 .. 2026-12-31
  - PASÓ — ref 2026-04-15 → 2026-04-01 .. 2026-04-30
  - PASÓ — periodo desconocido/ausente (undefined) cae a mensual
  - PASÓ — periodo desconocido/ausente (null) cae a mensual
  - PASÓ — periodo desconocido/ausente () cae a mensual
  - PASÓ — periodo desconocido/ausente (SEMANAL) cae a mensual
  - PASÓ — periodo desconocido/ausente (diario) cae a mensual
  - PASÓ — periodo desconocido/ausente (123) cae a mensual
  - PASÓ — periodo desconocido/ausente (mensual' OR 1=1 --) cae a mensual
- **calcularRangoPeriodo — anual**
  - PASÓ — año calendario completo
  - PASÓ — 31 de diciembre pertenece a su propio año
- **calcularRangoPeriodo — fecha de referencia inválida usa "hoy" (hora local)**
  - PASÓ — ref=undefined → usa la fecha del sistema
  - PASÓ — ref= → usa la fecha del sistema
  - PASÓ — ref=14/11/2026 → usa la fecha del sistema
  - PASÓ — ref=2026-1-5 → usa la fecha del sistema
  - PASÓ — ref=abc → usa la fecha del sistema
  - PASÓ — ref=2026-11-14'; DROP TABLE asistencia;-- → usa la fecha del sistema
  - PASÓ — ref=20261114 → usa la fecha del sistema
  - PASÓ — justo antes de medianoche local sigue tomando el día local (no UTC)
  - PASÓ — sin argumentos válidos lanza TypeError (el parámetro es obligatorio)
- **calcularRangoPeriodo — fechas con formato correcto pero inexistentes**
  - PASÓ — 2026-02-30 semanal se normaliza a 2 de marzo (no se rechaza)
  - PASÓ — mes 13 en mensual se interpreta como enero del año siguiente
  - PASÓ — DEFECTO D-01: mes 00 en anual devuelve el año anterior (debería rechazarse con 400)
- **calcularRangoPeriodo — personalizado**
  - PASÓ — devuelve las fechas tal cual
  - PASÓ — inicio == fin (un solo día) es válido
  - PASÓ — ignora fecha_referencia
  - PASÓ — rechaza con AppError 400 inicio=undefined fin=2026-01-31
  - PASÓ — rechaza con AppError 400 inicio=2026-01-01 fin=undefined
  - PASÓ — rechaza con AppError 400 inicio= fin=
  - PASÓ — rechaza con AppError 400 inicio=null fin=null
  - PASÓ — rechaza con AppError 400 inicio=2026/01/01 fin=2026-01-31
  - PASÓ — rechaza con AppError 400 inicio=2026-01-01 fin=31-01-2026
  - PASÓ — rechaza con AppError 400 inicio=2026-01-01' OR '1'='1 fin=2026-01-31
  - PASÓ — rechaza con AppError 400 inicio=2026-01-01T00:00:00 fin=2026-01-31
  - PASÓ — rechaza con AppError 400 inicio= 2026-01-01 fin=2026-01-31
  - PASÓ — rechaza con AppError 400 inicio=2026-1-1 fin=2026-01-31
  - PASÓ — rechaza inicio posterior a fin con mensaje específico
  - PASÓ — DEFECTO D-02: acepta fechas inexistentes (2026-02-31, 2026-13-45) que luego llegan a la BD
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-02 (expectativa correcta): 2026-02-31 debería rechazarse con AppError 400
  - PASÓ — no limita la amplitud del rango (0001-01-01 a 9999-12-31 se acepta)
- **PERIODOS_EPI**
  - PASÓ — expone los 4 periodos soportados
- **zona horaria del servidor (fecha de referencia por defecto)**
  - PASÓ — OBSERVACIÓN O-16: con el servidor en UTC, el domingo 15-nov-2026 a las 19:00 de Costa Rica el "semanal" por defecto ya es la semana siguiente
  - PASÓ — con fecha_referencia explícita el resultado no depende de la zona horaria

#### `tests/epi/epiBordes.test.js`

- **número de consultas emitidas (Promise.all)**
  - PASÓ — query {} opciones {} → 3 consultas
  - PASÓ — query {} opciones {"incluirDetalle":true} → 4 consultas
  - PASÓ — query {"id_estudiante":1} opciones {} → 4 consultas
  - PASÓ — query {"id_estudiante":1} opciones {"incluirDetalle":true} → 5 consultas
- **más entradas de id**
  - PASÓ — id_materia=true
  - PASÓ — id_materia=false
  - PASÓ — id_materia={}
  - PASÓ — id_materia=[]
  - PASÓ — id_materia="NaN"
  - PASÓ — id_materia="Infinity"
  - PASÓ — id_materia="-0"
  - PASÓ — id_materia="0x10"
  - PASÓ — "+5" se acepta como 5 (parseInt tolera el signo)
  - PASÓ — id Number.MAX_SAFE_INTEGER se acepta
  - PASÓ — id 1e21 (Number) → parseInt("1e+21") = 1 (se filtra por la sección equivocada)
- **agregación: filas repetidas e identidad de sección**
  - PASÓ — filas repetidas (misma sección/materia/estado) se suman
  - PASÓ — mismo id con distinto nombre: prevalece el primer nombre visto
  - PASÓ — id 1 (number) y "1" (string) se tratan como secciones distintas (Map por identidad)
  - PASÓ — invariante: total general = Σ secciones = Σ materias = Σ categorías (200 filas pseudoaleatorias, semilla fija)
- **redondeo del porcentaje (punto flotante)**
  - PASÓ — DEFECTO D-12 (menor): 201 de 400 = 50,25 % exacto se redondea a 50.2 (half-up esperado 50.3)
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-12 (expectativa correcta): 203/400 = 50,75 % debería mostrarse 50.8
  - PASÓ — 0 ≤ % ≤ 100 y como máximo 1 decimal (barrido de pares p/t)
- **aislamiento entre llamadas concurrentes**
  - PASÓ — dos reportes simultáneos con filtros distintos no se mezclan
- **detalle: casos adicionales**
  - PASÓ — mismo estudiante con incidencias el mismo día en dos secciones aparece una vez por sección
  - PASÓ — materia null se agrega como null a la lista (no se filtra)
  - PASÓ — estado con espacios (" ausente ") no se normaliza: queda como estado desconocido
- **parámetros como arreglo (qs "extended" de Express: ?x[]=valor)**
  - PASÓ — DEFECTO D-13: fecha_referencia=["2026-03-10"] pasa la regex (String(arr)) y luego revienta con TypeError → HTTP 500
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-13 (expectativa correcta): un arreglo debería rechazarse con AppError 400 o ignorarse
  - PASÓ — DEFECTO D-13b: personalizado con fecha_inicio=["2026-01-01"] se acepta y el arreglo llega a filtros y a whereBetween
  - PASÓ — periodo como arreglo cae a mensual (no lanza)
- **rendimiento con volúmenes grandes (BD simulada)**
  - PASÓ — 100 000 filas agregadas se procesan en < 3 s
  - PASÓ — listarEstudiantesSeccionEpi con 10 000 estudiantes (5 000 duplicados entre fuentes)
- **expectativas correctas de defectos (it.fails: fallan mientras el defecto exista)**
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-03 (expectativa correcta): id_seccion="5abc" debería rechazarse con AppError 400

#### `tests/epi/epiControllerRutas.test.js`

- **epiController**
  - PASÓ — getReporteAsistenciaEpi pasa req.query y responde JSON (sin detalle)
  - PASÓ — getEstudiantesSeccionEpi pasa params.idSeccion y query
  - PASÓ — getReporteAsistenciaEpiPdf: pide detalle, fija cabeceras y delega en pdfService
  - PASÓ — errores del servicio se propagan (asyncHandler los envía a next) y no se fijan cabeceras
- **epiRoutes — cableado**
  - PASÓ — expone exactamente 3 rutas GET
  - PASÓ — cada ruta aplica primero verificarTokenInterno y luego verificarReportesEpi
  - PASÓ — el handler envuelto llama a next(err) cuando el servicio falla

#### `tests/epi/gestionPersonalEpi.test.js`

- **personalService y el rol EPI**
  - PASÓ — DEFECTO D-20: cambiarEstadoPersonal no encuentra a un usuario EPI (ROLES_PERSONAL = profesor, orientador) → 404
  - PASÓ — DEFECTO D-20: actualizarPersonal tampoco permite editar a un usuario EPI → 404
  - PASÓ — DEFECTO D-20: listarPersonal solo pide profesor y orientador (los EPI no aparecen)
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-20 (expectativa correcta): un administrador debería poder inactivar una cuenta EPI
  - PASÓ — id inválido → 400

#### `tests/epi/listarEstudiantesSeccionEpi.test.js`

- **listarEstudiantesSeccionEpi**
  - PASÓ — une matriculados + con asistencia sin duplicar y ordena por nombre
  - PASÓ — si el mismo id aparece en ambas fuentes, prevalece el registro de asistencia (último set)
  - PASÓ — aplica filtros correctos: sección, año, excluye matrícula cancelada, rango de fechas del año
  - PASÓ — año ausente o no numérico usa el año actual
  - PASÓ — DEFECTO D-04: anio=-5 no se valida → anio -5 y rango "-5-01-01" llega a la BD
  - PASÓ — DEFECTO D-04: anio=0 no se valida → anio 0 y rango "0-01-01" llega a la BD
  - PASÓ — DEFECTO D-04: anio=20261 no se valida → anio 20261 y rango "20261-01-01" llega a la BD
  - PASÓ — DEFECTO D-04: anio=2026abc no se valida → anio 2026 y rango "2026-01-01" llega a la BD
  - PASÓ — id_seccion vacío (undefined) → AppError 400 "id_seccion requerido"
  - PASÓ — id_seccion vacío (null) → AppError 400 "id_seccion requerido"
  - PASÓ — id_seccion vacío () → AppError 400 "id_seccion requerido"
  - PASÓ — id_seccion vacío (  ) → AppError 400 "id_seccion requerido"
  - PASÓ — id_seccion inválido (0) → AppError 400 "id_seccion inválido" (o acepta prefijo numérico)
  - PASÓ — id_seccion inválido (-3) → AppError 400 "id_seccion inválido" (o acepta prefijo numérico)
  - PASÓ — id_seccion inválido (abc) → AppError 400 "id_seccion inválido" (o acepta prefijo numérico)
  - PASÓ — id_seccion inválido (1'; DROP TABLE persona;--x) → AppError 400 "id_seccion inválido" (o acepta prefijo numérico)
  - PASÓ — sección sin estudiantes → lista vacía
  - PASÓ — propaga errores de BD

#### `tests/epi/obtenerReporteAsistenciaEpi.test.js`

- **obtenerReporteAsistenciaEpi — estructura y caso vacío**
  - PASÓ — sin filas devuelve totales en cero y 0 % (sin división por cero)
  - PASÓ — query por defecto ({}) usa periodo mensual del mes actual
  - PASÓ — devuelve los catálogos de secciones y materias
- **obtenerReporteAsistenciaEpi — agregación (caja blanca de sumarEstado/cerrarTotales)**
  - PASÓ — suma por estado, materia y sección; % = (presentes+tardías)/total con 1 decimal
  - PASÓ — 1 presentes de 3 → 33.3 %
  - PASÓ — 2 presentes de 3 → 66.7 %
  - PASÓ — 1 presentes de 6 → 16.7 %
  - PASÓ — 1 presentes de 8 → 12.5 %
  - PASÓ — 1 presentes de 1000 → 0.1 %
  - PASÓ — 1 presentes de 2001 → 0 %
  - PASÓ — 999 presentes de 1000 → 99.9 %
  - PASÓ — 1999 presentes de 2000 → 100 %
  - PASÓ — 5 presentes de 5 → 100 %
  - PASÓ — estados desconocidos, nulos y en mayúsculas
  - PASÓ — cantidad no numérica o nula se toma como 0; cantidad numérica (no string) también funciona
  - PASÓ — cantidad negativa no se valida (se resta del total) — comportamiento documentado
  - PASÓ — cantidades grandes (bigint de COUNT como string) se suman sin pérdida
  - PASÓ — volumen alto: 60 secciones × 25 materias × 4 estados (6 000 filas) agrega correctamente
  - PASÓ — ordena secciones con collation española y numérica (7-2 < 7-10 < 10-1)
  - PASÓ — el porcentaje de la sección no es el promedio de % por materia sino ponderado por registros
- **obtenerReporteAsistenciaEpi — filtros e ids (parseEntero)**
  - PASÓ — aplica filtros de sección, materia y rango en la consulta agregada
  - PASÓ — sin filtros no agrega cláusulas where
  - PASÓ — id de sección filtrado que no existe en el catálogo → nombre_seccion null
  - PASÓ — RIESGO: si el catálogo trae id_seccion como string (p.ej. columna bigint en pg) no se encuentra el nombre
  - PASÓ — id_seccion=0 inválido → AppError 400 sin consultar la BD
  - PASÓ — id_seccion=-1 inválido → AppError 400 sin consultar la BD
  - PASÓ — id_seccion=abc inválido → AppError 400 sin consultar la BD
  - PASÓ — id_materia=-10 inválido → AppError 400 sin consultar la BD
  - PASÓ — id_materia=0 inválido → AppError 400 sin consultar la BD
  - PASÓ — id_estudiante=x1 inválido → AppError 400 sin consultar la BD
  - PASÓ — id_estudiante=' OR 1=1 -- inválido → AppError 400 sin consultar la BD
  - PASÓ — id_seccion=NaN inválido → AppError 400 sin consultar la BD
  - PASÓ — id vacío (null) se ignora (sin filtro)
  - PASÓ — id vacío (undefined) se ignora (sin filtro)
  - PASÓ — id vacío () se ignora (sin filtro)
  - PASÓ — id vacío (   ) se ignora (sin filtro)
  - PASÓ — DEFECTO D-03: parseEntero acepta entradas parcialmente numéricas ("5abc" → 5) en lugar de rechazarlas
  - PASÓ — DEFECTO D-03: parseEntero acepta entradas parcialmente numéricas ("1 OR 1=1" → 1) en lugar de rechazarlas
  - PASÓ — DEFECTO D-03: parseEntero acepta entradas parcialmente numéricas ("1.9" → 1) en lugar de rechazarlas
  - PASÓ — DEFECTO D-03: parseEntero acepta entradas parcialmente numéricas ("1e3" → 1) en lugar de rechazarlas
  - PASÓ — DEFECTO D-03: parseEntero acepta entradas parcialmente numéricas ("  7  " → 7) en lugar de rechazarlas
  - PASÓ — DEFECTO D-03: parseEntero acepta entradas parcialmente numéricas (["3","4"] → 3) en lugar de rechazarlas
  - PASÓ — id muy grande (> int4 de PostgreSQL) se acepta sin validar rango
  - PASÓ — el error de periodo se lanza antes que el de ids
- **obtenerReporteAsistenciaEpi — estudiante seleccionado**
  - PASÓ — filtra por estudiante y carga nombre/cédula
  - PASÓ — estudiante inexistente → nombre y cédula null
  - PASÓ — sin estudiante no consulta la tabla persona
- **obtenerReporteAsistenciaEpi — detalle diario (construirDetalleDiario)**
  - PASÓ — incluirDetalle=false no ejecuta la consulta de detalle
  - PASÓ — sin estudiante: solo incidencias (whereIn tardanza/ausente/justificado) y detalle_solo_incidencias=true
  - PASÓ — con estudiante: todas las marcas (sin whereIn) y detalle_solo_incidencias=false
  - PASÓ — agrupa fecha → sección → estudiante+estado y acumula materias sin duplicar
  - PASÓ — etiquetas de condición para todos los estados conocidos y desconocidos; orden con desconocidos al final
  - PASÓ — fechas Date se convierten con hora local; fechas string con hora se truncan; null → ""
  - PASÓ — nombres nulos de estudiante se ordenan primero sin lanzar error
  - PASÓ — volumen alto de detalle: 20 000 filas
- **obtenerReporteAsistenciaEpi — errores de BD**
  - PASÓ — propaga el error si una consulta falla

#### `tests/epi/registroPersonaEpi.test.js`

- **postPersona — rol EPI**
  - PASÓ — registra una persona EPI (201) dentro de una transacción, sin materias habilitadas
  - PASÓ — materias_habilitadas enviadas para EPI se ignoran (solo aplican a profesor)
  - PASÓ — {"nombre_rol":"administrador"} → 403 sin escribir en BD
  - PASÓ — {"nombre_rol":"super_administrador"} → 403 sin escribir en BD
  - PASÓ — {"nombre_rol":"estudiante"} → 403 sin escribir en BD
  - PASÓ — {"nombre_rol":"EPI"} → 400 sin escribir en BD
  - PASÓ — {"nombre_rol":"epi "} → 400 sin escribir en BD
  - PASÓ — {"nombre_rol":"rol_inventado"} → 400 sin escribir en BD
  - PASÓ — {"correo":""} → 400 sin escribir en BD
  - PASÓ — {} → 400 sin escribir en BD
  - PASÓ — {"nombre_rol":"profesor"} → 400 sin escribir en BD
  - PASÓ — correo o cédula duplicados → 409
  - PASÓ — profesor con materias: inserta habilitaciones (control)
  - PASÓ — OBSERVACIÓN O-15: no se valida formato de correo, cédula ni fecha (p. ej. correo "no-es-correo")

#### `tests/middlewares/tokenRevocation.test.js`

- **tokenRevocationService**
  - PASÓ — firmarTokenAcceso genera jti único hex de 32
  - PASÓ — (1º) si CREATE TABLE falla se registra el error, la consulta sigue y se reintenta en la siguiente llamada
  - PASÓ — (2º) tokenEstaRevocado: jti vacío → false sin tocar BD; la tabla se crea solo una vez
  - PASÓ — tokenEstaRevocado devuelve true si existe la fila
  - PASÓ — revocarJti inserta con onConflict(jti).ignore(); id no numérico → null; sin jti no hace nada
  - PASÓ — revocarJti: error de BD se captura
  - PASÓ — revocarDecoded usa exp del token o +1h
  - PASÓ — limpiarRevocadosExpirados: throttle de 15 min salvo force; devuelve número o 0

#### `tests/middlewares/verificarRoles.test.js`

- **verificarRoles — cobertura de exports**
  - PASÓ — todos los middlewares exportados están en la matriz de pruebas
- **verificarConsultaCatalogoPersonas**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarPersonalAcademico**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarSuperAdministrador**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarAdminMatricula**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarAdminAsignacion**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarProfesorOAdmin**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarConsultaEstudiantes**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarPadreDeFamilia**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarAdminOOrientador**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarLecturaOrientacion**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarAdminOReportes**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarComprobanteOrientacionLectura**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **verificarReportesEpi**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — usuario sin rol válido {} → 403
  - PASÓ — usuario sin rol válido {"rol":null} → 403
  - PASÓ — usuario sin rol válido {"rol":"EPI"} → 403
  - PASÓ — usuario sin rol válido {"rol":"administrador "} → 403
- **req.user ausente (middleware usado sin verificarToken)**
  - PASÓ — verificarConsultaCatalogoPersonas usa optional chaining → responde 403
  - PASÓ — verificarPersonalAcademico usa optional chaining → responde 403
  - PASÓ — verificarReportesEpi usa optional chaining → responde 403
  - PASÓ — OBSERVACIÓN O-01: verificarSuperAdministrador lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarAdminMatricula lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarAdminAsignacion lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarProfesorOAdmin lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarConsultaEstudiantes lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarPadreDeFamilia lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarAdminOOrientador lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarLecturaOrientacion lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarAdminOReportes lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
  - PASÓ — OBSERVACIÓN O-01: verificarComprobanteOrientacionLectura lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)
- **verificarReportesEpi — detalles**
  - PASÓ — devuelve el resultado de res.json (return temprano) y no llama next
  - PASÓ — no modifica req.user
  - PASÓ — rol como objeto con toString "epi" no se acepta (comparación estricta)

#### `tests/middlewares/verificarToken.test.js`

- **verificarTokenInterno**
  - PASÓ — sin cookie → 401 "Token acceso faltante"
  - PASÓ — cookie con JWT sin cifrar (manipulada) → 401
  - PASÓ — token válido de usuario EPI activo → next() y req.user enriquecido desde BD
  - PASÓ — el rol se toma de la BD (token dice administrador, BD dice epi → epi)
  - PASÓ — OBSERVACIÓN O-05: si nombre_rol en BD es null se conserva el rol del JWT (privilegio potencialmente obsoleto)
  - PASÓ — usuario inexistente → 403
  - PASÓ — persona inactiva → 403
  - PASÓ — cuenta de sistema inactiva → 403
  - PASÓ — sin cuenta de sistema (null) → 403
  - PASÓ — persona_activa null (no false) se considera activa
  - PASÓ — id no numérico en el token → 403 sin consultar persona
  - PASÓ — token revocado (jti en jwt_revocado) → 401
  - PASÓ — OBSERVACIÓN O-04 (seguridad): si la consulta de revocación falla, el token se acepta (fail-open)
  - PASÓ — token sin jti (antiguo) se acepta sin consultar revocación
  - PASÓ — JWT firmado con otra clave → 403 "Token acceso inválido"
  - PASÓ — JWT alg "none" → 403 "Token acceso inválido"
  - PASÓ — JWT expirado → 403 "Token acceso inválido"
  - PASÓ — JWT basura → 403 "Token acceso inválido"
  - PASÓ — error de BD al consultar persona → 403 (capturado)
- **verificarTokenCambioContrasena**
  - PASÓ — sin tokens → 401
  - PASÓ — token de otro usuario → 403
  - PASÓ — token pendiente de primer login (cookie pending_password_change) → next
  - PASÓ — revocado → 401; cuenta inactiva → 403; token inválido → 403

#### `tests/pdf/otrosPdf.test.js`

- **pipeComprobanteMatriculaPdf**
  - PASÓ — con tutor legal
  - PASÓ — encargado sin patria potestad y matrícula con campos vacíos
  - PASÓ — sin tutor → guiones
- **pipeReporteAsistenciaHijoPdf**
  - PASÓ — sin registros
  - PASÓ — muchos registros → varias páginas con "(cont.)" y estados especiales visibles
  - PASÓ — registro sin fecha, materia, condición ni estado no rompe la generación
- **pipeComprobanteOrientacionPdf**
  - PASÓ — con fecha fin y motivo
  - PASÓ — expulsión sin fecha fin, sin motivo, sin año a cursar, sin etiqueta
- **pipeReporteOrientacionFiltradoPdf**
  - PASÓ — sin filtros ni registros
  - PASÓ — con filtros y 100 registros → paginación horizontal; motivo truncado a 120 caracteres
- **pipeReporteSustitucionesPdf**
  - PASÓ — vacío con filtro de persona
  - PASÓ — 50 sustituciones → varias páginas; etiquetas de estado; estado desconocido sin traducir
  - PASÓ — DEFECTO D-11: asignaciones null/undefined provoca TypeError (s.asignaciones.map) con el stream ya abierto
- **expectativas correctas (it.fails)**
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-11 (expectativa correcta): asignaciones ausentes deberían imprimirse como "—" sin lanzar

#### `tests/pdf/reporteEpiPdf.test.js`

- **pipeReporteAsistenciaEpiPdf — validez del documento**
  - PASÓ — reporte vacío (0 secciones): PDF válido de 1 página con mensaje de "sin registros"
  - PASÓ — usa logos locales: no realiza peticiones HTTP
  - PASÓ — conserva tildes y ñ (fuente Roboto embebida)
  - PASÓ — estudiante sin cédula: no imprime paréntesis vacíos
  - PASÓ — 1 sección: contiene título de sección, materias y fila de total, sin "Resumen por sección"
  - PASÓ — 2+ secciones: incluye "Resumen por sección" y "Total general"
  - PASÓ — el número de páginas crece con los datos y cada página tiene "Página X de Y"
  - PASÓ — nombres de materia muy largos: el PDF se genera en 1 página
  - PASÓ — DEFECTO D-07: con lineBreak:false + ellipsis pdfkit igual parte el nombre largo en varias líneas que desbordan la fila de 16 pt
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-07 (expectativa correcta): el nombre de materia debería ocupar una sola línea dentro de su celda
  - PASÓ — valores nulos/indefinidos en nombres no rompen la generación
  - PASÓ — una sección con 80 materias (no cabe en una página) se divide entre páginas
- **pipeReporteAsistenciaEpiPdf — detalle diario**
  - PASÓ — detalle vacío con soloIncidencias → página extra con mensaje de "no se registraron tardías"
  - PASÓ — detalle vacío para estudiante (soloIncidencias=false) → "Sin marcas en el periodo."
  - PASÓ — detalle_solo_incidencias ausente (undefined) se trata como solo incidencias
  - PASÓ — imprime fecha larga en español, sección, resumen singular/plural, estudiantes y materias
  - PASÓ — muchos estudiantes en un día → continúa en páginas nuevas con "(continuación)"
  - PASÓ — fecha vacía en el detalle (fecha null en BD → "") — DEFECTO D-06: imprime "undefined undefined de undefined de 0"
  - PASÓ — estudiante sin nombre ni cédula → "—"; materias vacías
  - PASÓ — lista de materias muy larga en una fila de detalle: el PDF se genera y la paginación se mantiene coherente
  - PASÓ — domingo y año bisiesto en fecha larga
- **integración servicio → PDF (BD simulada)**
  - PASÓ — el reporte producido por obtenerReporteAsistenciaEpi se convierte en PDF con los datos
- **expectativas correctas de defectos PDF (it.fails)**
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-06 (expectativa correcta): una fecha vacía en el detalle no debería imprimir "undefined"

#### `tests/pdf/reporteEpiPdfBordes.test.js`

- **PDF EPI — volumen**
  - PASÓ — 200 secciones × 1 materia: todas aparecen en el resumen y la numeración es consistente
  - PASÓ — sección sin materias (materias: []) solo dibuja encabezado y total
  - PASÓ — detalle de 90 días × 3 secciones × 5 estudiantes se genera en tiempo razonable
- **PDF EPI — valores y caracteres especiales**
  - PASÓ — cifras grandes en tarjetas de resumen (1 000 000) se imprimen completas
  - PASÓ — periodo_label ausente imprime "undefined" en la línea Periodo (robustez)
  - PASÓ — fechas de filtro nulas → "—"
  - PASÓ — caracteres fuera de Latin-1 (emoji, CJK, €) no rompen la generación con Roboto
  - PASÓ — inyección de texto tipo HTML/SQL se imprime literal
- **PDF EPI — determinismo (detección de flakiness)**
  - PASÓ — 3 generaciones del mismo reporte producen el mismo número de páginas y el mismo texto (salvo la fecha de generación)
- **PDF EPI — desbordes verticales (relacionado con D-07)**
  - PASÓ — OBSERVACIÓN O-14: nombre de sección muy largo se parte en varias líneas sobre una barra de 18 pt
  - PASÓ — cédula muy larga en el detalle (lineBreak:false) también se parte en varias líneas

#### `tests/pdf/reporteEpiPdfSinFuentes.test.js`

- **pdfService sin fuentes TTF (fallback Helvetica)**
  - PASÓ — genera PDF válido y quita tildes/ñ con txt()
  - PASÓ — sin logos locales intenta 2 URLs remotas por logo y continúa si fallan
  - PASÓ — usa el logo remoto cuando la primera URL responde (no intenta la segunda)
  - PASÓ — OBSERVACIÓN O-02: txt() no normaliza ü/Ü ni otros diacríticos con Helvetica
- **pdfService sin fuentes TTF — detalle diario EPI**
  - PASÓ — detalle con tildes en Helvetica: "Miercoles", "Tardia", "Sección"→"Seccion"

#### `tests/ramas/ramasPdf.test.js`

- **pdfService — ramas de valores por defecto**
  - PASÓ — EPI: condición desconocida (permiso_especial) en el detalle usa color por defecto y se imprime
  - PASÓ — comprobante de orientación con campos vacíos → "-"
  - PASÓ — orientación filtrada: fila sin cédula ni nombre → "—"
  - PASÓ — sustituciones: sin nombre de sustituto → "—"

#### `tests/ramas/ramasRestantes.test.js`

- **pdfService.pipeReporteAsistenciaHijoPdf — salto de página antes del resumen**
  - PASÓ — 8 registros: PDF válido y el resumen siempre aparece
  - PASÓ — 10 registros: PDF válido y el resumen siempre aparece
  - PASÓ — 12 registros: PDF válido y el resumen siempre aparece
  - PASÓ — 14 registros: PDF válido y el resumen siempre aparece
  - PASÓ — 16 registros: PDF válido y el resumen siempre aparece
  - PASÓ — 18 registros: PDF válido y el resumen siempre aparece
  - PASÓ — 20 registros: PDF válido y el resumen siempre aparece
- **epiReportesService.compararNombre — combinaciones de nulos**
  - PASÓ — ordena secciones con nombre null/undefined/"" en ambas posiciones del comparador
- **cookieOptions / sustitucionHelper / validateEnv — ramas restantes**
  - PASÓ — cookieClearOptions en desarrollo
  - PASÓ — aplicarFiltroAsignacionesProfesor sin fecha usa hoy
  - PASÓ — validateEnv: valor por defecto exacto de ≥16 chars se detecta por la comparación literal

#### `tests/servicios/justificacionService.test.js`

- **listarJustificaciones — alcance por rol**
  - PASÓ — null → 403
  - PASÓ — {"id":9,"rol":"epi"} → 403
  - PASÓ — {"id":1,"rol":"padre_de_familia"} → 403
  - PASÓ — admin: sin restricción de sección, paginación y mapeo
  - PASÓ — profesor sin secciones → lista vacía sin consultar justificaciones
  - PASÓ — profesor: restringe con whereIn y rechaza secciones ajenas (403)
  - PASÓ — filtros {"fecha_inicio":"2026/01/01"} → 400
  - PASÓ — filtros {"fecha_inicio":"2026-03-01","fecha_fin":"2026-01-01"} → 400
  - PASÓ — filtros {"id_seccion":"0"} → 400
  - PASÓ — filtros {"tipo_justificacion":"falsa"} → 400
- **obtenerJustificacionPorId**
  - PASÓ — id inválido → 400; no existe → 404; profesor fuera de alcance → 403; admin OK
- **crearJustificacion**
  - PASÓ — admin crea: inserta en transacción, marca asistencia como justificado y devuelve el registro
  - PASÓ — usa "motivo" si no hay "descripcion"
  - PASÓ — validación 0
  - PASÓ — validación 1
  - PASÓ — validación 2
  - PASÓ — validación 3
  - PASÓ — validación 4
  - PASÓ — validación 5
  - PASÓ — validación 6
  - PASÓ — asistencia inexistente → 404; estado presente → 400; EPI → 403
  - PASÓ — profesor sin acceso a la asignación → 403; con acceso (titular) → OK
  - PASÓ — duplicado (23505) → 409; otros errores se relanzan
  - PASÓ — OBSERVACIÓN O-11: se acepta un enlace http (no https) a cualquier dominio y rutas "/uploads/../" sin normalizar
  - PASÓ — obtenerJustificacionPorAsistencia: existe / no existe

#### `tests/servicios/notificacionController.test.js`

- **notificacionController.getNotificaciones**
  - PASÓ — envuelve el resultado con status success y no expone campos extra

#### `tests/servicios/notificacionCorreo.test.js`

- **emailService.enviarCorreo**
  - PASÓ — destinatario vacío → no envía
  - PASÓ — SMTP no configurado → no envía y advierte
  - PASÓ — configurado: puerto 465 secure, from por defecto = SMTP_USER, transporte cacheado
  - PASÓ — puerto 587 → secure false; SMTP_FROM tiene prioridad
  - PASÓ — error SMTP → enviado=false sin lanzar
- **notificationService**
  - PASÓ — ausencia injustificada: envía correo y registra "enviado"
  - PASÓ — sin SMTP: registra "fallido" con el motivo
  - PASÓ — estudiante inexistente o sin encargado → no envía ni registra
  - PASÓ — fallo al registrar en BD se captura
  - PASÓ — estado expulsion → asunto "Orientación: Expulsión definitiva de Ana"
  - PASÓ — estado suspension → asunto "Orientación: Suspensión registrado para Ana"
  - PASÓ — estado permiso_institucional → asunto "Orientación: Permiso Institucional registrado para Ana"
  - PASÓ — OBSERVACIÓN O-13: asunto "Suspensión registrado" (concordancia de género incorrecta)
  - PASÓ — tipo desconocido → no hace nada; sin encargado → no envía
  - PASÓ — dispararNotificacionesAusencias: solo "ausente", en segundo plano
  - PASÓ — dispararNotificacionesAusencias: error en el lote se registra

#### `tests/servicios/notificacionHistorial.test.js`

- **listarNotificaciones — filtros y validación**
  - PASÓ — valores por defecto: página 1, límite 15, sin filtros
  - PASÓ — paginación: límite máximo 100, offset = (page-1)*limit, total_paginas redondea hacia arriba
  - PASÓ — page/limit inválidos (0) usan los valores por defecto
  - PASÓ — page/limit inválidos (-1) usan los valores por defecto
  - PASÓ — page/limit inválidos (abc) usan los valores por defecto
  - PASÓ — aplica todos los filtros a ambas consultas (count y datos)
  - PASÓ — búsqueda escapa comodines LIKE (%, _, \) y se limita a 100 caracteres
  - PASÓ — búsqueda solo con espacios → null (sin filtro)
  - PASÓ — {"fecha_inicio":"01/01/2026"} → AppError 400
  - PASÓ — {"fecha_fin":"mañana"} → AppError 400
  - PASÓ — {"fecha_inicio":"2026-02-01","fecha_fin":"2026-01-01"} → AppError 400
  - PASÓ — {"id_profesor":"0"} → AppError 400
  - PASÓ — {"id_profesor":"x"} → AppError 400
  - PASÓ — {"id_estudiante":"-3"} → AppError 400
  - PASÓ — {"estado_envio":"pendiente"} → AppError 400
  - PASÓ — {"estado_envio":"enviado' OR 1=1"} → AppError 400
  - PASÓ — DEFECTO D-15 (menor): fechas se truncan a 10 caracteres y no se valida que existan (2026-02-31, "2026-01-01xyz")
  - PASÓ — ids con sufijo no numérico se aceptan ("4abc" → 4), igual que D-03
  - PASÓ — id vacío ("") se ignora; null NO se ignora y da 400 (inconsistencia menor)
  - PASÓ — ESTADOS_ENVIO_FILTRABLES
- **listarNotificaciones — mapeo de filas (describirEvento/mapearFila)**
  - PASÓ — asistencia → Ausencia Injustificada con profesor emisor
  - PASÓ — estado de orientación: expulsión, suspensión (etiqueta), tipo desconocido y sin tipo
  - PASÓ — sin origen → notificación del sistema; fallido con y sin observación; sin sección/destinatario/profesor
  - PASÓ — total no numérico → 0
- **notificacionRoutes — autorización (verificarLecturaNotificaciones)**
  - PASÓ — ruta GET /notificaciones con token + rol + handler
  - PASÓ — rol administrador → permitido=true
  - PASÓ — rol super_administrador → permitido=true
  - PASÓ — rol orientador → permitido=true
  - PASÓ — rol epi → permitido=false
  - PASÓ — rol profesor → permitido=false
  - PASÓ — rol padre_de_familia → permitido=false
  - PASÓ — sin req.user → 403 (no lanza)

#### `tests/servicios/orientacionService.test.js`

- **hoyIsoLocal / TIPO_ESTADO_LABEL**
  - PASÓ — fecha local
  - PASÓ — etiquetas
- **crearEstadoPeriodo — validaciones**
  - PASÓ — {} → 400
  - PASÓ — {"id_persona_estudiante":5,"tipo_estado":"castigo"} → 400
  - PASÓ — {"id_persona_estudiante":5,"tipo_estado":"suspension"} → 400
  - PASÓ — {"id_persona_estudiante":5,"tipo_estado":"suspension","fecha_inicio":"2026-11-10"} → 400
  - PASÓ — {"id_persona_estudiante":5,"tipo_estado":"permiso_institucional","fecha_inicio":"2026-11-10","fecha_fin":"2026-11-01"} → 400
  - PASÓ — estudiante no encontrado → 404; con expulsión previa → 403
  - PASÓ — DEFECTO D-18 (menor): fecha_inicio no se valida en formato; "14/11/2026" se compara como texto y llega a la BD
- **crearEstadoPeriodo — flujo feliz**
  - PASÓ — expulsión: cierra matrículas del año, desactiva estudiante y notifica de forma asíncrona
  - PASÓ — suspensión con solapamiento → 409 y no inserta
  - PASÓ — error al notificar se registra en consola sin afectar la respuesta
- **actualizar / anular / eliminar**
  - PASÓ — id inválido → 400; inexistente → 404; expulsión → 403; histórico → 403
  - PASÓ — actualizar: validaciones de tipo y fechas
  - PASÓ — actualizar permiso (sin transacción) y suspensión (con transacción y exclusión de sí mismo)
  - PASÓ — anular: vigente → fecha_fin=hoy; futuro → inicio=fin=hoy; ya finalizado → 400; expulsión → 403
  - PASÓ — DEFECTO D-17: eliminarEstadoPeriodo borra una EXPULSIÓN (que no se puede modificar ni anular) sin revertir la matrícula cancelada
  - PASÓ — eliminar: id inválido → 400; inexistente → 404
- **historial**
  - PASÓ — banderas es_vigente / es_editable y filtro por sección en memoria
  - PASÓ — OBSERVACIÓN O-12: un estado que termina HOY figura como no vigente en el historial, pero obtenerEstadosActivosPorEstudiantes lo trata como activo (fecha_fin >= fecha)
  - PASÓ — filtros de historial: validaciones y variantes de rango
  - PASÓ — listarEstadosPeriodo: con y sin estudiante, id inválido
- **buscarEstudiantesOrientacion**
  - PASÓ — término corto → []; id inválido → 400; id inexistente → []
  - PASÓ — por término: busca por nombre/cédula y enriquece con matrícula y expulsión
- **expectativas correctas (it.fails)**
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-17 (expectativa correcta): eliminar una expulsión debería rechazarse (403)

#### `tests/servicios/padresAsistencia.test.js`

- **assertPadrePuedeVerEstudiante**
  - PASÓ — id "0" → 400
  - PASÓ — id "-1" → 400
  - PASÓ — id "x" → 400
  - PASÓ — id null → 400
  - PASÓ — sin vínculo → 403; con vínculo → id numérico
- **obtenerReporteAsistenciaPadre**
  - PASÓ — arma registros con horario, resumen y datos del estudiante/tutor
  - PASÓ — sin bloque programado ese día → "<Día> — sin bloque programado"; sin matrícula → valores por defecto
  - PASÓ — estudiante inexistente → 404
  - PASÓ — OBSERVACIÓN O-10 (rendimiento): consulta N+1 — una consulta de horario por cada marca
  - PASÓ — filtra por estudiante y rango

#### `tests/servicios/padresDashboard.test.js`

- **listEstadosEspecialesHijo**
  - PASÓ — mapea etiquetas y fechas; 404 si el estudiante no existe
- **obtenerDashboardHijo**
  - PASÓ — a las 10:00 (hora CR): estados activos = el que termina hoy, el sin fin ya iniciado y la expulsión
  - PASÓ — DEFECTO D-19: a las 20:00 (hora CR) "hoy" se calcula en UTC (día siguiente): el estado que termina hoy desaparece y el de mañana aparece activo
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-19 (expectativa correcta): a las 20:00 hora CR el estado que termina hoy sigue activo
- **obtenerDashboardHijo — ramas restantes**
  - PASÓ — sin estados y sin año de matrícula → listas vacías y año del reloj
  - PASÓ — estado sin fecha_fin que empieza en el futuro no está activo

#### `tests/servicios/reportesService.test.js`

- **parseRangoFechas**
  - PASÓ — por defecto: mes actual (local)
  - PASÓ — fechas válidas con espacios; inválidas → por defecto
  - PASÓ — inicio > fin → error con status 400 (propiedad status, no statusCode)
  - PASÓ — solo fin válido anterior al inicio por defecto → error (inicio por defecto > fin)
- **obtenerEstadisticasReportes**
  - PASÓ — KPIs, agrupación por sección/materia y matriz de exportación
  - PASÓ — sin filas: nivel promedio = nivel global (100)
  - PASÓ — id_seccion=abc → status 400
  - PASÓ — id_seccion=x1 → status 400
  - PASÓ — id_materia inválido → 400
  - PASÓ — OBSERVACIÓN: ids 0 y negativos NO se rechazan aquí (a diferencia de EPI)
  - PASÓ — OBSERVACIÓN O-08: el mismo conjunto de marcas da % distinto en reportes estratégicos y en EPI
- **obtenerAlertasPermanencia**
  - PASÓ — umbral 3: motivo según tipo y orden por puntaje (ausencias×2 + tardías)
  - PASÓ — justificadas cuentan como ausencias para la alerta
  - PASÓ — sección desconocida → "—"
- **reportesController**
  - PASÓ — éxito → json
  - PASÓ — error de validación → 400 con mensaje
  - PASÓ — OBSERVACIÓN O-09 (seguridad): un error interno de BD devuelve 500 con el mensaje técnico al cliente
  - PASÓ — error sin mensaje → texto por defecto

#### `tests/servicios/seccionService.test.js`

- **listarSeccionesConGuia**
  - PASÓ — cupos disponibles nunca negativos; sin curso lectivo → 0 estudiantes
- **asignarProfesorGuia / revocarProfesorGuia**
  - PASÓ — validaciones
  - PASÓ — ya es guía → mensaje sin actualizar
  - PASÓ — máximo 2 secciones guía; con 1 se asigna
  - PASÓ — revocar

#### `tests/servicios/sustituciones.test.js`

- **registrarSustitucion**
  - PASÓ — {"id_profesor_titular":"x"} → 400
  - PASÓ — {"id_profesor_sustituto":1} → 400
  - PASÓ — {"fecha_inicio":"16/11/2026"} → 400
  - PASÓ — {"fecha_inicio":"2026-11-21"} → 400
  - PASÓ — acepta alias fecha_desde/fecha_hasta y crea una sustitución por asignación con commit
  - PASÓ — titular/sustituto inexistente → 404; sin asignaciones → 400; sustituto no habilitado → 400 con materias
  - PASÓ — solapamiento → 409 y rollback (no commit)
  - PASÓ — OBSERVACIÓN: fechas con formato válido pero inexistentes (2026-02-30) no se rechazan

#### `tests/utils/cacheSeccion.test.js`

- **cache.getCached**
  - PASÓ — solo llama a fetchFn la primera vez; invalidate fuerza nueva carga
  - PASÓ — OBSERVACIÓN O-06: dos llamadas concurrentes sin caché ejecutan fetchFn dos veces (sin deduplicación)
  - PASÓ — un error en fetchFn no se cachea
  - PASÓ — valor undefined no se almacena (se vuelve a pedir)
- **catalogCacheService**
  - PASÓ — secciones/materias/cursos se consultan una vez y luego salen de caché
  - PASÓ — lecciones incluyen etiqueta legible
  - PASÓ — CACHE_KEYS
- **seccionHelper**
  - PASÓ — MAX = 25
  - PASÓ — contarMatriculasActivasPorSeccion: total string/undefined
  - PASÓ — año desconocido → null sin consultar
  - PASÓ — usa la primera sección con cupo (< 25)
  - PASÓ — todas llenas → crea "<grado>-<n+1>" e invalida caché de secciones
  - PASÓ — DEFECTO D-16: la nueva sección se numera como cantidad+1; con huecos (7-1 y 7-3 existentes) intenta crear 7-3 otra vez
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-16 (expectativa correcta): con 7-1 y 7-3 existentes no debería volver a crearse "7-3"

#### `tests/utils/csvPrecarga.test.js`

- **normalizeCsvHeader**
  - PASÓ — "Cédula" → "cedula"
  - PASÓ — "  Primer   apellido " → "primer_apellido"
  - PASÓ — "SECCIÓN" → "seccion"
  - PASÓ — null → ""
  - PASÓ — "Año" → "ano"
- **detectCsvDelimiter**
  - PASÓ — "a,b,c" → ","
  - PASÓ — "a;b;c" → ";"
  - PASÓ — "\"a;b\",c" → ","
  - PASÓ — "\"a,b\";c;d" → ";"
  - PASÓ — "sin separador" → ","
  - PASÓ — "" → ","
  - PASÓ — null → ","
  - PASÓ — "a,b;c" → ","
- **parseCsvLine**
  - PASÓ — campos con comillas y separador dentro
  - PASÓ — punto y coma; delimitador desconocido cae a coma
  - PASÓ — campos vacíos y línea vacía
  - PASÓ — DEFECTO D-14b (menor): comillas escapadas RFC 4180 ("") se pierden
- **parseCsvText**
  - PASÓ — vacío / solo BOM / solo líneas en blanco
  - PASÓ — plantilla del cliente con ; (Excel español), BOM y CRLF
  - PASÓ — encabezados legados, desconocidos, vacíos y duplicados (gana el primer valor no vacío)
  - PASÓ — filas con menos celdas que encabezados → ""
  - PASÓ — 5 000 filas se procesan
  - PASÓ — __proto__ como encabezado no contamina Object.prototype
- **extractPrecargaRow**
  - PASÓ — construye nombre completo en orden Nombre + apellidos
  - PASÓ — OBSERVACIÓN O-03: orden distinto a buildNombreCompletoCr (Apellido1 Apellido2 Nombre)
  - PASÓ — nombre_completo explícito tiene prioridad; campos ausentes → ""
- **parseFechaNacimiento**
  - PASÓ — "2012-02-01" → "2012-02-01"
  - PASÓ — "01/02/2012" → "2012-02-01"
  - PASÓ — "1-2-2012" → "2012-02-01"
  - PASÓ — "  05/11/2010 " → "2010-11-05"
  - PASÓ — "" → null
  - PASÓ — null → null
  - PASÓ — "2012/02/01" → null
  - PASÓ — "01.02.2012" → null
  - PASÓ — "1/2/12" → null
  - PASÓ — DEFECTO D-14: acepta fechas imposibles (31/02/2010 → 2010-02-31; 2010-13-45) y basura tras la fecha ISO
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-14 (expectativa correcta): 31/02/2010 debería devolver null
- **nombreSeccionToAnoACursar**
  - PASÓ — "7-1" → "septimo"
  - PASÓ — "8-2" → "octavo"
  - PASÓ — "9-10" → "noveno"
  - PASÓ — "10-1" → "decimo"
  - PASÓ — " 11-3 " → "undecimo"
  - PASÓ — "07-1" → "septimo"
  - PASÓ — "12-1" → null
  - PASÓ — "6-1" → null
  - PASÓ — "7" → null
  - PASÓ — "A-1" → null
  - PASÓ — null → null

#### `tests/utils/emailTemplates.test.js`

- **emailTemplates — escape HTML (XSS) y formato**
  - PASÓ — ausencia injustificada: escapa todos los campos; fecha DD/MM/AAAA; guiones si faltan materia/sección
  - PASÓ — ausencia: nombres null → cadena vacía; fecha null → —
  - PASÓ — estado de orientación con y sin fecha fin; motivo con saltos de línea → <br/>; motivo vacío → texto por defecto
  - PASÓ — expulsión

#### `tests/utils/estadoAsistencia.test.js`

- **etiquetaEstadoOficial**
  - PASÓ — presente → Presente
  - PASÓ — tardanza → Tardía
  - PASÓ — justificado → Ausencia Justificada
  - PASÓ — ausente → Ausencia Injustificada
  - PASÓ — permiso_especial → Permiso Especial
  - PASÓ — suspendido → Suspendido
  - PASÓ — expulsado → Expulsado
  - PASÓ — "  PRESENTE " → "Presente"
  - PASÓ — "Tardanza" → "Tardía"
  - PASÓ — "desconocido" → "desconocido"
  - PASÓ — "" → "Sin clasificar"
  - PASÓ — null → "Sin clasificar"
  - PASÓ — undefined → "Sin clasificar"
  - PASÓ — 0 → "Sin clasificar"
- **calcularResumenAsistencia**
  - PASÓ — lista vacía → nivel 100 % y contadores en cero
  - PASÓ — cuenta todos los estados y calcula ausencias totales
  - PASÓ — nivel_asistencia_pct solo cuenta presentes (tardías NO suman, a diferencia del reporte EPI)
  - PASÓ — redondeo entero: 2/3 → 67
- **contarEstadosAsistencia**
  - PASÓ — vacío
  - PASÓ — estados desconocidos cuentan en total pero en ninguna categoría
- **calcularMetricasAnaliticas**
  - PASÓ — total 0 → puntualidad 100, tardías 0, nivel 100, distribución 0
  - PASÓ — fórmula de nivel general ((total - AI) / total)
  - PASÓ — valores nulos/undefined se tratan como 0
  - PASÓ — distribución 50/50 con redondeo
  - PASÓ — entrada inconsistente (AI > total) produce porcentaje negativo — no se valida
  - PASÓ — se integra con contarEstadosAsistencia

#### `tests/utils/helpersFecha.test.js`

- **leccionHelper.fechaToIsoDiaSemana**
  - PASÓ — 2026-11-09 → 1
  - PASÓ — 2026-11-14 → 6
  - PASÓ — 2026-11-15 → 7
  - PASÓ — 2024-02-29 → 4
  - PASÓ — 2000-01-01 → 6
  - PASÓ —  2026-11-11  → 3
  - PASÓ — inválida null → null
  - PASÓ — inválida undefined → null
  - PASÓ — inválida "" → null
  - PASÓ — inválida "2026/11/09" → null
  - PASÓ — inválida "09-11-2026" → null
  - PASÓ — inválida "2026-00-10" → null
  - PASÓ — inválida "2026-13-01" → null
  - PASÓ — inválida "2026-01-00" → null
  - PASÓ — inválida "2026-01-32" → null
  - PASÓ — inválida "x" → null
  - PASÓ — DEFECTO D-08: 2026-02-31 (inexistente) no se rechaza; se desborda a 3-mar (martes = 2)
  - PASÓ — DEFECTO D-08b: años < 100 se mapean a 19xx por new Date(y, m, d) (0050-01-01 → día de 1950)
  - PASÓ — DIA_SEMANA_LABEL cubre 1..7
- **leccionHelper.formatHoraCorta / etiquetaLeccion / resumenHorariosLeccion**
  - PASÓ — null → "--:--"
  - PASÓ — undefined → "--:--"
  - PASÓ — "" → "--:--"
  - PASÓ — "07:00:00" → "07:00"
  - PASÓ — "7:05" → "07:05"
  - PASÓ — "13:45:59.123" → "13:45"
  - PASÓ — "abcdefg" → "abcde"
  - PASÓ — 0 → "0"
  - PASÓ — etiqueta con y sin almuerzo
  - PASÓ — resumen de horarios
- **sustitucionHelper — fechas**
  - PASÓ — fechaHoyIso usa la fecha local
  - PASÓ — fechaDiaAnterior(2026-03-01) = 2026-02-28
  - PASÓ — fechaDiaAnterior(2024-03-01) = 2024-02-29
  - PASÓ — fechaDiaAnterior(2026-01-01) = 2025-12-31
  - PASÓ — fechaDiaAnterior(2026-11-14) = 2026-11-13
  - PASÓ — fechaDiaAnterior(2026-11-14T08:00:00Z) = 2026-11-13
  - PASÓ — fechaDiaAnterior(null) = ""
  - PASÓ — fechaDiaAnterior("") = ""
  - PASÓ — fechaDiaAnterior("basura") = ""
  - PASÓ — DEFECTO D-10: fechaDiaAnterior depende de la zona horaria (UTC+14 devuelve dos días antes)
  - PASÓ — fechaDiaAnterior es correcta en la zona del liceo (America/Costa_Rica) y en UTC
  - PASÓ — fechaAIsoDia(null) = ""
  - PASÓ — fechaAIsoDia(undefined) = ""
  - PASÓ — fechaAIsoDia("") = ""
  - PASÓ — fechaAIsoDia("2026-07-30") = "2026-07-30"
  - PASÓ — fechaAIsoDia("2026-07-30T05:00:00.000Z") = "2026-07-30"
  - PASÓ — fechaAIsoDia("no es fecha") = ""
  - PASÓ — fechaAIsoDia con Date usa componentes locales (no String(date).slice)
- **sustitucionHelper.profesorPuedeAccederAsignacion (BD simulada)**
  - PASÓ — ids no numéricos → false sin consultar
  - PASÓ — asignación inexistente → false
  - PASÓ — titular → true sin consultar sustituciones
  - PASÓ — sustituto vigente → true; usa fechaRef en los filtros
  - PASÓ — no titular y sin sustitución → false (usa fecha de hoy)
  - PASÓ — aplicarFiltroAsignacionesProfesor construye subconsulta titular OR sustituto vigente
- **expectativas correctas (it.fails)**
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-10 (expectativa correcta): fechaDiaAnterior("2026-03-10") = "2026-03-09" en cualquier zona horaria

#### `tests/utils/roles.test.js`

- **roles.js — constantes**
  - PASÓ — ROL_EPI es "epi" y el resto de constantes coinciden
- **roles.js — matriz de permisos › esSuperAdministrador**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › esAdministradorPlataforma**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › esAdministradorOperativo**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › puedeConsultarEstudiantes**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › puedeListarCatalogoEstudiantes**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › tieneListadoGlobalEstudiantes**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › puedeVerReportesEstrategicos**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › puedeLeerOrientacion**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › puedeListarJustificacionesGlobales**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › tieneAlcanceGlobalJustificaciones**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos › puedeVerReportesEpi**
  - PASÓ — rol super_administrador
  - PASÓ — rol administrador
  - PASÓ — rol orientador
  - PASÓ — rol profesor
  - PASÓ — rol epi
  - PASÓ — rol padre_de_familia
  - PASÓ — valor no válido undefined → false
  - PASÓ — valor no válido null → false
  - PASÓ — valor no válido "" → false
  - PASÓ — valor no válido "EPI" → false
  - PASÓ — valor no válido " epi" → false
  - PASÓ — valor no válido "Administrador" → false
  - PASÓ — valor no válido "admin" → false
  - PASÓ — valor no válido 0 → false
  - PASÓ — valor no válido {} → false
  - PASÓ — valor no válido "epi" → false
- **roles.js — matriz de permisos**
  - PASÓ — el rol epi NO tiene acceso a funciones fuera de reportes EPI (mínimo privilegio)
  - PASÓ — orientador y profesor NO ven reportes EPI
- **etiquetaRolPersona**
  - PASÓ — "super_administrador" → "Super administrador"
  - PASÓ — "administrador" → "Administrador"
  - PASÓ — "orientador" → "Orientador"
  - PASÓ — "profesor" → "Profesor"
  - PASÓ — "epi" → "Equipo de Permanencia Estudiantil"
  - PASÓ — "padre_de_familia" → "Encargado"
  - PASÓ — "rol_nuevo_desconocido" → "rol nuevo desconocido"
  - PASÓ — "sin_guiones" → "sin guiones"
  - PASÓ — "EPI" → "EPI"
  - PASÓ — 42 → "42"
  - PASÓ — "" → ""
  - PASÓ — null → ""
  - PASÓ — undefined → ""
  - PASÓ — 0 → ""
  - PASÓ — claves heredadas de Object.prototype ("constructor", "toString") devuelven texto, no una función
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-05 (expectativa correcta): etiquetaRolPersona("toString") debería devolver un string

#### `tests/utils/utilsBd.test.js`

- **tutorVisibilidad**
  - PASÓ — true por matrícula vigente (no consulta encargado_estudiante)
  - PASÓ — true por vínculo histórico; false si no hay ninguno
  - PASÓ — filtra por el año calendario actual
- **profesorGuiaVisibilidad**
  - PASÓ — ids inválidos → false / [] sin consultar
  - PASÓ — profesorEsGuiaDeEstudiante
  - PASÓ — estudiantes visibles: unión sin duplicados
  - PASÓ — secciones visibles: normaliza a enteros, descarta no numéricos y duplicados
- **matriculaVisibilidad**
  - PASÓ — tieneLecturaGlobalMatricula(super_administrador) = true
  - PASÓ — tieneLecturaGlobalMatricula(administrador) = true
  - PASÓ — tieneLecturaGlobalMatricula(orientador) = true
  - PASÓ — tieneLecturaGlobalMatricula(profesor) = false
  - PASÓ — tieneLecturaGlobalMatricula(epi) = false
  - PASÓ — tieneLecturaGlobalMatricula(padre_de_familia) = false
  - PASÓ — tieneLecturaGlobalMatricula(undefined) = false
  - PASÓ — profesorTieneVisibilidadMatriculaEstudiante: ids inválidos, guía, asignación, ninguno
  - PASÓ — assertPuedeConsultarEstudianteMatricula: matriz de roles
  - PASÓ — assertPuedeBuscarEstudiantePorCedula
  - PASÓ — assertPadrePuedeBuscarCedulaEstudiante
  - PASÓ — assertPuedeConsultarMatriculaPorId
  - PASÓ — assertPuedeListarMatriculas
- **encargadoLookup**
  - PASÓ — esCorreoNotificable("ana@gmail.com") = true
  - PASÓ — esCorreoNotificable("  ANA@GMAIL.COM ") = true
  - PASÓ — esCorreoNotificable("") = false
  - PASÓ — esCorreoNotificable(null) = false
  - PASÓ — esCorreoNotificable("sin-arroba") = false
  - PASÓ — esCorreoNotificable("precarga.123@liceo.cr") = false
  - PASÓ — esCorreoNotificable("x@pendiente.sistema.local") = false
  - PASÓ — esCorreoNotificable("x@SEED-HISTORIAL.COM") = false
  - PASÓ — esCorreoNotificable("x@seed-historial.test") = false
  - PASÓ — esCorreoNotificable("x@seed-historial.test.cr") = true
  - PASÓ — id inválido → null
  - PASÓ — tutor de matrícula vigente con correo válido y vínculo
  - PASÓ — tutor sin vínculo → id_encargado_estudiante null
  - PASÓ — tutor con correo de precarga → cae al encargado histórico
  - PASÓ — sin matrícula ni encargado notificable → null
- **estadoEstudiantePeriodo**
  - PASÓ — helpers puros
  - PASÓ — obtenerEstadosActivosPorEstudiantes: entradas vacías/ inválidas no consultan
  - PASÓ — prioridad: expulsión > suspensión > permiso; empate → la última fila gana
  - PASÓ — estudianteTieneExpulsionDefinitiva
  - PASÓ — buscarSuspensionSolapada / validarSuspensionSinSolapamiento

#### `tests/utils/utilsVarios.test.js`

- **nombrePersona**
  - PASÓ — parse null
  - PASÓ — parse "   "
  - PASÓ — parse "Ana"
  - PASÓ — parse "Mora  Ana"
  - PASÓ — parse "MORA SOLÍS ANA MARÍA"
  - PASÓ — parse "  Núñez\tPérez\nJosé "
  - PASÓ — apellidos compuestos ("DE LA O") se parten incorrectamente — limitación del formato
  - PASÓ — build ignora vacíos y recorta
  - PASÓ — ida y vuelta parse(build(x)) conserva el nombre completo
- **cupoSeccionError**
  - PASÓ — isCupoSeccionDbError({"message":"Se superó el máximo de 25 estudiantes"}) = true
  - PASÓ — isCupoSeccionDbError({"message":"MAXIMO DE 25"}) = true
  - PASÓ — isCupoSeccionDbError({"detail":"máximo de 25"}) = true
  - PASÓ — isCupoSeccionDbError({"code":"P0001","message":"Sección llena: 25"}) = true
  - PASÓ — isCupoSeccionDbError({"code":"P0001","message":"otro error"}) = false
  - PASÓ — isCupoSeccionDbError({"code":"23505","message":"duplicate key 25 seccion"}) = false
  - PASÓ — isCupoSeccionDbError(null) = false
  - PASÓ — isCupoSeccionDbError("máximo de 25") = false
  - PASÓ — isCupoSeccionDbError({}) = false
  - PASÓ — throwCupoSeccionConflict lanza AppError 409 con legacyJson
  - PASÓ — rethrowIfCupoSeccion convierte cupo en 409 y relanza el resto tal cual
  - PASÓ — handleMatriculaWriteError: AppError pasa, cupo → 409, resto → 500 con mensaje por defecto o propio
- **AppError**
  - PASÓ — valores por defecto y opciones
- **asyncHandler**
  - PASÓ — pasa errores async a next
  - PASÓ — no llama next si resuelve; soporta funciones síncronas
  - PASÓ — error síncrono NO es capturado (se lanza antes de Promise.resolve)
- **cookieEncryption**
  - PASÓ — sin clave: cifrar lanza, descifrar devuelve null
  - PASÓ — ida y vuelta con clave clave-corta-16ch
  - PASÓ — ida y vuelta con clave xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  - PASÓ — ida y vuelta con clave yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
  - PASÓ — IV aleatorio: dos cifrados del mismo valor difieren
  - PASÓ — valor manipulado, corto, no-string o con otra clave → null
  - PASÓ — dos claves que comparten los primeros 32 caracteres son equivalentes (se trunca)
  - PASÓ — DEFECTO D-09: clave ≥32 caracteres con multibyte (ñ, tildes) produce clave de >32 bytes y cifrarCookie lanza
  - **FALLA (it.fails — defecto confirmado)** — DEFECTO D-09 (expectativa correcta): cualquier clave válida debería permitir cifrar
- **cookieOptions**
  - PASÓ — desarrollo: lax, no secure; maxAge solo si es número > 0
  - PASÓ — producción: secure + none; clear coincide con auth (sin maxAge)
- **corsConfig**
  - PASÓ — lista desde FRONTEND_ORIGIN separada por comas (recorta y filtra vacíos)
  - PASÓ — usa CORS_ORIGIN como respaldo
  - PASÓ — sin variables: dev → localhost Vite; prod → []
  - PASÓ — callback: sin origin permite; permitido permite; otro rechaza con error
  - PASÓ — coincidencia exacta: no acepta subdominios ni barra final
- **validateEnv.validarSeguridadEntorno**
  - PASÓ — desarrollo con secretos débiles: solo advierte (2 advertencias)
  - PASÓ — producción con secretos débiles y sin origen → lanza
  - PASÓ — producción con todo correcto → no lanza ni advierte
  - PASÓ — valores por defecto conocidos de ≥16 chars se rechazan (también con mayúsculas/espacios)
  - PASÓ — producción: origen solo con espacios cuenta como ausente
  - PASÓ — secreto de 16 caracteres repetidos ("aaaaaaaaaaaaaaaa") se acepta — no mide entropía
- **errorHandler / notFound**
  - PASÓ — notFound: incluye la URL en desarrollo y la oculta en producción
  - PASÓ — AppError 400 con details (dev) → payload completo
  - PASÓ — details se omite en producción; 500 oculta el mensaje en producción
  - PASÓ — err.code numérico se usa como status; code string (pg) no
  - PASÓ — error CORS → 403 "Origen no permitido"
  - PASÓ — legacyJson se responde tal cual
  - PASÓ — headersSent → delega a next(err)
  - PASÓ — err null/undefined → 500 genérico sin lanzar
<!-- /ANEXO_LISTA -->
