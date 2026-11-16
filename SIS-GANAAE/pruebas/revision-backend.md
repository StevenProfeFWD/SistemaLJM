# Revisión de correcciones del backend (backend-node/src)

Fecha: 14/11/2026 · Duración: ~30 min · Alcance: `git diff -- backend-node/src` (sin commit) más los archivos EPI nuevos que tocan las correcciones (`epiReportesService.js`, `pdfService.js` → `pipeReporteAsistenciaEpiPdf`).

Reglas cumplidas: no se modificó código de la app ni pruebas existentes; todo con BD simulada (sin `.env`); el único servidor propio usó el puerto 4521 y se cerró dentro de la prueba.

## Ciclos ejecutados

| Ciclo | backend-unitarias | backend-api | Notas |
|---|---|---|---|
| 1 (antes de pruebas nuevas) | 35 archivos · **1043/1043 ✓** | 15 archivos · **323 ✓ / 1 ✗** | ✗ = prueba de rendimiento `10_ciclo4` (1508 ms > 1000 ms); se ejecutaron por error dos corridas de la suite API a la vez |
| 2 (con `tests/revision/`) | 36 archivos · **1103 ✓ / 3 ✗** | 16 archivos · **348/348 ✓** | Los 3 ✗ son las pruebas `[HALLAZGO]` (fallan a propósito). `10_ciclo4` sola: 1044 ms (✗); dentro de la suite completa: 934 ms (✓) |
| 3 | 36 archivos · **1103 ✓ / 3 ✗** (los mismos 3 `[HALLAZGO]`) | 16 archivos · **347 ✓ / 1 ✗** | ✗ = de nuevo `10_ciclo4` (1288 ms; 97 peticiones ligeras durante el PDF, la otra suite de frontend corría en paralelo) |

Prueba de rendimiento `10_ciclo4` (latencia de una petición ligera durante un PDF anual de 20 000 incidencias): es inestable alrededor del umbral (934–1508 ms según la carga de la máquina, con otra suite de frontend corriendo en paralelo). Medición aislada del PDF EPI (script fuera del repo, 20 000 registros de detalle, en caliente): el bloqueo máximo del event loop fue **163 ms** y ocurre al inicio (fuentes/logos, antes de la primera cesión); en frío 357 ms. El resto del tiempo cede cada ~12 ms como se pretendía. La latencia restante del test viene principalmente de la consulta/armado de datos en la BD simulada (síncrona), no del dibujo del PDF. **No se considera hallazgo**, pero el umbral de 1 s queda sin margen en máquinas cargadas.

## Pruebas nuevas

- `pruebas/backend-unitarias/tests/revision/revisionCorrecciones.test.js` — 63 pruebas (60 ✓, 3 `[HALLAZGO]` ✗):
  padresDashboard con servidor en UTC; cookieEncryption (compatibilidad de la clave ASCII con la derivación anterior, multibyte, byte 32 a mitad de carácter, SHA-256 para claves cortas); `etiquetaRolPersona` con nombres de `Object.prototype`; `puedeVerReportesEpi`; `parseFechaNacimiento` (válidas, inválidas, hora opcional, desfase horario, año 0000); `obtenerOAsignarSeccion` (huecos, nombres sin sufijo numérico, reutilización); `fechaDiaAnterior` en 5 zonas horarias; `errorHandler` (5xx genérico + log, AppError conserva mensaje, 4xx, CORS, `legacyJson`, `.status` vs `.statusCode`); revocación fail-closed (503 en sesión normal y cambio de contraseña, token sin `jti`, recuperación); `calcularRangoPeriodo` (normalización, formas del frontend, arreglos/objetos, 366/367 días, años 0001/9999, "hoy" en CR con servidor UTC); ids estrictos int4; `anio`; redondeo de % con enteros; orden natural de `catalogos.secciones`; `id_estudiante` sólo con `nombre_rol='estudiante'`; PDF EPI (emoji/pares sustitutos y textos larguísimos, "Sin fecha", columna «Otros» condicional, fila más alta que una página, cesión del event loop).
- `pruebas/backend-api/tests/revision/revision_correcciones.test.mjs` — 24 pruebas HTTP (24 ✓):
  parámetros repetidos/anidados → 400 en JSON, PDF y estudiantes; todas las formas de parámetros que envía `ReportesAsistenciaEpi.jsx` siguen en 200; 5xx sin texto de PostgreSQL; `code` numérico 4xx se respeta; `jwt_revocado` caída → 503 (JSON y PDF) y recuperación; token sin `jti`; cliente que aborta un PDF anual a mitad → el servidor sigue respondiendo y no hay excepciones no capturadas.

## Hallazgos

### H-1 · Media-baja · Regresión introducida por la corrección de `padresDashboardService.js`
- **Dónde:** `backend-node/src/services/padresDashboardService.js:7-10` (`inicioAnioLectivo`) y `:22-35` (`inicioMesActual`/`finMesActual`) frente a `:13-20` (`hoyIso`, ahora en hora de Costa Rica).
- **Problema:** sólo `hoyIso()` pasó a America/Costa_Rica; el inicio del año y del mes siguen con la hora del servidor (UTC en Render). Antes las tres usaban UTC y eran coherentes entre sí.
- **Reproducción:** servidor con `TZ=UTC`, 31/12/2026 20:00 hora CR (= 01/01/2027 02:00 UTC) → `obtenerDashboardHijo` llama `consultarHistorialAsistenciaHijo(id, '2027-01-01', '2026-12-31')` → `parseRangoFechas` lanza 400 «fecha_inicio no puede ser posterior a fecha_fin» → el panel del encargado falla (HTTP 400) de 18:00 a 24:00 cada 31 de diciembre.
- **Además:** el último día de cada mes, de 18:00 a 24:00 CR, `rango_mes`/`resumen_mes` ya muestran el mes siguiente mientras "hoy" sigue en el mes actual (esto ya ocurría antes, pero ahora es incoherente con `hoy`).
- **Esperado:** las tres fechas en la misma zona (CR). **Actual:** zonas mezcladas.
- **Pruebas:** `[HALLAZGO] servidor UTC, 31/12/2026 20:00 …` y `[HALLAZGO] servidor UTC, 30/11/2026 20:00 …` en `revisionCorrecciones.test.js`.

### H-2 · Baja · `csvPrecarga.parseFechaNacimiento` acepta el año 0000
- **Dónde:** `backend-node/src/utils/csvPrecarga.js:184-192` (`fechaExiste`).
- **Reproducción:** `parseFechaNacimiento('0000-01-01')` → `'0000-01-01'`; `'01/01/0000'` → `'0000-01-01'`.
- **Esperado:** `null` (error de línea «Fecha de nacimiento inválida»), porque PostgreSQL no tiene año 0. **Actual:** la fila pasa la validación; al insertar, PG lanza «date/time field value out of range» dentro de la transacción de `precargaMasivaEstudiantes` (`matriculaService.js:~1205-1222`) y se cae toda la carga con un 500 genérico en lugar de reportar la línea.
- **Prueba:** `[HALLAZGO] el año 0000 no existe en PostgreSQL …`.

### H-3 · Baja (cosmético) · Pie del PDF EPI con la hora del servidor
- **Dónde:** `backend-node/src/services/pdfService.js` (`pipeReporteAsistenciaEpiPdf`, `const generado = new Date().toLocaleString('es-CR')`).
- Con el servidor en UTC, «Generado el …» muestra la hora UTC (6 h adelantada), en contraste con el "hoy" en CR que ahora usa el reporte. Mismo patrón que ya existía en los demás PDF (`pdfService.js:161, 324, 370, 421`). Sin prueba que falle (depende de la TZ del proceso); se documenta.

## Revisión por área (sin hallazgos salvo lo indicado)

- **epiReportesService.js:** sin hallazgos. Validación estricta correcta; todas las formas que envía el frontend (`periodo` en minúsculas, `fecha_referencia` `AAAA-MM-01`/`AAAA-01-01`, `anio` `AAAA`, ids numéricos) siguen en 200. Semanal de 9999-12-31 → 400 (no 500); 0001-01-01 es lunes y no cae al año 0. Nota: si el usuario vacía el `<input type="month">`, el frontend envía `fecha_referencia=-01` → ahora 400 con mensaje claro (antes también fallaba); se muestra vía `err.response.data.error`, que el errorHandler incluye.
- **pdfService.js:** sin hallazgos funcionales. `unaLinea` resiste emoji y textos de miles de caracteres; "Sin fecha" correcto; columna «Otros» condicional correcta; sustituciones con `asignaciones` ausentes ya no lanza. Cliente que aborta: el servidor no cae (la generación continúa hasta terminar, gasto de CPU inútil; riesgo menor). `fechaLarga` no valida días como 31/02 (datos vienen de la BD, sin impacto).
- **errorHandler.js:** sin hallazgos. En producción el comportamiento es igual al anterior; el cambio sólo afecta desarrollo/pruebas (5xx no-AppError ahora también genéricos) y agrega log. Ninguna suite dependía del texto. Riesgo previo (no introducido): errores con `err.status` (no `statusCode`) que lleguen al errorHandler se vuelven 500; los controladores revisados (orientación, padres) los capturan con try/catch propio.
- **tokenRevocationService.js + verificarToken.js:** sin hallazgos. Único llamador de `tokenEstaRevocado` es `assertTokenNoRevocado` (2 usos), ambos manejan el 503. El interceptor de `frontend-reactjs/src/config/api.js` sólo cierra sesión con 401, así que el 503 no expulsa al usuario. Riesgo operativo: si la tabla `jwt_revocado` no existiera y el usuario de BD no pudiera crearla, todas las rutas autenticadas darían 503 (antes se aceptaba el token); existe `database/29_bd_jwt_revocacion.sql`, verificar que esté aplicado en producción.
- **personalService.js:** sin hallazgos. `epi` aparece en listar/editar/activar; `GestionDocentes.jsx` trata cualquier rol distinto de `profesor` como no-docente (sin sustituciones), correcto para EPI.
- **roles.js:** sin hallazgos (`toString`, `constructor`, `__proto__` ya no devuelven funciones).
- **cookieEncryption.js:** sin hallazgos. Para claves ASCII la clave derivada es idéntica byte a byte a la anterior (prueba descifra con la derivación vieja); claves multibyte ahora funcionan.
- **csvPrecarga.js:** H-2. Cambio de comportamiento menor documentado: `2010-01-01T00:00:00-06:00` (ISO con desfase) antes se aceptaba y ahora es inválido.
- **seccionHelper.js:** sin hallazgos (huecos → max+1; nombres sin número → numero_seccion o cantidad+1).
- **sustitucionHelper.js:** sin hallazgos (`fechaDiaAnterior` correcto en UTC, CR, UTC+14, UTC-11, São Paulo; bisiestos y cambio de año).
- **orientacionService.js:** sin hallazgos. Borrar una expulsión → 403; el controlador usa `e.status`. El frontend no llama a DELETE.

## Riesgos

1. H-1 afecta a encargados en Nochevieja si el servidor corre en UTC (lo habitual en Render).
2. `10_ciclo4` (latencia < 1 s) queda en el límite y fallará de forma intermitente en máquinas cargadas.
3. Fail-closed depende de la disponibilidad de la tabla `jwt_revocado`: una caída de BD ahora bloquea todas las rutas con 503 (intencional, pero conviene monitorearlo).
4. Un PDF abortado por el cliente sigue generándose hasta el final (CPU desperdiciada en reportes grandes).
