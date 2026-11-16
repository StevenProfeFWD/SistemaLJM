# Informe consolidado de pruebas: rol EPI (Equipo de Permanencia Estudiantil)

> **Actualización (2ª ronda): defectos corregidos.** Los 66 fallos que demostraban defectos quedaron corregidos en la aplicación. Se ejecutó una revisión de unos 30 minutos con 3 agentes, que encontró 9 puntos adicionales; también se corrigieron. El resumen de esta ronda está en la sección 0. Las secciones 1 a 6 conservan el informe original como historial.

## 0. Resultado de las correcciones

### 0.1 Estado final de las suites

| Suite | Antes de corregir | Después de corregir y revisar |
|---|---|---|
| backend-unitarias | 1036 (15 `it.fails` de defectos) | **1106 / 1106** (incluye 63 pruebas nuevas de revisión) |
| backend-api | 287 / 323 (36 defectos) | **348 / 348** (incluye 24 pruebas nuevas de revisión) |
| frontend | 270 / 287 (15 defectos + 2 de tiempo) | **328 / 328** (incluye 40 pruebas nuevas de revisión) |

**Cambios en las pruebas existentes:**
- Las pruebas que documentaban el comportamiento defectuoso ahora validan el comportamiento corregido.
- Las etiquetas `[DEFECTO]` pasaron a `[CORREGIDO]`. Ya no queda ningún `it.fails`.
- Las pruebas de rendimiento ahora corren archivo por archivo (`fileParallelism: false`). Al competir por CPU daban fallos intermitentes que no eran defectos.

**Otras comprobaciones:**
- El `vite build` del frontend funciona.
- El lint de los archivos modificados está sin errores. Los 6 errores que quedan son anteriores y están en archivos que no se tocaron.

### 0.2 Qué se corrigió (aplicación)

**Backend: reporte EPI** (`epiReportesService.js`)
- Ahora responden 400 en lugar de 500 o de un resultado erróneo:
  - fechas inexistentes y años menores que 1;
  - un periodo desconocido (mayúsculas y espacios se normalizan);
  - parámetros repetidos o enviados como arreglo;
  - ids no numéricos, decimales o mayores que el máximo int4;
  - un `anio` inválido.
- El rango personalizado tiene un máximo de 366 días.
- "Hoy" se calcula en hora de Costa Rica.
- El porcentaje se redondea sin error de coma flotante.
- El catálogo de secciones va en orden natural.
- `id_estudiante` solo resuelve personas con rol estudiante (privacidad).

**Backend: PDF EPI** (`pdfService.js`)
- Los textos largos se recortan con "…" en una sola línea.
- Una fecha vacía muestra "Sin fecha".
- Aparece la columna «Otros» cuando hay registros de ese tipo.
- Durante la generación se libera el event loop: el bloqueo pasó de 4 a 35 s a unos 0,5 s.
- Se usa el logo reducido `public/images/logo-mep-pdf.png` (archivo nuevo), con el original como respaldo.
- El pie del PDF muestra la hora de Costa Rica.

**Backend: seguridad**
- **Revocación de sesión fail-closed:** si la consulta de revocación falla, la petición se rechaza con 503 y no se cierra la sesión. Si la tabla no existe (42P01), el token se considera no revocado.
- **Errores 5xx no controlados:** ya no exponen el mensaje interno de la base de datos; ese detalle queda en el log del servidor.

**Backend: otros módulos**
- Las cuentas EPI se pueden listar, editar e inactivar en la gestión de personal. El filtro usa `nombre_rol::text`, así que no falla aunque falte la migración del enum.
- No se puede eliminar una expulsión (403).
- La numeración de secciones nuevas ya no duplica nombres.
- La precarga CSV:
  - rechaza fechas imposibles y el año 0000;
  - acepta una hora opcional y el desfase horario.
- El panel de encargados calcula hoy, el mes y el año en hora de Costa Rica.
- `fechaDiaAnterior` ya no depende de la zona horaria del servidor.
- `etiquetaRolPersona` ya no devuelve propiedades heredadas.
- Clave de cookies: se toman 32 bytes y no 32 caracteres. Con claves ASCII la clave queda idéntica, así que las cookies existentes siguen siendo válidas.

**Frontend**
- **Página EPI:**
  - El estudiante seleccionado se limpia si no está en la lista del nuevo año.
  - Aparece la columna «Otros» cuando hay registros de ese tipo.
  - La tabla está memoizada: cambiar un filtro ya no vuelve a dibujar cientos de filas.
  - Ahora muestra los mensajes `{mensaje}` del backend.
- **RegistroPersonas:**
  - Las etiquetas están asociadas a sus campos.
  - Hay un `<form>` real con validación, así que «Guardar» ya no envía campos vacíos.
- **AlertDialog:**
  - El foco vuelve al botón que abrió el diálogo y queda atrapado dentro mientras está abierto.
  - El mensaje se enlaza con `aria-describedby`.
- **`index.html`:** `lang="es"` y un título descriptivo.
- **`--ring`:** el anillo de foco ahora es oscuro y visible. Este cambio afecta toda la aplicación.
- **Selects:** los habilitados ya no se ven grises.
- **Menú móvil:**
  - Cerrado, queda invisible y no recibe foco.
  - Abierto, se desliza como antes.
- **`mapApiError`:** filtra el mensaje genérico de axios y lee `mensaje`.

### 0.3 Revisión de 30 minutos (3 agentes)

Informes de los agentes:
- [revision-backend.md](revision-backend.md)
- [revision-frontend.md](revision-frontend.md)
- [revision-sistema.md](revision-sistema.md)

Hallazgos y lo que se hizo con cada uno:

| Hallazgo | Severidad | Estado |
|---|---|---|
| Si no se ejecutó `34_bd_rol_epi.sql`, el `IN (... 'epi')` rompía la gestión de profesores y orientadores | Media | Corregido (`nombre_rol::text`) |
| Si faltaba la tabla `jwt_revocado`, todas las peticiones daban 503 | Media (riesgo) | Corregido (42P01 → no revocado) |
| El 503 responde `{mensaje}`, pero el frontend no lo mostraba | Baja | Corregido |
| Panel de encargados: el año y el mes se calculaban con la hora del servidor (400 el 31/12 por la noche) | Media-baja | Corregido |
| CSV: aceptaba el año 0000 y rechazaba fechas ISO con desfase horario | Baja | Corregido |
| El pie del PDF EPI mostraba la hora del servidor (UTC) | Baja | Corregido |
| El menú móvil perdía la animación (Tailwind 4 usa la propiedad `translate`) | Baja | Corregido (`transition-[translate,visibility]`) |
| Firefox y Safari no soportan `type=month`: con una entrada inválida la lista de estudiantes se vacía sin aviso | Baja | Pendiente (anterior a esta ronda) |
| `ConfirmDialog` no tiene las mejoras de foco de `AlertDialog`; las tarjetas KPI no muestran «Otros» | Baja | Pendiente (mejora) |

### 0.4 Pendientes y riesgos

- **Base de datos real:** no se probó contra PostgreSQL. Todo se probó con base de datos simulada; conviene una prueba de punta a punta tras ejecutar `database/34_bd_rol_epi.sql`.
- **Cambios de comportamiento visibles:**
  - Las peticiones inválidas al reporte EPI ahora responden 400 con mensaje, donde antes se usaba un valor por defecto en silencio.
  - El rango personalizado tiene un máximo de 366 días.
  - El anillo de foco es más oscuro en toda la aplicación.
- **Prueba de bloqueo del PDF:** pasa con unos 0,5 a 0,9 s frente a un umbral de 1 s. Si la máquina está muy cargada puede acercarse al límite.
- **Commits:** nada está en commit.

---

**Fecha:** 14 de noviembre de 2026
**Duración:** de 18:55 a 20:48 aprox. Fueron 3 subagentes trabajando en paralelo durante unas 2 horas.
**Alcance:**
- Reporte de asistencia EPI: backend, PDF y página en el frontend.
- Lo que el rol EPI toca en el resto del sistema: registro de personas, menú, rutas y autenticación.
- Módulos vecinos, cuando las pruebas los cargaron.

**Estado de la aplicación:** **no se modificó ningún archivo de la aplicación**. Solo se crearon archivos dentro de `SIS-GANAAE/pruebas/`. `git status` quedó igual que al inicio.

---

## 1. Resumen ejecutivo

| Suite | Tipo de pruebas | Ciclos | Pruebas | Pasan | Fallan | Fallos que son defectos | Fallos que no son defectos |
|---|---|---|---|---|---|---|---|
| [backend-unitarias](backend-unitarias/INFORME.md) | Unitarias, caja blanca, cobertura | 40 | 1036 | 1021 | 15 (`it.fails`) | 15 | 0 |
| [backend-api](backend-api/INFORME.md) | Caja negra, funcionales, rendimiento y carga | 12 | 323 | 287 | 36 | 36 | 0 |
| [frontend](frontend/INFORME.md) | Unitarias, funcionales, usabilidad, accesibilidad, rendimiento ligero | 17 | 287 | 270 | 17 | 15 | 2 (tiempo en jsdom) |
| **Total** | | **69** | **1646** | **1578** | **68** | **66** | **2** |

**Verificación independiente.** Al terminar, volví a correr las tres suites una vez y obtuve los mismos resultados:
- **backend-unitarias:** 1036/1036 en verde. Las 15 pruebas de defecto están marcadas con `it.fails`: muestran el comportamiento correcto y "pasan" porque el defecto existe.
- **backend-api:** 287 pasan y 36 fallan. Las 36 tienen la etiqueta `[DEFECTO]`.
- **frontend:** 270 pasan y 17 fallan. 15 son `[DEFECTO]`. Las otras 2 son límites de tiempo de render en jsdom (1500 ms y 300 ms) que dependen de la carga de la máquina. En Chromium real las mismas operaciones tardan entre 28 y 246 ms, así que **no se consideran defectos**.

**Cómo se interpreta un fallo.** Una prueba que "falla" casi siempre demuestra un defecto real. Se escribieron así a propósito para que pasen a verde cuando el defecto se corrija.

**Conclusión general.** La funcionalidad central del rol EPI es correcta:
- cálculo de periodos;
- conteos por sección y materia;
- porcentaje de asistencia;
- filtros;
- permisos por rol;
- detalle diario;
- generación del PDF.

La cobertura del servicio EPI es del 100 % de sentencias y ramas. La página EPI tiene 100 % de cobertura y **0 violaciones de accesibilidad** con axe.

Los problemas encontrados se concentran en cinco áreas:
1. validación de entradas (fechas e ids);
2. rendimiento del PDF con volúmenes muy grandes;
3. un defecto funcional en el filtro de estudiante;
4. un hueco de gestión: las cuentas EPI no se pueden administrar;
5. accesibilidad en componentes compartidos, fuera de la página EPI.

---

## 2. Qué pasó (lo que funciona bien)

### Backend
- **`calcularRangoPeriodo`.**
  - La semana va de lunes a domingo, incluyendo cruces de mes y de año.
  - El mes contempla años bisiestos.
  - El año es el año calendario.
  - En el periodo personalizado se valida el orden de las fechas.
- **Conteos.**
  - Los totales por materia suman el total de la sección.
  - Las secciones suman el resumen general.
  - Las cifras del JSON coinciden con las del PDF.
- **Porcentaje de asistencia.** Se calcula como (presentes + tardías) / total, con 1 decimal. Cuando el total es 0, el resultado es 0.
- **Filtros.** Sección, materia y estudiante funcionan por separado y combinados. La lista de estudiantes incluye a los matriculados y a los que tienen marcas en la sección.
- **Detalle diario del PDF.**
  - Se agrupa por fecha y luego por sección.
  - Los registros se ordenan por condición y luego por nombre.
  - Sin estudiante seleccionado se muestran solo las incidencias. Con estudiante seleccionado se muestra todo su historial.
- **Permisos.**
  - Sin token: 401.
  - Roles no autorizados (profesor, orientador, encargado, estudiante): 403.
  - `epi`, `administrador` y `super_administrador`: 200.
- **PDF.**
  - Se genera bien en casos vacíos y en casos grandes.
  - Pone "(continuación)" y repite el encabezado al saltar de página.
  - El pie "Página X de Y" es correcto.
  - Los acentos y la ñ se ven bien.
- **Carga JSON.** 0 errores y 0 timeouts en todas las corridas de carga, con hasta 100 conexiones simultáneas.
  - Entre 4 y 40 ms por petición.
  - Se satura entre 130 y 230 peticiones por segundo.
  - Las cifras se midieron con la BD simulada, así que solo reflejan el costo de la aplicación.

### Frontend
- **Página EPI.**
  - Generar el reporte, expandir y contraer secciones y la fila de total general funcionan.
  - El aviso amarillo aparece cuando los filtros cambian después de generar.
  - El PDF usa los parámetros del reporte que se está mostrando.
- **Selector de estudiante.** Se deshabilita si no hay sección, carga al elegir una sección y se reinicia al cambiar de sección.
- **Navegación por rol.**
  - El rol EPI ve solo "Reportes de asistencia" en el menú y entra directo a `/epi/reportes`.
  - El administrador y el super administrador también tienen el enlace.
- **Accesibilidad de la página EPI.**
  - axe: 0 violaciones en 8 estados en jsdom y en 7 estados en Chromium real.
  - Se puede operar solo con teclado.
  - `aria-expanded` funciona correctamente.
  - El contraste de los colores verde, amarillo y rojo cumple el nivel AA.
- **Diseño adaptable.** A 320 px no hay desplazamiento horizontal de la página; solo se desplaza la tabla.
- **Calidad de las pruebas.**
  - Cobertura del alcance: 96.5 %.
  - Mutantes: se detectaron 7 de 8. El restante no es detectable desde la interfaz.
  - 4 ejecuciones en orden aleatorio, sin pruebas inestables.

---

## 3. Qué no pasó: defectos encontrados (sin corregir)

Están agrupados y sin duplicados. Cuando un mismo defecto lo encontraron dos subagentes, se indican ambas referencias. **BU** = backend-unitarias, **API** = backend-api y **FE** = frontend.

### Prioridad alta / media: relacionados directamente con EPI

| # | Defecto | Dónde | Referencias |
|---|---|---|---|
| 1 | **Generar un PDF grande bloquea el servidor completo.** Mientras pdfkit genera el documento, las demás peticiones de todos los usuarios esperan. Con un PDF anual de todo el colegio (500 mil registros, 2542 páginas, 8 MB) el bloqueo fue de 15 a 47 s. Una petición ligera enviada durante un PDF de 20 mil incidencias tardó de 4 a 35 s. | `epiController.js` + `pdfService.js` | API DEF-01 |
| 2 | **El filtro de estudiante no se reinicia al cambiar de año.** El select muestra "Todos", pero el reporte y el PDF siguen filtrados por el estudiante anterior. También ocurre al pasar de Mensual 2026 a Anual 2025. Se reprodujo en Chromium. | `ReportesAsistenciaEpi.jsx:86`, `:98-119` | FE D-01 |
| 3 | **Las cuentas EPI se pueden crear, pero no listar, editar ni inactivar,** porque la lista de roles de personal no incluye `epi`. | `personalService.js:20` (`ROLES_PERSONAL`) | BU D-20 |
| 4 | **Fechas inexistentes producen error 500 en lugar de 400.** Por ejemplo `2026-02-31`, `2025-13-01` o `2026-00-15`. Solo se valida el formato con una expresión regular, así que la fecha llega a la BD o el JavaScript la "normaliza": `2025-02-31` termina dando un reporte de marzo. Los años 0000 a 0099 se convierten en 1900 a 1999. | `epiReportesService.js:50-62` | BU D-01, D-02 · API DEF-03, DEF-10 |
| 5 | **Parámetros enviados como arreglo** (`fecha_referencia[]=…`, `fecha_inicio[]=…`). Pueden provocar un TypeError con respuesta 500, o se devuelven como arreglo dentro de `filtros`. | `epiReportesService.js:23`, `:59-60` | BU D-13 · API DEF-12 |
| 6 | **Ids fuera de rango o mal formados.** Ids mayores que 2 147 483 647 dan 500. Valores como `12abc`, `1.9` o `1e3` se aceptan como 12, 1 y 1. No hay riesgo de inyección SQL porque las consultas están parametrizadas. | `parseEntero` (`epiReportesService.js:32-36`) | BU D-03 · API DEF-04, DEF-08 |
| 7 | **`id_estudiante` devuelve el nombre y la cédula de cualquier persona,** por ejemplo un encargado o un administrador, no solo de estudiantes. Es un tema de privacidad. | `epiReportesService.js` (filtro de estudiante) | API DEF-06 |
| 8 | **El rango personalizado no tiene límite.** Se acepta del año 0001 al 9999. Combinado con el defecto 1, permite bloquear el servidor. | `calcularRangoPeriodo` | API DEF-07 |
| 9 | **Los nombres largos se superponen entre filas del PDF.** Con `lineBreak:false` + `ellipsis`, pdfkit igualmente parte el texto. Pasa con nombres de estudiante, títulos de sección y cédulas. | `pdfService.js:740-747`, `:768`, `:926` | BU D-07 |
| 10 | **Cada PDF tiene un costo fijo de 240 a 310 ms,** aunque esté vacío. En cada petición se decodifica el logo de 4182×704 px y se vuelven a cargar las fuentes Roboto. Solo se generan 1 o 2 PDF por segundo. | `pdfService.js` | API DEF-02 |

### Prioridad baja: relacionados con EPI

- **Periodo inválido.** Un periodo desconocido (`diario`, `SEMANAL`) cae en `mensual` sin avisar, y una fecha con otro formato cae en "hoy" (API DEF-09).
- **Parámetro `anio` del endpoint de estudiantes.** Valores como `-5`, `0` o `99999999999` dan 500 (BU D-04 · API DEF-11).
- **Redondeo del porcentaje.** Por coma flotante, 50.25 % se muestra como 50.2 en vez de 50.3 (BU D-12).
- **Fecha nula en el PDF.** Una fecha nula en el detalle imprime "undefined" (BU D-06).
- **Orden de secciones.** En el catálogo aparecen en orden lexicográfico (10-1 antes que 7-1) (API DEF-13).
- **Desglose de la tabla en pantalla.** No cuadra con el total cuando hay registros "otros", que no tienen columna (FE D-02).
- **Zona horaria.** Sin fecha de referencia, el periodo usa la fecha local del servidor. Si el servidor corre en UTC, después de las 18:00 de Costa Rica el periodo por defecto ya es "mañana" (BU O-16).
- **Fórmulas de porcentaje distintas.** El reporte EPI usa (P+T)/total y los reportes estratégicos usan (total−AI)/total. Con los mismos datos uno da 50 % y el otro 75 % (BU O-08).

### Componentes compartidos usados por EPI (frontend)

| # | Defecto | Dónde | Ref. |
|---|---|---|---|
| 11 | Las 7 etiquetas del formulario de registro no están asociadas a sus campos. El select de rol, donde se elige EPI, no tiene nombre accesible. | `RegistroPersonas.jsx:216-281` | FE D-03 |
| 12 | No hay `<form>`, así que "Guardar" envía campos vacíos al servidor. El backend tampoco valida correo, cédula ni fecha de nacimiento. | `RegistroPersonas.jsx:157`, `:319` · `postPersona` | FE D-12 · BU O-15 |
| 13 | Diálogo de alerta: el foco no vuelve al botón que lo abrió y no queda atrapado dentro del diálogo. | `AlertDialog.jsx:43-47`, `:93-98` | FE D-04, D-05 |
| 14 | `index.html` declara `lang="en"` y el título es "frontend-reactjs". | `index.html:2`, `:7` | FE D-06, D-07 |
| 15 | El indicador de foco es casi invisible: contraste de 1.54:1. | `index.css:132` | FE D-08 |
| 16 | En móvil, los enlaces del menú lateral oculto siguen siendo alcanzables con Tab. | `mainBar.jsx:149-157` | FE D-10 |
| 17 | Los select habilitados se ven grises, igual que los deshabilitados. | `form-control-styles.js:3` | FE D-11 |
| 18 | Un mensaje genérico en inglés llega al usuario cuando axios no trae `response.data`. | `lib/errors.js` | FE D-09 |

**Usabilidad.**
- En móvil, el mensaje de error queda fuera de la pantalla después de "Generar reporte".
- Un usuario EPI con sesión activa que abre una ruta prohibida termina en el formulario de login, en lugar de una página de "sin acceso".

### Seguridad: autenticación existente, no del módulo EPI

- **El token revocado se acepta si falla la BD.** Si la consulta de tokens revocados falla, por ejemplo por BD caída o timeout, el token se acepta igual (comportamiento *fail-open*) (`tokenRevocationService.js:57-60`) (BU O-04 · API DEF-05).
- **Rol nulo en la BD.** Si `nombre_rol` es nulo en la BD, se conserva el rol que trae el JWT (`verificarToken.js:50`) (BU O-05).
- **Mensajes internos expuestos.** Algunos controladores devuelven al cliente el mensaje interno de la BD en los errores 500 (BU O-09 · API DEF-14).

### Defectos fuera del alcance EPI (encontrados de paso por las pruebas unitarias)

- **D-17:** `eliminarEstadoPeriodo` permite borrar una expulsión, aunque actualizarla o anularla sí está prohibido (`orientacionService.js:567`).
- **D-19:** el panel de encargados calcula "hoy" en UTC (`padresDashboardService.js:52-54`). Después de las 18:00 de Costa Rica cambian los estados activos.
- **D-16:** al crear una sección se numera como cantidad + 1. Si existen 7-1 y 7-3, intenta crear 7-3 otra vez (`seccionHelper.js:54-58`).
- **D-11:** el PDF de sustituciones lanza un TypeError con la respuesta ya abierta cuando faltan asignaciones (`pdfService.js:590`).
- **Otros de prioridad baja:** fechas en la precarga CSV (D-14), filtros del historial de notificaciones (D-15), cifrado de cookies con claves que tienen ñ (D-09), consultas N+1 en la asistencia de padres (O-10) y validación de `documento_adjunto` (O-11).

El detalle completo de cada defecto, con su reproducción, está en el informe de cada suite.

---

## 4. Rendimiento (resumen)

Todas las cifras se midieron con la BD simulada en memoria. Reflejan el costo de la aplicación, no la latencia real de PostgreSQL. La máquina estaba compartida por los 3 subagentes, así que se reportan medianas.

| Escenario | Resultado |
|---|---|
| Reporte JSON, petición individual | 4 a 40 ms |
| Reporte JSON, 100 conexiones simultáneas | 130 a 230 peticiones por segundo; p99 de 1.4 a 2.2 s; 0 errores |
| PDF vacío o pequeño | 240 a 310 ms (costo fijo por logo y fuentes) |
| PDF con 100 mil registros (anual, todo el colegio) | 6.7 s, 736 páginas |
| PDF con 500 mil registros | 17 a 49 s, 2542 páginas, 8.1 MB; bloquea el servidor |
| Memoria | Unos 430 MB adicionales con 80 mil incidencias |
| Render del frontend en Chromium (40 secciones × 10 materias) | 28 a 246 ms |

Cada página adicional del PDF suma unos 5 ms. Entre 20 mil y 40 mil incidencias el PDF supera los 5 s.

**Limitación.** No hubo pruebas contra un PostgreSQL real: Docker estaba instalado, pero su servicio no estaba encendido. **Tampoco se usó la base del `.env`.** Antes de pasar a producción conviene una prueba de punta a punta con datos reales, después de correr la migración `34_bd_rol_epi.sql`.

---

## 5. Cosas por mejorar (recomendaciones, no aplicadas)

Ordenadas por impacto.

1. **Validar todas las entradas del módulo EPI en un solo lugar.**
   - Comprobar que las fechas existan, haciendo el viaje de ida y vuelta a `Date`.
   - Aceptar solo años entre 2000 y 2100.
   - Aceptar ids como enteros estrictos dentro del rango de int4.
   - Rechazar parámetros que lleguen como arreglo.
   - Responder 400 ante un `periodo` desconocido.
   - Limitar el rango personalizado, por ejemplo a 1 año como máximo.

   Esto corrige los defectos 4, 5, 6 y 8 y los de prioridad baja de periodo y `anio`.
2. **Proteger el servidor durante la generación de PDF.**
   - Poner un tope de filas o páginas en el detalle diario y avisar al usuario si se supera.
   - O generar el PDF en un *worker thread* o en una cola.
   - Cargar el logo y las fuentes una sola vez, al arrancar, y reducir el PNG del logo.
3. **Corregir el reinicio del estudiante** cuando cambia el año o el periodo y el estudiante ya no está en la lista (defecto 2).
4. **Agregar `epi` a `ROLES_PERSONAL`** para que los administradores puedan gestionar esas cuentas (defecto 3).
5. **Restringir `id_estudiante` a personas con rol estudiante** (defecto 7).
6. **PDF:** truncar los textos largos manualmente, midiendo con `widthOfString`, o calcular la altura de la fila según el texto (defecto 9). También mostrar "Sin fecha" cuando la fecha venga nula.
7. **Unificar la fórmula del porcentaje de asistencia** entre EPI y los reportes estratégicos, o explicar la diferencia en ambos lugares.
8. **Calcular "hoy" en la zona horaria de Costa Rica** (`America/Costa_Rica`) en el backend.
9. **Seguridad en la autenticación.**
   - Que la revocación de tokens rechace el token si falla la consulta (*fail-closed*).
   - No devolver los mensajes internos de la BD al cliente.
10. **Accesibilidad en componentes compartidos.**
    - Asociar las etiquetas de `RegistroPersonas` a sus campos y envolver el formulario en un `<form>` con validación.
    - Gestionar el foco en `AlertDialog`.
    - Cambiar a `lang="es"` y poner un título descriptivo.
    - Hacer más visible el indicador de foco.
    - Marcar el menú móvil como `inert` cuando está cerrado.
    - Diferenciar los select deshabilitados.
    - Mostrar una página de "sin acceso" en lugar del login.
    - Llevar el mensaje de error a la vista en móvil.
11. **Hacer una prueba de punta a punta con PostgreSQL** (en Docker) antes de liberar, y reemplazar los límites de tiempo de jsdom por mediciones en navegador real.

---

## 6. Cómo volver a correr las pruebas

**Backend unitarias:**
```bash
cd SIS-GANAAE/pruebas/backend-unitarias && npx vitest run
```

**Backend API:**
```bash
cd SIS-GANAAE/pruebas/backend-api && npx vitest run
```

**Rendimiento de la API:**
```bash
cd SIS-GANAAE/pruebas/backend-api && npm run perf
```

**Frontend:**
```bash
cd SIS-GANAAE/pruebas/frontend && npx vitest run
```

Cada carpeta tiene sus propias dependencias (`node_modules`) y no modifica los `package.json` de la aplicación. En `resultados/` de cada suite queda la bitácora de los ciclos. Las pruebas `[DEFECTO]` pasarán a verde cuando se corrija el defecto que demuestran.
