# Informe de pruebas de frontend — Rol EPI (Equipo de Permanencia Estudiantil)

**Sistema:** SIS-GANAAE · `frontend-reactjs` (Vite 7, React 19.2, react-router 7.18, Tailwind 4)
**Alcance principal:** `src/pages/epi/ReportesAsistenciaEpi.jsx`, `src/services/epiServices.jsx`, `src/lib/rutasPorRol.js`, `src/components/side-bar/mainBar.jsx`, `src/routes/Protected_Routes.jsx`, `src/routes/Routing.jsx`, `src/components/register-data/RegistroPersonas.jsx`; además módulos puros de `src/lib/` y `src/utils/`, `DialogContext`/`AlertDialog` y `LoadingStatus`.
**Ventana de trabajo:** inicio 18:55:10 (hora local del equipo) · fin {{FIN}} · {{CICLOS}} ciclos de ejecución completa registrados.
**Resultado final (último ciclo):** **{{TOTAL}} pruebas · {{PASAN}} pasan · {{FALLAN}} fallan.** Todas las fallas corresponden a defectos documentados (`[DEFECTO D-xx]`) o a umbrales de tiempo en jsdom (ver §5.3); ninguna falla es intermitente por orden de ejecución.

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

{{TABLA_ARCHIVOS}}

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

{{TABLA_FALLIDAS}}

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

{{TABLA_MUTANTES}}

### 5.2 Ciclos (registro por ciclo)

{{TABLA_CICLOS}}

Notas del registro: en los ciclos 1-2 la columna "Archivos" del script contaba *bloques describe* (43 y 52); se corrigió a archivos desde el ciclo 3. Las violaciones axe se miden en jsdom sobre 8 estados (inicial, expandido, personalizado+estudiantes, error, cargando, diálogo "Sin datos", aviso amarillo, inicial con todos los impactos) con la regla de contraste desactivada (jsdom no pinta); el contraste se midió aparte (§7.2). **Intermitencia observada:** en el ciclo 9 (suite de 82 s, máquina cargada) falló una vez "super administrador navega desde su menú…" por agotar la espera de 8 s del chunk diferido; repetida 3 veces en aislado pasó 3/3. En el ciclo 10 se amplió su espera a 15 s (documentado en el propio archivo). Las 3 pruebas de umbral de tiempo en jsdom fallan o pasan según la carga (ver §5.3). Ninguna otra prueba cambió de resultado entre ciclos ni con orden aleatorio. En el ciclo 1 se detectó y corrigió un falso positivo `region` causado por un elemento auxiliar del propio arnés (`data-testid="ubicacion"`), no por la app.

### 5.3 Rendimiento (ligero)

| Medición | jsdom (mín – máx de {{R_N}} mediciones: pasada en paralelo + aislada de cada ciclo desde el 3) | Chromium, build de desarrollo | Chromium, build de producción |
|---|---|---|---|
| Primer render 40 secciones | {{R_RENDER}} | — | DOMContentLoaded 650 ms; LCP 1 496 ms (incluye 2 × 250 ms de latencia simulada) |
| "Ver detalle de todas" (400 filas) | {{R_EXP}} | 226 – 971 ms | **80 – 246 ms** |
| "Contraer todo" | {{R_CON}} | 95 – 130 ms | 23 – 36 ms |
| Alternar una sección | — | — | 12 – 26 ms |
| Cambio de filtro con 440 filas visibles | {{R_FIL}} | 100 – 416 ms | **28 – 36 ms** |
| React Profiler, cambio de filtro | 1 commit, `actualDuration` ≈ `baseDuration` ({{R_PROF}}) → **se re-renderiza toda la tabla** en cada cambio de filtro | | |

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

{{TABLA_CONTRASTE}}

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
<summary>Ver {{PASAN}} pruebas</summary>

{{LISTA_PASARON}}

</details>
