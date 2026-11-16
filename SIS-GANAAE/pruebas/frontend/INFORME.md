# Informe de pruebas de frontend — Rol EPI (Equipo de Permanencia Estudiantil)

**Sistema:** SIS-GANAAE · `frontend-reactjs` (Vite 7, React 19.2, react-router 7.18, Tailwind 4)
**Alcance principal:** `src/pages/epi/ReportesAsistenciaEpi.jsx`, `src/services/epiServices.jsx`, `src/lib/rutasPorRol.js`, `src/components/side-bar/mainBar.jsx`, `src/routes/Protected_Routes.jsx`, `src/routes/Routing.jsx`, `src/components/register-data/RegistroPersonas.jsx`; además módulos puros de `src/lib/` y `src/utils/`, `DialogContext`/`AlertDialog` y `LoadingStatus`.
**Ventana de trabajo:** inicio 18:55:10 (hora local del equipo) · fin 20:45:13 (17 ciclos; 1 h 50 min) · 17 ciclos de ejecución completa registrados.
**Resultado final (último ciclo):** **287 pruebas · 269 pasan · 18 fallan.** Todas las fallas corresponden a defectos documentados (`[DEFECTO D-xx]`) o a umbrales de tiempo en jsdom (ver §5.3); ninguna falla es intermitente por orden de ejecución.

> Restricciones respetadas: no se modificó ningún archivo fuera de `SIS-GANAAE/pruebas/frontend/`; todas las llamadas HTTP están simuladas (no se contactó ningún backend ni la base de datos); el único puerto usado fue **5199**; no se hicieron operaciones git.

---

## 1. Cómo ejecutar

Requisitos: Node 22, dependencias de `frontend-reactjs` ya instaladas (`frontend-reactjs/node_modules`).

```powershell
cd SIS-GANAAE\pruebas\frontend
powershell -ExecutionPolicy Bypass -File scripts\preparar.ps1   # npm install + junction de react/react-dom
npx vitest run                         # suite completa
node scripts\ciclo.mjs "descripción"   # suite completa + pasada de rendimiento aislada → resultados\ciclos.jsonl
node scripts\resumen.mjs               # regenera tablas Markdown en resultados\
node scripts\mutantes.mjs              # "mutation testing" manual (8 mutantes de la página EPI)
npx vitest run --coverage --coverage.reportOnFailure --coverage.allowExternal --coverage.include="**/frontend-reactjs/src/pages/epi/**"   # cobertura
```

Vista previa en navegador (usabilidad), siempre en el puerto 5199 y con API simulada:

```powershell
npx vite --config navegador\vite.config.mjs                     # desarrollo, http://127.0.0.1:5199/epi/reportes?rol=epi&escenario=normal
npx vite build --config navegador\vite.config.mjs --outDir <abs>\resultados\build-simulado
npx vite preview --config navegador\vite.config.mjs --outDir <abs>\resultados\build-simulado
npx vite build --config navegador\vite.build.config.mjs          # build real (sin simulación) solo para medir tamaños
```

Escenarios de la API simulada (`?escenario=`): `normal` (4 secciones × 3 materias), `grande` (40 × 10), `vacio`, `error` (HTTP 500 con mensaje), `lento` (2,5 s). Rol por `?rol=`.

### Decisiones técnicas del arnés
| Tema | Solución |
|---|---|
| Una sola copia de React | `vitest.config.js` aplica alias de `react`, `react-dom`, `react-router(-dom)` a `frontend-reactjs/node_modules`; además `node_modules/react` y `react-dom` de esta carpeta son *junctions* hacia la copia de la app (las dependencias CJS de Testing Library hacen `require('react')` sin pasar por los alias). `.npmrc` con `legacy-peer-deps=true` evita que npm instale otra copia. |
| Alias `@` | Replicado (`@/` → `frontend-reactjs/src/`). |
| Backend | `tests/helpers/setup.js` simula `@/config/api` (todas las llamadas rechazan por defecto); `epiServices` se simula con `tests/helpers/epiMock.js`. **Importante:** sin la simulación, `config/api.js` apunta por defecto a `https://sistemaljm.onrender.com/api`. |
| Fecha | Se fija solo `Date` (14/11/2026 12:00 local) con `vi.useFakeTimers({ toFake: ['Date'] })` para no interferir con user-event. |
| Navegador | `navegador/vite.config.mjs` sirve la app real con `root` en `frontend-reactjs` y un plugin que redirige `src/config/api.js` a `navegador/apiSimulada.js`. |

---

## 2. Estrategia

| Nivel | Qué se valida | Herramientas |
|---|---|---|
| **Unitarias / componente** | Renderizado por tipo de periodo, intercambio de campos, parámetros enviados al servicio para cada periodo (espía sobre el servicio simulado), habilitación/carga/reinicio del select Estudiante, cancelación de respuestas tardías, expandir/contraer, PDF con los parámetros del último reporte generado, lógica del aviso amarillo, diálogo "Sin datos", mensajes de error, estados de carga, umbrales de color, menú por rol, guardia de rutas (componente aislado **y** la configuración real de `Routing.jsx`), opción de rol `epi` en el registro, `epiServices` real (URL, params, `responseType: 'blob'`, `guardarBlob`), módulos puros de `lib/` y `utils/`. | Vitest 3.2.4, jsdom 26, Testing Library (React 16.3, user-event 14.6, jest-dom 6.6) |
| **Funcionales** | Flujos completos montando `AuthProvider` + `DialogProvider` + `Routing` reales: EPI genera mensual → filtra sección → elige estudiante → expande → descarga PDF; login EPI → `/epi/reportes`; primer ingreso → cambio de contraseña → `/epi/reportes`; anual sin datos; rango inválido; profesor bloqueado; cierre de sesión; operación solo con teclado; acceso de admin/super admin desde su menú; registro de una persona con rol EPI en `RegistroPersonas`. | user-event, backend simulado con estado |
| **Usabilidad técnica** | Etiquetas, orden de tabulación, Enter/Espacio, foco visible, explicaciones de estados deshabilitados, textos en español, responsive (320/375/414/768 px y texto al 200 %), menú móvil, rendimiento ligero. | jsdom + navegador integrado (Chromium) en :5199 |
| **Accesibilidad** | axe-core 4.10.3 (WCAG 2.0/2.1/2.2 A-AA + best-practice) en 8 estados en jsdom y en Chromium real (incluido `color-contrast`), contraste calculado desde los tokens OKLCH reales de Tailwind 4, diálogo modal, landmarks/encabezados, `lang`/`title`. | axe-core, cálculo propio OKLCH→sRGB (`tests/helpers/color.js`) |
| **Contrato frontend↔backend** | Roles permitidos en `/epi/reportes` (Routing.jsx) = `puedeVerReportesEpi` del backend (módulo puro `utils/roles.js`, importado solo para lectura); forma de los datos que devuelve `epiReportesService.js` y del 403 (lectura estática, sin ejecutar el backend ni tocar la BD). | Vitest |
| **Robustez de la suite** | Ejecución con orden aleatorio (semillas 11 y 2026), pasada aislada de rendimiento por ciclo, cobertura v8, 8 mutantes manuales de la página EPI. | `--sequence.shuffle` (semillas 11, 2026, 7, 99), `@vitest/coverage-v8`, `scripts/mutantes.mjs` |

Convención de nombres: `[DEFECTO D-xx]` = prueba que expresa el comportamiento esperado y **falla a propósito** porque demuestra un defecto (no se corrigió el código); `[OBSERVACIÓN]` = prueba que **pasa** y fija un comportamiento observado que se recomienda mejorar; `[INFORMATIVO]` = medición.

---

## 3. Archivos de prueba

| Archivo | Tipo | Pruebas | Pasan | Fallan |
|---|---|---:|---:|---:|
| `tests/funcionales/flujo-epi.test.jsx` | Funcional | 6 | 6 | 0 |
| `tests/funcionales/flujo-primer-ingreso-epi.test.jsx` | Funcional | 1 | 1 | 0 |
| `tests/funcionales/flujo-teclado-y-roles.test.jsx` | Funcional | 5 | 5 | 0 |
| `tests/funcionales/registro-persona-epi.test.jsx` | Funcional | 2 | 1 | 1 |
| `tests/rendimiento/render-grande.test.jsx` | Rendimiento | 4 | 1 | 3 |
| `tests/unit/contrato-roles-epi.test.js` | Unitaria / componente | 15 | 15 | 0 |
| `tests/unit/dialogos-ui.test.jsx` | Unitaria / componente | 9 | 9 | 0 |
| `tests/unit/epiServices.test.js` | Unitaria / componente | 8 | 8 | 0 |
| `tests/unit/lib-utils.test.js` | Unitaria / componente | 50 | 49 | 1 |
| `tests/unit/navegacion-roles.test.jsx` | Unitaria / componente | 40 | 37 | 3 |
| `tests/unit/ReportesEpi.bordes.test.jsx` | Unitaria / componente | 14 | 14 | 0 |
| `tests/unit/ReportesEpi.componente.test.jsx` | Unitaria / componente | 55 | 53 | 2 |
| `tests/unit/ReportesEpi.estado-oculto.test.jsx` | Unitaria / componente | 4 | 4 | 0 |
| `tests/unit/ReportesEpi.fechas.test.jsx` | Unitaria / componente | 4 | 3 | 1 |
| `tests/usabilidad/accesibilidad.test.jsx` | Usabilidad / accesibilidad | 42 | 38 | 4 |
| `tests/usabilidad/contraste.test.js` | Usabilidad / accesibilidad | 13 | 12 | 1 |
| `tests/usabilidad/responsive.test.jsx` | Usabilidad / accesibilidad | 15 | 13 | 2 |
| **Total** | | **287** | **269** | **18** |



Cobertura (v8, último cálculo con toda la suite) sobre los archivos del alcance:

| Archivo | % Sentencias | % Ramas | % Funciones | Líneas sin cubrir |
|---|---:|---:|---:|---|
| `pages/epi/ReportesAsistenciaEpi.jsx` | 100 | 97,76 | 100 | ramas en 25, 108, 160 |
| `services/epiServices.jsx` | 100 | 100 | 100 | — |
| `lib/*` (6 archivos) | 98,03 | 98,03 | 100 | `errors.js` 28-29 |
| `utils/*` (2 archivos) | 100 | 94,11 | 100 | ramas menores |
| `routes/Protected_Routes.jsx` | 92,85 | 93,33 | 100 | 11-12 (`catch` de JSON inválido) |
| `components/side-bar/mainBar.jsx` | 85,71 | 95,23 | 80 | submenú no usado (188-214), profesor guía |
| `components/dialog/AlertDialog.jsx` | 98,5 | 93,33 | 100 | 83 |
| **Total del alcance** | **96,51** | **96,36** | **98** | (salida completa en `resultados/cobertura.txt`) |

---

## 4. Resultados: pruebas que FALLARON (con motivo)

| Archivo | Prueba | Mensaje de la aserción |
|---|---|---|
| `registro-persona-epi.test.jsx` | Registro de persona con rol EPI › [DEFECTO D-12] con los campos obligatorios vacíos, "Guardar" no debería enviar al servidor | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| `render-grande.test.jsx` | Render con 40 secciones × 10 materias › primer render de la tabla (40 filas) < 1500 ms en jsdom | AssertionError: expected 1516 to be less than 1500 |
| `render-grande.test.jsx` | Render con 40 secciones × 10 materias › "Ver detalle de todas" (400 filas de materia) < 1500 ms en jsdom | AssertionError: expected 2194 to be less than 1500 |
| `render-grande.test.jsx` | Render con 40 secciones × 10 materias › cambiar un filtro (re-render + comparación JSON de params) < 300 ms con tabla expandida | AssertionError: expected 1030 to be less than 300 |
| `lib-utils.test.js` | mapApiError (lib/errors.js) › [DEFECTO D-09] error axios sin response.data: el mensaje genérico en inglés debería filtrarse | AssertionError: expected 'Request failed with status code 500' to be 'X' // Object.is equality |
| `navegacion-roles.test.jsx` | RegistroPersonas: rol EPI › [DEFECTO D-03] el select de rol tiene etiqueta asociada (WCAG 1.3.1 / 4.1.2) | AssertionError: expected 0 to be greater than 0 |
| `navegacion-roles.test.jsx` | RegistroPersonas: alcance de etiquetas sin asociar › [DEFECTO D-03 alcance] ningún <label> del formulario debería quedar sin control asociado | AssertionError: expected [ …(7) ] to deeply equal [] |
| `navegacion-roles.test.jsx` | RegistroPersonas: axe-core › [DEFECTO D-03 axe] formulario de registro sin violaciones serias/críticas | AssertionError: expected [ 'label(critical) x1', …(1) ] to deeply equal [] |
| `ReportesEpi.componente.test.jsx` | Select de Estudiante: habilitación, carga y reinicio › [DEFECTO D-01] al cambiar el año, un estudiante que ya no está en la lista no debería seguir enviándose | AssertionError: expected { periodo: 'mensual', …(3) } to not have property "id_estudiante" |
| `ReportesEpi.componente.test.jsx` | Robustez de datos › [DEFECTO D-02] el desglose visible debe cuadrar con el Total (los registros "otros" no tienen columna) | AssertionError: expected 10 to be 15 // Object.is equality |
| `ReportesEpi.fechas.test.jsx` | D-01 por cambio de tipo de periodo › [DEFECTO D-01 variante] pasar de Mensual 2026 a Anual 2025 conserva un estudiante que no está en la lista de 2025 | AssertionError: expected { periodo: 'anual', …(3) } to not have property "id_estudiante" |
| `accesibilidad.test.jsx` | Operación solo con teclado (WCAG 2.1.1, 2.4.3) › [DEFECTO D-04] al cerrar el diálogo el foco debe volver al botón que lo abrió (WCAG 2.4.3) | AssertionError: expected <body><div>…(2)</div></body> to be <button data-slot="button" …(2)>…(1)</button> // Object.is equality |
| `accesibilidad.test.jsx` | Operación solo con teclado (WCAG 2.1.1, 2.4.3) › [DEFECTO D-05] el diálogo modal debe atrapar el foco (Tab no sale del alertdialog) | AssertionError: expected false to be true // Object.is equality |
| `accesibilidad.test.jsx` | Estructura semántica (WCAG 1.3.1, 2.4.6) › [DEFECTO D-06] index.html declara lang="es" (WCAG 3.1.1) | AssertionError: expected '<!doctype html>\r\n<html lang="en">\r…' to match /<html lang="es/ |
| `accesibilidad.test.jsx` | Estructura semántica (WCAG 1.3.1, 2.4.6) › [DEFECTO D-07] el <title> del documento es descriptivo (WCAG 2.4.2) | AssertionError: expected '<!doctype html>\r\n<html lang="en">\r…' not to match /<title>frontend-reactjs<\/title>/title> |
| `contraste.test.js` | Textos secundarios y estados › [DEFECTO D-08] indicador de foco global outline-ring/50 sobre blanco ≥ 3:1 (WCAG 1.4.11 / 2.4.13) | AssertionError: expected 1.54 to be greater than or equal to 3 |
| `responsive.test.jsx` | Menú lateral fuera de pantalla en móvil › [DEFECTO D-10] con el menú cerrado (móvil) sus controles no deberían ser enfocables (inert / invisible / aria-hidden) | AssertionError: expected false to be true // Object.is equality |
| `responsive.test.jsx` | Controles select: apariencia de habilitado vs. deshabilitado › [DEFECTO D-11] un select habilitado no debe recibir los estilos read-only (gris de "inactivo") | AssertionError: expected true to be false // Object.is equality |


**Motivo de cada falla:**

| Prueba(s) | Clasificación | Motivo |
|---|---|---|
| `[DEFECTO D-01]`, `[DEFECTO D-01 variante]` | Defecto funcional | Ver §6 D-01. |
| `[DEFECTO D-02]` | Defecto de presentación de datos | Ver §6 D-02. |
| `[DEFECTO D-03]`, `D-03 alcance`, `D-03 axe` | Defecto de accesibilidad | Ver §6 D-03. |
| `[DEFECTO D-04]`, `[DEFECTO D-05]` | Defecto de accesibilidad (diálogo) | Ver §6. |
| `[DEFECTO D-06]`, `[DEFECTO D-07]` | Defecto de accesibilidad (documento) | Ver §6. |
| `[DEFECTO D-08]` | Defecto de accesibilidad (foco) | Ver §6. |
| `[DEFECTO D-09]` | Defecto menor de mensajes | Ver §6. |
| `[DEFECTO D-10]`, `[DEFECTO D-11]` | Defecto de usabilidad/accesibilidad | Ver §6. |
| `[DEFECTO D-12]` | Defecto de validación (registro) | Ver §6. |
| `render-grande` · 3 pruebas con umbral de tiempo (1500 ms / 1500 ms / 300 ms) | **Ambiental, no es defecto** | jsdom bajo carga (suite en paralelo con varios workers y, posiblemente, otros procesos en la misma máquina) resultó un orden de magnitud o más lento que Chromium y muy variable entre ciclos (ver §5.3). Con la app compilada en Chromium real las mismas operaciones tardan 80-246 ms (expandir 400 filas) y 28-36 ms (cambio de filtro). Los umbrales originales no se modificaron para no maquillar resultados; se añadió en el ciclo 5 una medición con `React.Profiler` (pasa) y se registra todo en §5.3. |

## 5. Resultados: pruebas que PASARON

Resumen por área (detalle completo, prueba por prueba, en el Anexo A):

- **Periodos:** los 4 tipos muestran exactamente los campos esperados (Semanal → fecha; Mensual → mes; Anual → select con los 6 últimos años; Personalizado → Desde/Hasta) y envían `fecha_referencia` = día / `AAAA-MM-01` / `AAAA-01-01`, o `fecha_inicio`/`fecha_fin` sin `fecha_referencia`. Bordes 31-dic y 1-ene 00:10 correctos (fecha local).
- **Estudiante:** deshabilitado sin sección (con `title` = descripción accesible), "Cargando estudiantes…", "Todos (n)", formato "Nombre · cédula", reinicio al cambiar de sección o volver a "Todas", y la respuesta tardía de una sección anterior no pisa la lista actual.
- **PDF:** usa siempre los parámetros del reporte mostrado (aunque se cambien filtros sin regenerar), nombre `reporte_asistencia_epi_<periodo>_<inicio>_<fin>.pdf`, "Generando PDF…" + botón deshabilitado (sin doble descarga), diálogo de error si falla y diálogo "Sin datos" si el reporte no tiene secciones.
- **Aviso amarillo:** aparece al cambiar cualquier filtro (incluido solo el estudiante), desaparece al regenerar o al volver al valor original, no aparece durante la carga; tiene `role="status"`.
- **Carga/errores:** `LoadingStatus` con `role="status"`/`aria-busy`; botones deshabilitados durante la carga; mensaje del backend (`data.error`) o genérico en español con `role="alert"`; un éxito posterior limpia el error; Enter o doble clic durante la carga no generan consultas extra; `required` bloquea el envío con el campo Mes vacío.
- **Roles/rutas:** `rutaInicioPorRol('epi') === '/epi/reportes'`; el menú EPI tiene **solo** "Reportes de asistencia"; admin (SidebarAdmin) y super admin ven "Reportes de asistencia (EPI)"; orientador/profesor/padre no lo ven; `/epi/reportes` permite epi/administrador/super_administrador y redirige a `/login` a profesor, orientador, padre y a usuarios sin sesión (sin llegar a consultar el reporte); EPI es redirigido desde `/inicio`, `/estudiantes`, `/dashboard-reportes`, `/justificaciones`, `/panel-orientador` y sí puede usar `/cambiar-contraseña`. `RegistroPersonas` ofrece `epi` con la etiqueta "Equipo de Permanencia Estudiantil (EPI)".
- **Accesibilidad que cumple:** 0 violaciones axe (A/AA + best-practice) en los 8 estados en jsdom y 0 en Chromium real en 7 estados (inicial, expandido, aviso amarillo, error, vacío, diálogo "Sin datos", menú móvil abierto; incluido `color-contrast` recorriendo toda la página); todos los controles del formulario EPI tienen `<label for>` en los 4 periodos; ids únicos; orden de tabulación lógico; Enter en campo de texto envía; Enter/Espacio alternan `aria-expanded`; el diálogo recibe el foco al abrir y se cierra con Escape; un solo `h1` y un `main`.
- **Funcionales:** 13 de los 14 flujos pasan (incluido el registro de una persona con rol EPI, que envía `nombre_rol: "epi"` sin materias); el 14.º es `[DEFECTO D-12]`.
- **Contrato frontend↔backend:** para los 7 roles probados, los permisos de la ruta `/epi/reportes` coinciden con `puedeVerReportesEpi` del backend; la forma de `estudiantes`, `filtros`, `catalogos` y del 403 coincide con lo que la página consume.
- **Concurrencia:** cambiar filtros durante una generación en curso no altera lo mostrado ni lo descargado (se usa lo pedido), y luego aparece el aviso amarillo; las respuestas tardías de estudiantes se descartan.
- **Menú móvil:** abre/cierra con su botón y con el fondo, respeta `prefers-reduced-motion`, 0 violaciones axe serias con el menú abierto.
- **Robustez de la suite:** 0 pruebas intermitentes por orden en 4 ejecuciones con orden aleatorio (sin la carpeta de rendimiento): semillas 11 y 2026 (ciclo 4: 241 pruebas, 230 pasan, 11 fallas = las mismas `[DEFECTO]`) y semillas 7 y 99 (ciclo 13: 275 pruebas, 262 pasan, 13 fallas = las mismas `[DEFECTO]`).

### 5.1 Mutantes (eficacia de la suite)

Se copiaron versiones modificadas de la página EPI en `mutantes/` (imports reescritos a `@/…`) y se ejecutaron las pruebas de la página contra cada una con `vitest.mutantes.config.js`. Un mutante se considera detectado si aparece al menos una prueba fallida **nueva** respecto de la línea base (que ya incluye las fallas `[DEFECTO]`).

**Ronda 1 (entre los ciclos 6 y 7):** M1 0 · M2 1 · M3 5 · M4 2 · M5 0 · M6 1 · M7 3 · M8 9 pruebas → 6/8 detectados.
- **M1 sobrevivió** y reveló una debilidad de la propia suite: la prueba "cambiar de sección reinicia el estudiante" solo miraba el valor visible del `<select>`, y un select controlado con un valor inexistente muestra "Todos" aunque el estado conserve el id (el mismo mecanismo que oculta el defecto D-01). En el ciclo 7 se añadió `ReportesEpi.estado-oculto.test.jsx`, que verifica los parámetros realmente enviados.
- **M5 es un mutante equivalente**: con la interfaz actual no se puede tener estudiante sin sección (el select está deshabilitado y elegir "Todas" reinicia el estudiante), por lo que ninguna prueba de interfaz puede distinguirlo.

**Ronda 2 (después del ciclo 15, los 8 mutantes re-ejecutados con la suite final; `resultados/mutantes.json`):**

| Mutante | Cambio introducido | ¿Detectado? | Pruebas nuevas que fallan | Ejemplo |
|---|---|---|---:|---|
| M1 | No reinicia el estudiante al cambiar de sección | Sí | 1 | Estado oculto del estudiante seleccionado tras cambiar de sección, el reporte NO incluye el estudiante de la sección anterior |
| M2 | PDF usa los filtros actuales en vez de los del reporte mostrado | Sí | 2 | Descarga de PDF si se cambian filtros sin regenerar, el PDF usa los parámetros anteriores |
| M3 | Se elimina aria-expanded de los botones de sección | Sí | 5 | Expandir / contraer secciones botón de sección alterna aria-expanded y muestra las materias |
| M4 | Umbral de color verde cambia de >=90 a >90 | Sí | 2 | Carga inicial y renderizado renderiza las 6 tarjetas KPI con sus valores |
| M5 | id_estudiante se envía aunque no haya sección | **No** | 0 |  |
| M6 | Se ignora la cancelación de respuestas tardías de estudiantes | Sí | 1 | Select de Estudiante: habilitación, carga y reinicio respuesta tardía de una sección anterior no sobrescribe la lista actual (cancelación) |
| M7 | Select Estudiante habilitado sin sección | Sí | 3 | Select de Estudiante: habilitación, carga y reinicio deshabilitado sin sección, con texto y title explicativo |
| M8 | Mensual envía AAAA-MM en vez de AAAA-MM-01 | Sí | 11 | PDF: nombres de archivo por periodo el PDF incluye id_estudiante cuando el reporte mostrado lo tenía |


### 5.2 Ciclos (registro por ciclo)

| # | Inicio (UTC) | Descripción | Archivos | Pruebas | Pasan | Fallan | Duración suite | Violaciones axe (8 estados, sin contraste) | Rendimiento aislado (pasan/fallan) |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | 01:08:47 | C1 suite inicial | 43 | 208 | 197 | 11 | 49.1 s | 0 | — |
| 2 | 01:18:43 | C2 + bordes, responsive, D-10/D-11 | 52 | 235 | 221 | 14 | 52.7 s | 0 | — |
| 3 | 01:21:06 | C3 + dialogos/LoadingStatus, rendimiento aislado | 11 | 244 | 230 | 14 | 54.7 s | 0 | 0/3 |
| 4 | 01:35:07 | C4 + teclado/roles, D-03 alcance y axe RegistroPersonas | 12 | 250 | 236 | 14 | 41.7 s | 0 | 2/1 |
| 5 | 01:37:53 | C5 + Profiler (rendimiento), shuffle seeds 11/2026 sin flakiness | 12 | 251 | 237 | 14 | 38.6 s | 0 | 3/1 |
| 6 | 01:39:35 | C6 + flujo primer ingreso EPI | 13 | 252 | 236 | 16 | 55.9 s | 0 | 3/1 |
| 7 | 01:59:43 | C7 + estado oculto (mata M1), ruta no permitida con sesión activa | 14 | 255 | 239 | 16 | 54.1 s | 0 | 3/1 |
| 8 | 02:02:30 | C8 + filtros durante la carga, menú móvil abierto (axe), reduced-motion | 14 | 260 | 244 | 16 | 48.8 s | 0 | 3/1 |
| 9 | 02:04:55 | C9 + teclado durante carga de estudiantes (A23); verificación de teclado real en Chromium | 14 | 261 | 244 | 17 | 82.2 s | 0 | 3/1 |
| 10 | 02:08:15 | C10 mitigación de intermitencia (espera 15 s en flujo super admin) | 14 | 261 | 246 | 15 | 47.8 s | 0 | 3/1 |
| 11 | 02:10:53 | C11 + contrato de roles/datos frontend-backend (lectura estática) | 15 | 276 | 260 | 16 | 52.8 s | 0 | 3/1 |
| 12 | 02:12:42 | C12 + regiones vivas (4.1.3) | 15 | 279 | 263 | 16 | 88.7 s | 0 | 3/1 |
| 13 | 02:20:26 | C13 cobertura final 96,5 %, orden aleatorio semillas 7/99 sin intermitencias | 15 | 279 | 263 | 16 | 84.6 s | 0 | 3/1 |
| 14 | 02:25:02 | C14 D-01 reproducido en Chromium (API simulada con ids por año); títulos de pruebas mapApiError | 15 | 279 | 263 | 16 | 79.9 s | 0 | 3/1 |
| 15 | 02:27:22 | C15 + página actual en el menú (admin vs EPI) | 15 | 281 | 266 | 15 | 81.1 s | 0 | 2/2 |
| 16 | 02:42:13 | C16 + registro persona EPI (D-12), D-01 variante anual, fechas sin max, axe Chromium en error/vacío/diálogo; mutantes ronda 2 | 17 | 287 | 269 | 18 | 50.5 s | 0 | 3/1 |
| 17 | 02:43:53 | C17 ejecución final de confirmación (sin cambios en pruebas) | 17 | 287 | 269 | 18 | 50.4 s | 0 | 3/1 |


Notas del registro: en los ciclos 1-2 la columna "Archivos" del script contaba *bloques describe* (43 y 52); se corrigió a archivos desde el ciclo 3. Las violaciones axe se miden en jsdom sobre 8 estados (inicial, expandido, personalizado+estudiantes, error, cargando, diálogo "Sin datos", aviso amarillo, inicial con todos los impactos) con la regla de contraste desactivada (jsdom no pinta); el contraste se midió aparte (§7.2). **Intermitencia observada:** en el ciclo 9 (suite de 82 s, máquina cargada) falló una vez "super administrador navega desde su menú…" por agotar la espera de 8 s del chunk diferido; repetida 3 veces en aislado pasó 3/3. En el ciclo 10 se amplió su espera a 15 s (documentado en el propio archivo). Las 3 pruebas de umbral de tiempo en jsdom fallan o pasan según la carga (ver §5.3). Ninguna otra prueba cambió de resultado entre ciclos ni con orden aleatorio. En el ciclo 1 se detectó y corrigió un falso positivo `region` causado por un elemento auxiliar del propio arnés (`data-testid="ubicacion"`), no por la app.

### 5.3 Rendimiento (ligero)

| Medición | jsdom (mín – máx de 30 mediciones: pasada en paralelo + aislada de cada ciclo desde el 3) | Chromium, build de desarrollo | Chromium, build de producción |
|---|---|---|---|
| Primer render 40 secciones | 429 – 3 641 ms | — | DOMContentLoaded 650 ms; LCP 1 496 ms (incluye 2 × 250 ms de latencia simulada) |
| "Ver detalle de todas" (400 filas) | 700 – 5 639 ms | 226 – 971 ms | **80 – 246 ms** |
| "Contraer todo" | 327 – 3 334 ms | 95 – 130 ms | 23 – 36 ms |
| Alternar una sección | — | — | 12 – 26 ms |
| Cambio de filtro con 440 filas visibles | 265 – 3 157 ms | 100 – 416 ms | **28 – 36 ms** |
| React Profiler, cambio de filtro | 1 commit, `actualDuration` ≈ `baseDuration` (97-301 ms en jsdom, 13 mediciones) → **se re-renderiza toda la tabla** en cada cambio de filtro | | |

Tamaño (build real con la configuración de la app, salida en `resultados/build`): chunk **`ReportesAsistenciaEpi` 12,51 kB (4,02 kB gzip)** + `mainBar` compartido 12,68 kB (4,26 kB gzip); la página se carga de forma diferida (`lazy`). Entrada `index` 333,6 kB; el chunk mayor es `DashboardAdmin` 404,8 kB (no se descarga en la ruta EPI). Transferido en la ruta EPI (prod, gzip): index.js 95,4 kB, CSS 13,2 kB, página EPI 4,3 kB, mainBar 4,6 kB.

---

## 6. Defectos

| ID | Severidad | Archivo:línea | Descripción | Prueba que lo demuestra |
|---|---|---|---|---|
| **D-01** | Media | `pages/epi/ReportesAsistenciaEpi.jsx:98-119` (recarga por `anioEstudiantes`) y `:86` | Al cambiar el año del periodo (p. ej. mes de 2026 → 2025, o periodo anual) se recarga la lista de estudiantes pero **no se reinicia `idEstudiante`**. Si el estudiante no existe en la nueva lista, el select muestra visualmente "Todos (n)" (el `<select>` controlado no encuentra la opción) mientras el estado sigue enviando `id_estudiante` al generar el reporte y el PDF. El usuario cree que pidió "todos" y recibe el reporte de un solo estudiante. **Reproducido también en Chromium** (ciclo 14): tras cambiar el mes a 2025-05 el select mostraba "Todos (30)" y el reporte generado decía "· Estudiante: Estudiante de prueba" (ver resultados/navegador.json). | `ReportesEpi.componente.test.jsx` › `[DEFECTO D-01]` (cambio de mes) y `ReportesEpi.fechas.test.jsx` › `[DEFECTO D-01 variante]` (Mensual 2026 → Anual 2025) |
| **D-02** | Baja | `pages/epi/ReportesAsistenciaEpi.jsx:36-50` y `:384-390` (backend `services/epiReportesService.js:89,110-111`) | El backend acumula estados no reconocidos en `otros` y los suma al `total`, pero la tabla no tiene columna "Otros": Presentes + Tardías + Aus. justificadas + Aus. injustificadas ≠ Total cuando hay registros de otro estado. | `[DEFECTO D-02]` |
| **D-03** | Alta (para lectores de pantalla) | `components/register-data/RegistroPersonas.jsx:216, 246, 257, 261, 265, 277, 281` | Los 7 `<Label>` del formulario no tienen `htmlFor` (y los controles no tienen `id`, salvo el select `rol` y el textarea `direccion`, cuyas etiquetas tampoco apuntan a ellos). El select **Rol** (donde se elige "EPI") queda sin nombre accesible: axe reporta `select-name` (crítico) y `label` (crítico, campo fecha). WCAG 1.3.1, 4.1.2, 3.3.2. | `navegacion-roles.test.jsx` › `[DEFECTO D-03]`, `D-03 alcance`, `D-03 axe` |
| **D-04** | Media | `components/dialog/AlertDialog.jsx:43-47` | Al cerrar el diálogo ("Sin datos", error de PDF) el foco no vuelve al botón "Descargar PDF": queda en `<body>` (confirmado en jsdom y en Chromium). WCAG 2.4.3. | `accesibilidad.test.jsx` › `[DEFECTO D-04]` |
| **D-05** | Media | `components/dialog/AlertDialog.jsx:93-98` | El diálogo declara `aria-modal="true"` pero no atrapa el foco ni inertiza el fondo: Tab sale del `alertdialog` hacia la página. WCAG 2.4.3 / patrón ARIA de diálogo modal. | `[DEFECTO D-05]` |
| **D-06** | Media | `frontend-reactjs/index.html:2` | `<html lang="en">` en una aplicación íntegramente en español: los lectores de pantalla pronuncian con fonética inglesa. WCAG 3.1.1. | `[DEFECTO D-06]` |
| **D-07** | Baja | `frontend-reactjs/index.html:7` | `<title>frontend-reactjs</title>` en todas las rutas (ninguna página cambia `document.title`). WCAG 2.4.2. | `[DEFECTO D-07]` |
| **D-08** | Media | `src/index.css:132` y `:192` (`outline-ring/50`) con `--ring` en `:26` | El indicador de foco por defecto (usado por los botones "Sección …" de la tabla, que no tienen estilo de foco propio) es gris `--ring` al 50 %: contraste **1,54:1** con el blanco (mínimo 3:1); en Chromium se ve como un contorno gris claro apenas perceptible. WCAG 2.4.7 / 1.4.11 (2.4.13 AAA). | `contraste.test.js` › `[DEFECTO D-08]` + captura en navegador |
| **D-09** | Baja | `src/lib/errors.js:8-15` | `mapApiError` con un error de axios cuyo `response.data` es `undefined` toma `data = err` y devuelve `err.message` ("Request failed with status code 500", en inglés) antes de llegar al filtro que pretende descartarlo. | `lib-utils.test.js` › `[DEFECTO D-09]` |
| **D-10** | Media | `components/side-bar/mainBar.jsx:149-157` | En pantallas < 1024 px el menú lateral cerrado solo se desplaza (`-translate-x-full`); sus controles siguen siendo enfocables. En Chromium a 375 px, Tab lleva el foco a "Cerrar menú de navegación" (x = −53) y "Reportes de asistencia" (x = −304), invisibles. WCAG 2.4.7 / 2.4.3. | `responsive.test.jsx` › `[DEFECTO D-10]` + recorrido Tab en navegador |
| **D-11** | Media | `components/ui/form-control-styles.js:3` | Las variantes `read-only:` se aplican también a `<select>` (un select siempre coincide con `:read-only`). Resultado: los selects **habilitados** (Tipo de reporte, Sección, Materia) se pintan con el mismo fondo gris `slate-200/60` que el select **deshabilitado** (Estudiante); solo cambian levemente el color del texto (slate-600 vs slate-500) y el borde. El usuario no distingue qué está habilitado. Medido en Chromium con `getComputedStyle`. | `responsive.test.jsx` › `[DEFECTO D-11]` |
| **D-12** | Media | `components/register-data/RegistroPersonas.jsx:157` (`agregarPersonas`) y `:319` (botón Guardar) | El formulario de registro (donde se crea el usuario EPI) no usa `<form>`: los controles tienen `required`, pero "Guardar" llama a `agregarPersonas` directamente y la validación nativa nunca se ejecuta. Con todos los campos vacíos se envía `POST /personas` igualmente (se depende por completo de la validación del backend). | `registro-persona-epi.test.jsx` › `[DEFECTO D-12]` |

---

## 7. Hallazgos de accesibilidad y usabilidad

### 7.1 Tabla de hallazgos

| # | Criterio WCAG / heurística | Severidad | Elemento | Hallazgo (observado) |
|---|---|---|---|---|
| A1 | 3.1.1 Idioma de la página | Media | `index.html` | `lang="en"` (D-06). |
| A2 | 2.4.2 Título de página | Baja | `index.html` | Título "frontend-reactjs" (D-07). |
| A3 | 2.4.7 / 1.4.11 Foco visible | Media | Botones "Sección …" | Contorno de foco 1,54:1 (D-08). Los botones de la librería UI (`focus-visible:ring`) y los inputs (borde `slate-900` 17,8:1 al enfocar) sí son visibles; el anillo `ring-slate-900/20` de los inputs por sí solo da 1,53:1 pero lo compensa el borde. |
| A4 | 2.4.3 Orden del foco | Media | `AlertDialog` | No devuelve el foco (D-04) ni lo atrapa (D-05); no tiene `aria-describedby` para el mensaje (observación). |
| A5 | 2.4.3 / 2.4.7 | Media | Menú lateral en móvil | Controles invisibles enfocables (D-10). Al abrir el menú el foco no entra al panel y Escape no lo cierra (observaciones). |
| A6 | 1.3.1 / 4.1.2 | Alta | `RegistroPersonas` | Etiquetas sin asociar; select Rol sin nombre (D-03). |
| A7 | 1.3.1 Información y relaciones | Baja | Títulos de tarjeta | "Parámetros del reporte" y "Conteo por sección" son `<div>`, no encabezados; la navegación por encabezados solo encuentra el `h1` (y el `h2` "Liceo José Martí" del menú). |
| A8 | 1.3.1 | Baja | Tabla | Sin `<caption>`; a diferencia de la tabla de `DashboardAdmin.jsx` (que usa `th scope="col"`), los encabezados no declaran `scope`; las celdas de sección/materia son `td` (no `th scope="row"`); abreviatura "Aus." sin `<abbr title>`; botones de expandir sin `aria-controls`. |
| A9 | 3.3.2 Etiquetas o instrucciones | Baja | Campos de fecha | Son `required` pero la etiqueta no lo indica; ningún campo de fecha tiene `max` (se puede pedir un mes futuro, p. ej. 2027-03), en semanal no se muestra qué lunes-domingo se usará hasta generar, y en rango personalizado no hay `min`/`max` cruzados ni validación local (Desde > Hasta se envía y el backend responde 400; el mensaje sí se muestra). |
| A10 | Explicación de estados deshabilitados | Baja | "Descargar PDF" | Tras un error queda deshabilitado sin explicación (`title`/`aria-describedby`). El select Estudiante sí explica ("Seleccione primero una sección" como descripción accesible y como texto de la opción). |
| A11 | Visibilidad del estado (Nielsen) | Media | Mensaje de error en móvil | A 414 px el `role="alert"` queda en y = 774 px con una ventana de 630 px: tras pulsar "Generar reporte" el usuario vidente no ve el error sin desplazarse (el lector de pantalla sí lo anuncia). Lo mismo ocurre con el aviso amarillo y los resultados, que quedan bajo el formulario. |
| A12 | Consistencia (Nielsen) | Baja | KPI vs tabla | Orden distinto de ausencias: KPI "injustificadas → justificadas", tabla "justificadas → injustificadas". |
| A13 | Consistencia | Baja | Menú EPI | El enlace activo no tiene `aria-current="page"` ni resaltado; `SidebarAdmin` sí lo resalta (`bg-accent`) para el administrador en `/epi/reportes`, aunque tampoco usa `aria-current` (WCAG 2.4.8, AAA). |
| A14 | Copy en español | Baja | `RegistroPersonas` | El texto de ayuda dice "Registre docentes, orientadores y tutores legales" y no menciona al personal EPI recién agregado. |
| A15 | Prevención de errores | Baja | Select Estudiante | Si falla la carga de estudiantes, se muestra "Todos (0)" sin ningún mensaje de error. |
| A16 | 1.4.10 Reflow / responsive | **Cumple** | Página | A 320 px no hay desplazamiento horizontal de página (scrollWidth = 320); solo la tabla se desplaza dentro de su contenedor (720/238 px); el formulario envuelve (`flex-wrap`); con texto al 200 % (768 px) no hay recortes. Observación visual: en móvil los selects quedan de anchos distintos (170/150/180/220 px). |
| A17 | 2.5.8 Tamaño de objetivo | **Cumple** | Controles | axe `target-size` pasa (16 nodos); el único elemento < 24 px es el *skip link* oculto (1×1 hasta recibir foco). |
| A18 | 2.4.11 Foco no oculto | Baja | Botón ☰ fijo | En móvil el botón de menú fijo (top-left) se superpone al contenido al desplazar (tapa parte de la tarjeta "Tardías"). |
| A19 | Visibilidad del estado / control del usuario (Nielsen) | Media | `routes/Protected_Routes.jsx:28-30` + `pages/login/Login.jsx` | Un usuario EPI **con sesión activa** que abre una ruta no permitida (p. ej. `/inicio`) es enviado a `/login` y ve el formulario de inicio de sesión, sin mensaje de "no autorizado" y sin que la sesión se cierre; `Login` no redirige a usuarios autenticados. Confuso (parece que se cerró la sesión). |
| A20 | Consistencia de indicadores de carga | Informativo | Arranque de `/epi/reportes` | Con latencia alta (escenario `lento`) se suceden tres indicadores distintos: "Verificando sesión…", "Cargando tu experiencia educativa…" (fallback de `Suspense`, simultáneo con el anterior) y "Generando reporte de asistencia…". Todos tienen `role="status"`; el texto del segundo no corresponde al contexto de reportes. |
| A21 | Visibilidad del estado | Baja | Formulario durante la carga | Mientras se genera un reporte los filtros siguen editables y el aviso amarillo se oculta (`!cargando`), así que un cambio hecho durante la espera no se señala hasta que llega la respuesta. El comportamiento de datos es correcto (se muestra y descarga lo pedido; prueba en `ReportesEpi.estado-oculto.test.jsx`). |
| A22 | 2.1.1 Teclado (operable, pero con fricción) | Baja | Select Estudiante | Recorrido real con teclado en Chromium: Flecha↓ en "Tipo de reporte" (Mensual→Anual), Tab → Año, Tab → Sección, Flecha↓ (7-1), Tab, Tab… El foco pasó de Sección a Materia y luego a "Generar reporte" **saltándose Estudiante**, porque mientras se cargan los estudiantes (250 ms simulados) el select está `disabled` y sale del orden de tabulación; se habilita después, detrás del foco. Además, en Windows cada flecha sobre un select cerrado dispara `change` → una petición de estudiantes por pulsación (las respuestas tardías se descartan correctamente). |
| A23 | Mensajes de error útiles | Baja | Descarga de PDF | El PDF se pide con `responseType: 'blob'`; si el backend responde con un error JSON (`{ error }`, p. ej. 400 o 403), la página muestra siempre "No se pudo descargar el PDF. Intente de nuevo." y se pierde el motivo. (El contrato de roles frontend↔backend sí coincide: `contrato-roles-epi.test.js`.) |
| A24 | 4.1.3 Mensajes de estado | Baja | Aviso amarillo / resultado | El aviso `role="status"` se monta junto con su texto (no hay región viva preexistente), patrón que algunos lectores de pantalla no anuncian de forma fiable. Al terminar "Generar reporte" no se anuncia el resultado (p. ej. "Reporte generado: 4 secciones"); el usuario de lector de pantalla no sabe que la tabla cambió. El error (`role="alert"`) sí se anuncia. |
| A25 | Compatibilidad | Informativo | Campo Mes (`type="month"`) | No verificable en jsdom/Chromium: Firefox de escritorio y Safari antiguos no implementan `type="month"` y muestran un campo de texto libre sin formato guía. |

### 7.2 Contraste de los colores de estado (calculado desde `tailwindcss/theme.css`, OKLCH → sRGB)

| Combinación | Texto | Fondo | Razón | Mínimo | ¿Cumple? |
|---|---|---|---:|---:|---|
| text-green-700 / blanco (celda tabla) | `#008236` | `#ffffff` | 4.94:1 | 4.5:1 | Sí |
| text-yellow-700 / blanco (celda tabla) | `#a65f00` | `#ffffff` | 4.92:1 | 4.5:1 | Sí |
| text-red-700 / blanco (celda tabla) | `#c10007` | `#ffffff` | 6.42:1 | 4.5:1 | Sí |
| text-blue-700 / blanco (KPI) | `#1447e6` | `#ffffff` | 6.82:1 | 4.5:1 | Sí |
| text-green-700 / blue-50 (tfoot) | `#008236` | `#eff6ff` | 4.54:1 | 4.5:1 | Sí |
| text-yellow-700 / blue-50 (tfoot) | `#a65f00` | `#eff6ff` | 4.52:1 | 4.5:1 | Sí |
| text-red-700 / blue-50 (tfoot) | `#c10007` | `#eff6ff` | 5.89:1 | 4.5:1 | Sí |
| text-yellow-800 / yellow-50 (aviso) | `#894b00` | `#fefce8` | 6.64:1 | 4.5:1 | Sí |
| text-red-700 / red-50 (error) | `#c10007` | `#fef2f2` | 5.88:1 | 4.5:1 | Sí |
| muted-foreground / blanco (etiquetas KPI, subtítulo) | `#737373` | `#ffffff` | 4.73:1 | 4.5:1 | Sí |
| slate-500 / slate-200@60% (select deshabilitado, exento) | `#62748e` | `#eef1f6` | 4.21:1 | 4.5:1 | **No** |
| outline ring/50 / blanco (foco botones de sección) | `#d0d0d0` | `#ffffff` | 1.54:1 | 3:1 | **No** |
| ring slate-900/20 / blanco (inputs; el borde slate-900 sí contrasta) | `#cfd1d5` | `#ffffff` | 1.53:1 | 3:1 | **No** |
| borde slate-900 / blanco (inputs enfocados) | `#0f172b` | `#ffffff` | 17.84:1 | 3:1 | Sí |


Lectura de los "No": el select deshabilitado está **exento** (WCAG 1.4.3 excluye componentes inactivos; se incluye porque se parece al habilitado, ver D-11); el anillo `ring-slate-900/20` de los inputs se compensa con el borde `slate-900` (17,84:1); el único "No" con impacto real es el contorno de foco `outline-ring/50` (D-08).

Conclusión: `text-green-700`, `text-yellow-700` y `text-red-700` **cumplen AA (≥ 4,5:1)** sobre blanco para texto normal (las celdas de la tabla son `text-sm`), y también sobre el `bg-blue-50` de la fila "Total general", aunque con poco margen (4,52-4,54:1): cualquier aclarado del fondo o del texto los dejaría por debajo. En Chromium real, axe `color-contrast` recorrió toda la página (12 + 15 + 56 + 49 nodos según la posición de desplazamiento) sin violaciones; en AAA (`color-contrast-enhanced`, 7:1) fallan 4 nodos (subtítulo gris 4,74:1 y selects 6,69:1) — informativo. El color no es el único medio: el porcentaje siempre se muestra como número (WCAG 1.4.1 cumple).

---

## 8. Cosas por mejorar (recomendaciones, **no aplicadas**)

1. **D-01:** reiniciar `idEstudiante` cuando cambie `anioEstudiantes` o cuando el id seleccionado no esté en la nueva lista; en general, no enviar `id_estudiante` que no pertenezca a `estudiantes`.
2. **D-02:** añadir columna "Otros" (o una nota "Total incluye otros estados") en tabla, KPI y PDF.
3. **D-03:** `htmlFor`/`id` en todos los `Label` de `RegistroPersonas` y actualizar el texto de ayuda para mencionar al personal EPI.
4. **D-04/D-05:** en `AlertDialog`/`ConfirmDialog`, guardar `document.activeElement` al abrir y restaurarlo al cerrar; atrapar el foco (o usar `<dialog>` nativo con `showModal()`, que inertiza el fondo); añadir `aria-describedby` al mensaje.
5. **D-06/D-07:** `lang="es"` y un `<title>` descriptivo por ruta (p. ej. "Reportes de asistencia · SIS-GANAAE").
6. **D-08:** un estilo de foco explícito para botones nativos (`focus-visible:ring-2 focus-visible:ring-slate-900` o `outline-ring` sin transparencia) con contraste ≥ 3:1.
7. **D-09:** en `mapApiError`, aplicar el filtro de "Request failed with status code" también cuando `data === err`.
8. **D-10:** con el menú cerrado en < lg, usar `inert` (o `invisible max-lg:` / `aria-hidden` + `tabIndex=-1`) en el `<aside>`; mover el foco al panel al abrir, cerrar con Escape y devolver el foco al botón ☰.
9. **D-11:** limitar las variantes `read-only:` a `input`/`textarea` (p. ej. `[&:is(input,textarea)]:read-only:…`) para que los selects habilitados se vean activos.
10. **D-12:** envolver los campos de `RegistroPersonas` en un `<form onSubmit>` (o validar en `agregarPersonas`) para que `required`/`type=email` se apliquen antes de llamar a la API.
11. Hacer visible el resultado en móvil: desplazar o enfocar el mensaje de error/aviso/resumen tras "Generar reporte" (o mostrar los filtros en un panel plegable).
12. Validar en el cliente el rango personalizado (`min`/`max` cruzados y mensaje "Desde no puede ser posterior a Hasta") antes de llamar a la API.
13. Mostrar un aviso si falla la carga de estudiantes y explicar por qué "Descargar PDF" está deshabilitado tras un error.
14. Usar `mapApiError` en la página EPI (hoy solo lee `data.error`; un 403 con `data.message` muestra el genérico).
15. Rendimiento: memoizar las filas (`React.memo` en una fila de sección) o separar el formulario de la tabla para que cambiar un filtro no re-renderice 440 filas; con > 40 secciones considerar virtualización. En producción el costo actual es aceptable (28-36 ms), pero en el build de desarrollo superó 200 ms (INP).
16. Semántica de tabla y estructura: `<caption>`, `th scope="row"` para secciones/materias, `<abbr title="Ausencias">Aus.</abbr>`, `aria-controls` en los botones de expandir y `CardTitle` como encabezado (`h2`).
17. Coherencia: mismo orden de "justificadas/injustificadas" en KPI, tabla y PDF; `aria-current="page"` y resaltado del ítem activo en el menú EPI; anchos uniformes (`w-full sm:w-auto`) de los selects en móvil.
18. Indicar "obligatorio" en las etiquetas de los campos `required`; ofrecer un selector de mes alternativo donde `type="month"` no está soportado.
19. Rutas no permitidas: redirigir al usuario autenticado a su `rutaInicioPorRol` (o a una página "No autorizado") en lugar de `/login`, y que `Login` redirija si ya hay sesión.
20. `guardarBlob` (`services/epiServices.jsx:21-30`) revoca la URL del blob inmediatamente después de `a.click()`; algunos navegadores pueden cancelar la descarga. Conviene revocarla con un pequeño retardo (`setTimeout`). Además, `getEstudiantesSeccionEpi` interpola el id sin `encodeURIComponent` (observación de robustez, el id proviene de un catálogo).
21. Mensajes de estado: dejar montado un contenedor `role="status"` vacío y cambiar solo su texto (aviso de filtros y "Reporte generado: N secciones, X % de asistencia"); al descargar el PDF con error, leer el `Blob` como texto/JSON para mostrar el `error` del backend.
22. Mantener la API por defecto de `config/api.js` apuntando a producción es riesgoso para pruebas locales; conviene exigir `VITE_API_BASE_URL` en desarrollo.

---

## 9. Limitaciones

- jsdom no calcula layout ni pinta: el contraste, el responsive y el foco visible se verificaron con cálculo de tokens y en Chromium (navegador integrado), no en Firefox/Safari ni con lectores de pantalla reales.
- Las mediciones de rendimiento en navegador son de una sola máquina compartida con otros procesos; pueden variar.
- El PDF solo se verificó a nivel de parámetros y nombre de archivo (el contenido lo genera el backend, fuera de alcance). En el navegador no se descargó ningún archivo.
- Los mutantes son 8 cambios manuales sobre una copia de la página (`mutantes/`), no una herramienta de mutación exhaustiva.

---

## Anexo A — Lista completa de pruebas que pasaron (último ciclo)

<details>
<summary>Ver 269 pruebas</summary>


**tests/funcionales/flujo-epi.test.jsx** (6)

- ✔ Flujo principal EPI › EPI genera reporte mensual → filtra sección → elige estudiante → descarga PDF
- ✔ Flujo principal EPI › Login de usuario EPI redirige a /epi/reportes y muestra solo su menú
- ✔ Flujo principal EPI › Periodo anual 2025 sin registros → aviso "Sin datos" al intentar PDF cuando no hay registros
- ✔ Flujo principal EPI › Rango personalizado inválido: el mensaje del backend se muestra y el PDF queda deshabilitado
- ✔ Flujo principal EPI › Profesor que escribe /epi/reportes en la barra es enviado a /login sin consultar el reporte
- ✔ Flujo principal EPI › Cerrar sesión desde el menú EPI llama a /personas/logout y vuelve a /login

**tests/funcionales/flujo-primer-ingreso-epi.test.jsx** (1)

- ✔ primer ingreso EPI: login → cambiar contraseña → /epi/reportes

**tests/funcionales/flujo-teclado-y-roles.test.jsx** (5)

- ✔ Operación solo con teclado › cambiar a Anual, elegir 2025, sección 8-2, generar con Enter y expandir con Espacio
- ✔ Operación solo con teclado › el enlace "Saltar al contenido principal" no está en Routing (vive en App.jsx): la ruta EPI depende de App para tenerlo
- ✔ Acceso desde menús de otros roles › super administrador navega desde su menú a "Reportes de asistencia (EPI)"
- ✔ Acceso desde menús de otros roles › administrador ve el enlace EPI en SidebarAdmin y la pantalla carga
- ✔ Rutas no permitidas para EPI con sesión activa › [OBSERVACIÓN] EPI que abre /inicio termina en el formulario de login aunque su sesión sigue activa (sin aviso de "no autorizado")

**tests/funcionales/registro-persona-epi.test.jsx** (1)

- ✔ Registro de persona con rol EPI › completa el formulario, elige "Equipo de Permanencia Estudiantil (EPI)" y envía nombre_rol=epi sin materias

**tests/rendimiento/render-grande.test.jsx** (1)

- ✔ Costo de render por cambio de filtro (React Profiler) › [OBSERVACIÓN] un cambio de filtro vuelve a renderizar toda la tabla expandida (actualDuration ≈ baseDuration)

**tests/unit/contrato-roles-epi.test.js** (15)

- ✔ Permisos /epi/reportes: frontend vs backend › rol epi: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › rol administrador: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › rol super_administrador: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › rol orientador: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › rol profesor: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › rol padre_de_familia: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › rol estudiante: la ruta del frontend y el middleware del backend coinciden
- ✔ Permisos /epi/reportes: frontend vs backend › el backend etiqueta el rol epi como "Equipo de Permanencia Estudiantil" (igual que RegistroPersonas sin el sufijo "(EPI)")
- ✔ Permisos /epi/reportes: frontend vs backend › la ruta de inicio del rol epi está permitida para ese rol (no hay bucle de redirección)
- ✔ Permisos /epi/reportes: frontend vs backend › /cambiar-contraseña admite al rol epi
- ✔ Forma de los datos (servicio del backend, lectura estática) › estudiantes: id_estudiante, nombre_completo, cedula dentro de { estudiantes }
- ✔ Forma de los datos (servicio del backend, lectura estática) › reporte: filtros.periodo_label, nombre_estudiante y catalogos { secciones, materias }
- ✔ Forma de los datos (servicio del backend, lectura estática) › [OBSERVACIÓN] los totales del backend incluyen "otros" (base del defecto D-02)
- ✔ Forma de los datos (servicio del backend, lectura estática) › el 403 del backend usa { error } (la página EPI lo mostraría correctamente)
- ✔ Forma de los datos (servicio del backend, lectura estática) › [OBSERVACIÓN] el PDF se pide con responseType blob: un error JSON del backend (p. ej. 400 por rango) no se muestra, solo el genérico

**tests/unit/dialogos-ui.test.jsx** (9)

- ✔ DialogContext.alert › la promesa se resuelve al pulsar "Entendido" y el diálogo desaparece
- ✔ DialogContext.alert › título por defecto "Aviso" y etiqueta de botón personalizable
- ✔ DialogContext.alert › useDialog fuera del proveedor lanza un error descriptivo en español
- ✔ AlertDialog › no renderiza nada cuando open=false
- ✔ AlertDialog › aria-modal=true y el título enlazado con aria-labelledby
- ✔ AlertDialog › Escape llama a onClose
- ✔ AlertDialog › variante desconocida usa el ícono informativo sin fallar
- ✔ LoadingStatus › role=status, aria-live=polite, aria-busy y etiqueta por defecto en español
- ✔ LoadingStatus › el spinner es decorativo (aria-hidden) y respeta prefers-reduced-motion

**tests/unit/epiServices.test.js** (8)

- ✔ epiServices › getReporteAsistenciaEpi → GET /epi/reporte-asistencia con params y devuelve data
- ✔ epiServices › getReporteAsistenciaEpi sin argumentos envía params vacíos
- ✔ epiServices › getEstudiantesSeccionEpi → GET /epi/secciones/:id/estudiantes
- ✔ epiServices › [OBSERVACIÓN] getEstudiantesSeccionEpi no codifica el id en la URL (encodeURIComponent)
- ✔ epiServices › descargarReporteAsistenciaEpiPdf usa responseType blob y devuelve el blob
- ✔ epiServices › los errores HTTP se propagan al llamador
- ✔ epiServices › guardarBlob crea un <a download>, lo pulsa, lo elimina y revoca la URL
- ✔ epiServices › el export por defecto expone las 4 funciones

**tests/unit/lib-utils.test.js** (49)

- ✔ mapApiError (lib/errors.js) › mapApiError(null, fallback X) → X
- ✔ mapApiError (lib/errors.js) › mapApiError(undefined, fallback X) → X
- ✔ mapApiError (lib/errors.js) › mapApiError({"response":{"data":"texto plano "}}, fallback X) → texto plano
- ✔ mapApiError (lib/errors.js) › mapApiError({"response":{"data":{"message":"Cupo lleno","error":"legacy"}}}, fallback X) → Cupo lleno
- ✔ mapApiError (lib/errors.js) › mapApiError({"response":{"data":{"error":"Solo error"}}}, fallback X) → Solo error
- ✔ mapApiError (lib/errors.js) › mapApiError({"message":"Network Error"}, fallback X) → Network Error
- ✔ mapApiError (lib/errors.js) › mapApiError({"response":{"data":{"message":"   "}}}, fallback X) → X
- ✔ mapApiError (lib/errors.js) › mapApiError({"error":"desde servicio"}, fallback X) → desde servicio
- ✔ mapApiError (lib/errors.js) › mensaje genérico de axios con response.data vacío → fallback
- ✔ mapApiError (lib/errors.js) › fallback por defecto en español
- ✔ formatLeccion.js › formatHoraCorta(null) → --:--
- ✔ formatLeccion.js › formatHoraCorta("") → --:--
- ✔ formatLeccion.js › formatHoraCorta("7:00:00") → 07:00
- ✔ formatLeccion.js › formatHoraCorta("13:45") → 13:45
- ✔ formatLeccion.js › formatHoraCorta("abcdefg") → abcde
- ✔ formatLeccion.js › etiquetaLeccion con y sin almuerzo
- ✔ formatLeccion.js › resumenHorariosLeccion
- ✔ justificacionFormato.js › badgeTipoJustificacion(medica) usa paleta sky
- ✔ justificacionFormato.js › badgeTipoJustificacion(personal) usa paleta amber
- ✔ justificacionFormato.js › badgeTipoJustificacion(institucional) usa paleta violet
- ✔ justificacionFormato.js › badgeTipoJustificacion(otro) usa paleta slate
- ✔ justificacionFormato.js › badgeTipoJustificacion(undefined) usa paleta slate
- ✔ justificacionFormato.js › formatFechaJustificacion
- ✔ materiasCatalogEvents.js › emite un CustomEvent en window
- ✔ cn (lib/utils.js) › combina y resuelve conflictos Tailwind
- ✔ haciendaConsulta.js › esFalloServicioHacienda(null) → false
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"encontrado":true,"codigo":"HACIENDA_RATE_LIMIT"}) → false
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"existeInterno":true}) → false
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"fuente":"hacienda"}) → false
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"codigo":"HACIENDA_RATE_LIMIT"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"codigo":"HACIENDA_NO_DISPONIBLE"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"mensaje":"Tiempo de espera agotado"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"error":"Se alcanzó el límite de consultas"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"message":"servicio saturado"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"mensaje":"Hacienda no disponible"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"mensaje":"No fue posible consultar"}) → true
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"mensaje":"Cédula no encontrada"}) → false
- ✔ haciendaConsulta.js › esFalloServicioHacienda({"mensaje":"Hacienda: cédula inexistente"}) → false
- ✔ haciendaConsulta.js › mensajeFalloHacienda prioriza mensaje > error > message > fallback
- ✔ haciendaConsulta.js › notificarHaciendaIndisponible: 504 → toast warning con texto de timeout
- ✔ haciendaConsulta.js › notificarHaciendaIndisponible: status vía err.response.status
- ✔ haciendaConsulta.js › notificarHaciendaIndisponible: data normal → no notifica
- ✔ haciendaConsulta.js › notificarHaciendaIndisponible: rate limit en data
- ✔ vigenciaEstadoOrientacion.js › fechaHoyLocal usa la fecha local (no UTC) — 23:30 local
- ✔ vigenciaEstadoOrientacion.js › normalizarFechaIso
- ✔ vigenciaEstadoOrientacion.js › optionsConfirmacionExpulsion con y sin nombre
- ✔ vigenciaEstadoOrientacion.js › esExpulsionDefinitiva
- ✔ vigenciaEstadoOrientacion.js › esRegistroVigente / esRegistroEditable según fecha_fin
- ✔ vigenciaEstadoOrientacion.js › enriquecerRegistroHistorial respeta valores del backend y calcula los faltantes

**tests/unit/navegacion-roles.test.jsx** (37)

- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol epi → /epi/reportes
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol orientador → /panel-orientador
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol super_administrador → /panel-super-admin
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol administrador → /inicio
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol profesor → /inicio
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol padre_de_familia → /inicio
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol undefined → /inicio
- ✔ rutaInicioPorRol (src/lib/rutasPorRol.js) › rol EPI → /inicio
- ✔ Menú lateral por rol (mainBar.jsx) › EPI ve únicamente "Reportes de asistencia" → /epi/reportes
- ✔ Menú lateral por rol (mainBar.jsx) › Super administrador ve "Reportes de asistencia (EPI)"
- ✔ Menú lateral por rol (mainBar.jsx) › rol orientador NO ve el enlace a /epi/reportes
- ✔ Menú lateral por rol (mainBar.jsx) › rol profesor NO ve el enlace a /epi/reportes
- ✔ Menú lateral por rol (mainBar.jsx) › rol padre_de_familia NO ve el enlace a /epi/reportes
- ✔ Menú lateral por rol (mainBar.jsx) › administrador: el menú (SidebarAdmin) incluye acceso a /epi/reportes
- ✔ Menú lateral por rol (mainBar.jsx) › sin sesión el menú no muestra enlaces
- ✔ Menú lateral por rol (mainBar.jsx) › botón de menú móvil tiene aria-label y aria-controls
- ✔ ProtectedRoute aislado › muestra "Verificando sesión…" mientras carga
- ✔ ProtectedRoute aislado › rol permitido ve el contenido
- ✔ ProtectedRoute aislado › rol no permitido es redirigido a /login
- ✔ ProtectedRoute aislado › sin sesión es redirigido a /login
- ✔ Configuración real de Routing.jsx para /epi/reportes › rol epi accede a /epi/reportes
- ✔ Configuración real de Routing.jsx para /epi/reportes › rol administrador accede a /epi/reportes
- ✔ Configuración real de Routing.jsx para /epi/reportes › rol super_administrador accede a /epi/reportes
- ✔ Configuración real de Routing.jsx para /epi/reportes › rol profesor es redirigido a /login
- ✔ Configuración real de Routing.jsx para /epi/reportes › rol orientador es redirigido a /login
- ✔ Configuración real de Routing.jsx para /epi/reportes › rol padre_de_familia es redirigido a /login
- ✔ Configuración real de Routing.jsx para /epi/reportes › sin sesión es redirigido a /login
- ✔ Configuración real de Routing.jsx para /epi/reportes › EPI no puede entrar a /inicio (redirige a /login)
- ✔ Configuración real de Routing.jsx para /epi/reportes › EPI no puede entrar a /estudiantes (redirige a /login)
- ✔ Configuración real de Routing.jsx para /epi/reportes › EPI no puede entrar a /dashboard-reportes (redirige a /login)
- ✔ Configuración real de Routing.jsx para /epi/reportes › EPI no puede entrar a /justificaciones (redirige a /login)
- ✔ Configuración real de Routing.jsx para /epi/reportes › EPI no puede entrar a /panel-orientador (redirige a /login)
- ✔ Configuración real de Routing.jsx para /epi/reportes › EPI sí tiene permitida /cambiar-contraseña
- ✔ RegistroPersonas: rol EPI › el select de rol ofrece "Equipo de Permanencia Estudiantil (EPI)" con value=epi
- ✔ RegistroPersonas: rol EPI › [OBSERVACIÓN] el texto de ayuda del formulario no menciona al personal EPI
- ✔ Indicación de página actual en el menú (ciclo 15) › administrador en /epi/reportes: el enlace EPI se resalta (bg-accent) pero sin aria-current
- ✔ Indicación de página actual en el menú (ciclo 15) › [OBSERVACIÓN] EPI en /epi/reportes: su único enlace no se resalta ni tiene aria-current (inconsistente con SidebarAdmin)

**tests/unit/ReportesEpi.bordes.test.jsx** (14)

- ✔ Envío del formulario y concurrencia › Enter en un campo mientras se genera NO dispara otra consulta (botón submit deshabilitado)
- ✔ Envío del formulario y concurrencia › doble clic rápido en "Generar reporte" produce una sola consulta adicional
- ✔ Envío del formulario y concurrencia › la carga inicial se ejecuta una sola vez (sin doble llamada por efectos)
- ✔ Catálogos › si la respuesta no trae catálogos, se conservan los anteriores
- ✔ Catálogos › tras un error, los filtros elegidos y los catálogos se mantienen
- ✔ Catálogos › [OBSERVACIÓN] sin ningún reporte exitoso, los selects Sección/Materia solo ofrecen "Todas"
- ✔ PDF: nombres de archivo por periodo › periodo semanal (inicio 2026-11-09, fin 2026-11-15) → nombre de archivo con periodo y fechas
- ✔ PDF: nombres de archivo por periodo › periodo anual (inicio 2026-01-01, fin 2026-12-31) → nombre de archivo con periodo y fechas
- ✔ PDF: nombres de archivo por periodo › periodo personalizado (inicio 2026-08-01, fin 2026-09-15) → nombre de archivo con periodo y fechas
- ✔ PDF: nombres de archivo por periodo › el PDF incluye id_estudiante cuando el reporte mostrado lo tenía
- ✔ PDF: nombres de archivo por periodo › el PDF no se descarga dos veces con doble clic (botón deshabilitado durante la descarga)
- ✔ Fechas límite › 31 de diciembre: mensual usa 2026-12-01 y Desde = 2026-12-01
- ✔ Fechas límite › 1 de enero a las 00:10 (hora local) mantiene el año local
- ✔ Fechas límite › vaciar el campo Mes y generar: el navegador valida "required" (jsdom: el envío se bloquea)

**tests/unit/ReportesEpi.componente.test.jsx** (53)

- ✔ Carga inicial y renderizado › genera automáticamente el reporte mensual del mes en curso
- ✔ Carga inicial y renderizado › muestra título, subtítulo EPI y el resumen del periodo con fechas dd/mm/aaaa
- ✔ Carga inicial y renderizado › renderiza las 6 tarjetas KPI con sus valores
- ✔ Carga inicial y renderizado › tabla por sección: una fila por sección con contador de materias (singular/plural)
- ✔ Carga inicial y renderizado › color del % de asistencia 95 → text-green-700
- ✔ Carga inicial y renderizado › color del % de asistencia 90 → text-green-700
- ✔ Carga inicial y renderizado › color del % de asistencia 89.9 → text-yellow-700
- ✔ Carga inicial y renderizado › color del % de asistencia 80 → text-yellow-700
- ✔ Carga inicial y renderizado › color del % de asistencia 79.9 → text-red-700
- ✔ Carga inicial y renderizado › color del % de asistencia 0 → text-red-700
- ✔ Carga inicial y renderizado › muestra filtros aplicados (sección, materia, estudiante) en el resumen
- ✔ Carga inicial y renderizado › los catálogos de sección y materia se llenan desde la respuesta
- ✔ Selector de periodo: intercambio de campos › por defecto (Mensual) solo muestra el campo Mes con el mes actual
- ✔ Selector de periodo: intercambio de campos › Semanal muestra un campo de fecha con la fecha de hoy
- ✔ Selector de periodo: intercambio de campos › Anual muestra un select de año con los últimos 6 años (actual primero)
- ✔ Selector de periodo: intercambio de campos › Rango personalizado muestra Desde (1.º del mes) y Hasta (hoy)
- ✔ Selector de periodo: intercambio de campos › cambiar el periodo no dispara una consulta hasta presionar Generar
- ✔ Parámetros enviados al servicio por tipo de periodo › semanal → fecha_referencia = día elegido
- ✔ Parámetros enviados al servicio por tipo de periodo › mensual → fecha_referencia = AAAA-MM-01
- ✔ Parámetros enviados al servicio por tipo de periodo › anual → fecha_referencia = AAAA-01-01
- ✔ Parámetros enviados al servicio por tipo de periodo › personalizado → fecha_inicio/fecha_fin y sin fecha_referencia
- ✔ Parámetros enviados al servicio por tipo de periodo › sección y materia se agregan como id_seccion / id_materia
- ✔ Parámetros enviados al servicio por tipo de periodo › estudiante solo se envía junto con la sección
- ✔ Parámetros enviados al servicio por tipo de periodo › [OBSERVACIÓN] rango personalizado invertido (Desde > Hasta) se envía sin validación en el cliente
- ✔ Select de Estudiante: habilitación, carga y reinicio › deshabilitado sin sección, con texto y title explicativo
- ✔ Select de Estudiante: habilitación, carga y reinicio › al elegir sección muestra "Cargando estudiantes…" y luego la lista con cédula
- ✔ Select de Estudiante: habilitación, carga y reinicio › cambiar de sección reinicia el estudiante seleccionado y recarga la lista
- ✔ Select de Estudiante: habilitación, carga y reinicio › volver a "Todas" las secciones deshabilita y vacía el estudiante
- ✔ Select de Estudiante: habilitación, carga y reinicio › respuesta tardía de una sección anterior no sobrescribe la lista actual (cancelación)
- ✔ Select de Estudiante: habilitación, carga y reinicio › si falla la carga de estudiantes, queda "Todos (0)" sin mensaje de error visible
- ✔ Select de Estudiante: habilitación, carga y reinicio › cambiar el año del periodo recarga estudiantes con el nuevo año
- ✔ Expandir / contraer secciones › botón de sección alterna aria-expanded y muestra las materias
- ✔ Expandir / contraer secciones › "Ver detalle de todas" expande todo y cambia a "Contraer todo"
- ✔ Expandir / contraer secciones › expandir manualmente todas las secciones cambia la etiqueta a "Contraer todo"
- ✔ Expandir / contraer secciones › regenerar el reporte contrae las secciones abiertas
- ✔ Expandir / contraer secciones › sin secciones no aparece el botón "Ver detalle de todas" y se muestra mensaje vacío
- ✔ Descarga de PDF › usa los parámetros del reporte mostrado y nombre de archivo según filtros
- ✔ Descarga de PDF › si se cambian filtros sin regenerar, el PDF usa los parámetros anteriores
- ✔ Descarga de PDF › tras regenerar, el PDF usa los nuevos parámetros
- ✔ Descarga de PDF › muestra "Generando PDF…" y deshabilita el botón durante la descarga
- ✔ Descarga de PDF › error al descargar muestra diálogo de error
- ✔ Descarga de PDF › reporte sin secciones: el botón abre el aviso "Sin datos" y no descarga
- ✔ Descarga de PDF › el diálogo "Sin datos" se cierra con Escape
- ✔ Aviso amarillo de filtros modificados › no aparece tras la carga inicial
- ✔ Aviso amarillo de filtros modificados › aparece al cambiar un filtro y desaparece al regenerar
- ✔ Aviso amarillo de filtros modificados › desaparece si el usuario revierte el filtro al valor del reporte
- ✔ Aviso amarillo de filtros modificados › no aparece mientras se está generando
- ✔ Aviso amarillo de filtros modificados › cambiar solo el estudiante (no generado) también activa el aviso
- ✔ Estados de carga y error › mientras genera: indicador role=status, Generar y Descargar deshabilitados
- ✔ Estados de carga y error › error de API con mensaje del backend → role=alert con ese mensaje
- ✔ Estados de carga y error › error de red sin cuerpo → mensaje genérico en español
- ✔ Estados de carga y error › un error posterior oculta el reporte previo; un éxito posterior limpia el error
- ✔ Estados de carga y error › [OBSERVACIÓN] mensaje "message" del backend (en vez de "error") no se muestra

**tests/unit/ReportesEpi.estado-oculto.test.jsx** (4)

- ✔ Estado oculto del estudiante seleccionado › tras cambiar de sección, el reporte NO incluye el estudiante de la sección anterior
- ✔ Estado oculto del estudiante seleccionado › el valor visible del select coincide con lo que se envía (sección 1 → estudiante 502)
- ✔ Cambios de filtros mientras se genera (ciclo 8) › los filtros siguen editables durante la carga; al llegar la respuesta se muestra el reporte pedido y aparece el aviso
- ✔ Cambios de filtros mientras se genera (ciclo 8) › [OBSERVACIÓN] durante la carga los selects no se deshabilitan ni indican que el cambio no afectará al reporte en curso

**tests/unit/ReportesEpi.fechas.test.jsx** (3)

- ✔ Fechas futuras y límites › [OBSERVACIÓN] los campos de fecha no tienen max: se puede pedir un mes futuro (2027-03)
- ✔ Fechas futuras y límites › [OBSERVACIÓN] semanal acepta cualquier día; el rango lunes-domingo lo calcula el backend y solo se ve tras generar
- ✔ Fechas futuras y límites › el select de año solo ofrece años pasados y el actual (no futuros)

**tests/usabilidad/accesibilidad.test.jsx** (38)

- ✔ axe-core por estado de la pantalla › estado inicial con datos: sin violaciones serias/críticas
- ✔ axe-core por estado de la pantalla › todas las secciones expandidas: sin violaciones serias/críticas
- ✔ axe-core por estado de la pantalla › periodo personalizado + sección + estudiantes cargados
- ✔ axe-core por estado de la pantalla › estado de error
- ✔ axe-core por estado de la pantalla › estado de carga
- ✔ axe-core por estado de la pantalla › diálogo "Sin datos" abierto
- ✔ axe-core por estado de la pantalla › aviso amarillo visible
- ✔ axe-core por estado de la pantalla › [INFORMATIVO] no hay violaciones de ningún impacto en el estado inicial
- ✔ Etiquetas de formularios (WCAG 1.3.1, 3.3.2, 4.1.2) › cada control del formulario tiene <label> asociado en todos los tipos de periodo
- ✔ Etiquetas de formularios (WCAG 1.3.1, 3.3.2, 4.1.2) › los ids de los controles son únicos
- ✔ Etiquetas de formularios (WCAG 1.3.1, 3.3.2, 4.1.2) › campos de fecha obligatorios marcados con required
- ✔ Etiquetas de formularios (WCAG 1.3.1, 3.3.2, 4.1.2) › [OBSERVACIÓN] la obligatoriedad no se indica visualmente en la etiqueta (sin "*" ni "(obligatorio)")
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › orden de tabulación lógico dentro del contenido principal
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › Enter dentro del campo Mes envía el formulario (genera reporte)
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › Enter y Espacio sobre el botón de sección alternan aria-expanded
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › todos los botones de sección exponen aria-expanded booleano
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › [OBSERVACIÓN] los botones de sección no tienen aria-controls hacia las filas que muestran
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › al abrir el diálogo "Sin datos" el foco va al botón "Entendido"
- ✔ Operación solo con teclado (WCAG 2.1.1, 2.4.3) › [OBSERVACIÓN] el alertdialog no enlaza el mensaje con aria-describedby
- ✔ Foco visible y estados (WCAG 2.4.7, 1.4.11) › botones de la librería UI declaran estilo focus-visible (anillo)
- ✔ Foco visible y estados (WCAG 2.4.7, 1.4.11) › selects e inputs cambian borde y anillo al enfocar
- ✔ Foco visible y estados (WCAG 2.4.7, 1.4.11) › [OBSERVACIÓN] los botones de expandir sección no definen estilo de foco propio (dependen del outline global outline-ring/50)
- ✔ Estados deshabilitados y su explicación › Estudiante deshabilitado expone la razón como descripción accesible (title)
- ✔ Estados deshabilitados y su explicación › [OBSERVACIÓN] "Descargar PDF" deshabilitado tras un error no explica por qué
- ✔ Estados deshabilitados y su explicación › el aviso de filtros cambiados es anunciado (role=status) y menciona la acción a tomar
- ✔ Estructura semántica (WCAG 1.3.1, 2.4.6) › hay exactamente un h1 y un landmark main
- ✔ Estructura semántica (WCAG 1.3.1, 2.4.6) › [OBSERVACIÓN] los títulos de tarjeta ("Parámetros del reporte", "Conteo por sección") no son encabezados
- ✔ Estructura semántica (WCAG 1.3.1, 2.4.6) › la tabla tiene encabezados de columna
- ✔ Estructura semántica (WCAG 1.3.1, 2.4.6) › [OBSERVACIÓN] la tabla no tiene <caption> ni encabezados de fila (th scope=row)
- ✔ Consistencia de textos en español › no hay textos en inglés visibles en la pantalla
- ✔ Consistencia de textos en español › etiquetas KPI y columnas usan la misma terminología (Presentes, Tardías, Total)
- ✔ Consistencia de textos en español › [OBSERVACIÓN] el orden de ausencias difiere entre KPI (injustificadas→justificadas) y tabla (justificadas→injustificadas)
- ✔ Consistencia de textos en español › [OBSERVACIÓN] encabezados abreviados "Aus." sin <abbr title> (lectores de pantalla leen "aus")
- ✔ Consistencia de textos en español › se usa la elipsis tipográfica "…" de forma consistente en estados de carga
- ✔ Teclado mientras cargan los estudiantes (ciclo 9) › [OBSERVACIÓN] con la lista cargando, Tab desde Sección salta Estudiante (disabled) y llega a Generar
- ✔ Regiones vivas (ciclo 12) › [OBSERVACIÓN] el aviso amarillo (role=status) se monta junto con su texto: no existe una región viva previa
- ✔ Regiones vivas (ciclo 12) › el error usa role=alert (se anuncia al insertarse)
- ✔ Regiones vivas (ciclo 12) › [OBSERVACIÓN] al terminar la generación no se anuncia el resultado (no hay región viva con el resumen)

**tests/usabilidad/contraste.test.js** (12)

- ✔ Colores de estado del % de asistencia sobre blanco (celdas text-sm, 4.5:1) › text-green-700 sobre blanco ≥ 4.5:1
- ✔ Colores de estado del % de asistencia sobre blanco (celdas text-sm, 4.5:1) › text-yellow-700 sobre blanco ≥ 4.5:1
- ✔ Colores de estado del % de asistencia sobre blanco (celdas text-sm, 4.5:1) › text-red-700 sobre blanco ≥ 4.5:1
- ✔ Colores de estado del % de asistencia sobre blanco (celdas text-sm, 4.5:1) › text-blue-700 (KPI aus. justificadas) sobre blanco ≥ 4.5:1
- ✔ Fila "Total general" (fondo bg-blue-50) › text-green-700 sobre blue-50 ≥ 4.5:1
- ✔ Fila "Total general" (fondo bg-blue-50) › text-yellow-700 sobre blue-50 ≥ 4.5:1
- ✔ Fila "Total general" (fondo bg-blue-50) › text-red-700 sobre blue-50 ≥ 4.5:1
- ✔ Avisos › aviso amarillo: text-yellow-800 sobre bg-yellow-50 ≥ 4.5:1
- ✔ Avisos › error: text-red-700 sobre bg-red-50 ≥ 4.5:1
- ✔ Textos secundarios y estados › text-muted-foreground (etiquetas KPI text-xs) sobre blanco ≥ 4.5:1
- ✔ Textos secundarios y estados › [INFORMATIVO] select deshabilitado: slate-500 sobre slate-200/60 (exento por WCAG 1.4.3 al estar inactivo)
- ✔ Textos secundarios y estados › [OBSERVACIÓN] anillo de foco de inputs ring-slate-900/20 por sí solo < 3:1 (compensa borde slate-900)

**tests/usabilidad/responsive.test.jsx** (13)

- ✔ Tabla y filtros en ancho móvil › la tabla está dentro de un contenedor con overflow-x-auto y tiene ancho mínimo 720px
- ✔ Tabla y filtros en ancho móvil › el formulario de filtros usa flex-wrap (los controles bajan de línea)
- ✔ Tabla y filtros en ancho móvil › las tarjetas KPI usan 2 columnas en móvil, 3 en md y 6 en xl
- ✔ Tabla y filtros en ancho móvil › el encabezado (título + botón PDF) puede envolver en pantallas pequeñas
- ✔ Tabla y filtros en ancho móvil › el contenido principal deja espacio superior para el botón de menú fijo en móvil (pt-16)
- ✔ Menú lateral fuera de pantalla en móvil › con el menú cerrado el panel se desplaza fuera de pantalla (-translate-x-full)
- ✔ Menú lateral fuera de pantalla en móvil › abrir el menú móvil muestra el panel y el fondo de cierre con etiqueta accesible
- ✔ Menú lateral fuera de pantalla en móvil › [OBSERVACIÓN] al abrir el menú móvil el foco no se mueve al panel
- ✔ Menú lateral fuera de pantalla en móvil › [OBSERVACIÓN] Escape no cierra el menú móvil
- ✔ Menú lateral fuera de pantalla en móvil › el enlace del menú EPI no indica la página actual (aria-current)
- ✔ Menú móvil abierto (ciclo 8) › axe-core sin violaciones serias/críticas con el menú móvil abierto
- ✔ Menú móvil abierto (ciclo 8) › la transición del panel respeta prefers-reduced-motion (motion-reduce:transition-none)
- ✔ Menú móvil abierto (ciclo 8) › cerrar con el fondo oscuro devuelve el panel fuera de pantalla


</details>
