# Revisión de impacto en todo el sistema (cambios sin commit)

Fecha: 2026-11-14 · Alcance: efectos cruzados entre módulos y contrato frontend↔backend de los arreglos recientes.
No se modificó ningún archivo de la aplicación ni se conectó a la base de datos. Scripts auxiliares en `pruebas/revision-sistema/`:

- `fechas_csv.mjs`: ejecuta `parseFechaNacimiento` (precarga CSV) con 14 casos.
- `cookie_compat.mjs`: compara cómo se obtenía la clave de cifrado de cookies antes y después del cambio.

## Resumen de veredictos

| # | Área | Veredicto |
|---|------|-----------|
| 1 | `errorHandler.js`: los 5xx que no son AppError devuelven un mensaje genérico | OK (solo cambia el comportamiento en desarrollo) |
| 2 | `verificarToken.js` + `tokenRevocationService.js` con cierre ante fallo (503) | Hallazgos H2 y H3 (riesgo de despliegue y experiencia de usuario) |
| 3 | `personalService.js`: rol `epi` en ROLES_PERSONAL + interfaz de GestionDocentes | Hallazgo H1 (orden de despliegue); la interfaz está OK |
| 4a | `seccionHelper.js`: numeración de secciones | OK |
| 4b | `csvPrecarga.js`: fechas imposibles | OK, con la observación H5 |
| 4c | `orientacionService.js`: borrar una expulsión devuelve 403 | OK (ninguna pantalla llama al DELETE) |
| 4d | `padresDashboardService.js`: hoyIso en hora de Costa Rica | Hallazgo H4 |
| 4e | `sustitucionHelper.js`: fechaDiaAnterior en UTC | OK |
| 4f | `cookieEncryption.js` | OK (las claves ASCII dan los mismos bytes) |
| 5 | Cambios globales del frontend (--ring, select, AlertDialog, mainBar, index.html) | OK |
| 6 | Contrato EPI entre frontend y backend | OK, con la observación H6 |

## Hallazgos

### H1. Sin la migración 34, la gestión de TODO el personal falla (media; causado por los arreglos: sí)
- Evidencia: `backend-node/src/services/personalService.js:21` define `ROLES_PERSONAL = ['profesor','orientador','epi']`, y esa lista se usa en `whereIn('nombre_rol', ...)` en las líneas 34, 89 y 161. `persona.nombre_rol` es del enum `tipo_rol` (`database/01_bd_postgresql.sql:4,20`). El valor `'epi'` solo existe después de ejecutar `database/34_bd_rol_epi.sql`.
- Reproducción: se despliega el backend sin ejecutar el script 34 y se abre `/gestion-docentes` (GET `/api/admin/personal`).
- Esperado: listar profesores y orientadores. Real: PostgreSQL rechaza el literal `'epi'` con el error `invalid input value for enum tipo_rol: "epi"` (22P02). El servidor responde 500 "Error interno del servidor". Por la misma causa también fallan la edición y el cambio de estado (activar o inactivar) de profesores y orientadores. Esto es una regresión en un módulo ajeno a EPI.
- Recomendación: dejar documentado que el script 34 debe ejecutarse antes de desplegar, o filtrar los roles contra `pg_enum`.

### H2. Si la consulta de revocación falla, todas las peticiones autenticadas devuelven 503 (media como riesgo; causado: sí)
- Evidencia: `tokenRevocationService.js:57-66` ahora relanza el error y `verificarToken.js:60-70` responde 503. `asegurarTabla()` (líneas 12-29) oculta su propio error. Si la tabla `jwt_revocado` no existe (no se ejecutó el script 29) y el usuario de BD no tiene permiso CREATE sobre el esquema (lo habitual en PostgreSQL 15+), cada petición que lleva token recibe 503. Antes, en ese mismo escenario, el sistema funcionaba sin revocación (aceptaba el token).
- Efecto en el frontend: no hay bucle ni avalancha de reintentos. El interceptor de `src/config/api.js` solo actúa ante 401 y no existe ninguna lógica de reintento ni de `setInterval`. Pero `AuthContext.jsx:12-16` y `refreshUser` tratan cualquier error de `/personas/sesion` como si no hubiera sesión (`user=null`), y `Protected_Routes.jsx` redirige entonces a `/login`. Así, ante un 503 transitorio al cargar la página, el usuario ve el login aunque su cookie siga siendo válida. En `Login.jsx:44-47`, si `refreshUser` recibe un 503 justo después de iniciar sesión, se muestra "Login exitoso" y el usuario vuelve al login. El objetivo declarado de usar 503 ("sin cerrar la sesión del cliente") no se cumple en la carga inicial.
- Severidad: media si falta la migración 29; si no, baja (cuando la BD está caída también fallan las demás consultas).

### H3. El mensaje del 503 nunca se muestra (baja; causado: parcialmente; el formato `mensaje` es anterior)
- `verificarToken.js` responde `{ mensaje }`, pero `frontend-reactjs/src/lib/errors.js` (`mapApiError`) solo lee `message` y `error`, y la página EPI (`ReportesAsistenciaEpi.jsx`, en el `.catch` de `generar`) solo lee `data.error`. El usuario ve el texto genérico de cada pantalla (p. ej. "No se pudo generar el reporte") en lugar de "No se pudo validar la sesión… intente de nuevo".

### H4. Panel de padres: error 400 el 31 de diciembre entre las 18:00 y las 24:00 de Costa Rica (baja; causado: sí, si el servidor está en UTC)
- Evidencia: `padresDashboardService.js:13-20` calcula `hoyIso()` en hora de Costa Rica, pero `inicioAnioLectivo()` (líneas 7-10) sigue usando `new Date().getFullYear()` en la zona horaria del servidor (Render usa UTC). El 31/12 después de las 18:00 de Costa Rica la consulta anual pasa a ser `('AAAA+1-01-01', 'AAAA-12-31')`. `padresAsistenciaService.js:24-28` lanza el error 400 "fecha_inicio no puede ser posterior a fecha_fin", `Promise.all` lo propaga y el panel del encargado falla durante esas 6 horas. Antes ambas fechas se calculaban en UTC y eran coherentes. Ocurre lo mismo, aunque sin error, con `inicioMesActual`/`finMesActual`, que siguen en hora del servidor (el mes puede adelantarse en las últimas 6 horas de cada mes).
- No hay `process.env.TZ` en el código.

### H5. Precarga CSV: la validación de fechas aún admite el año 0000 y ahora rechaza ISO con desfase horario (baja; causado: parcial)
- Resultado de `fechas_csv.mjs`: `31/02/2010`, `2010-02-31` y `29/02/2011` → null, por lo que la fila aparece en `errores_estructura` como "Fecha de nacimiento inválida…". `PrecargaEstudiantes.jsx:88-91,246-251` la muestra en la vista previa y la importación definitiva se bloquea con 400 y `legacyJson` (`matriculaService.js:1113-1116` y siguientes). Esto es una mejora: antes la fila llegaba a PostgreSQL y fallaba toda la transacción con 500.
- `0000-01-01` sigue aceptándose (PostgreSQL no tiene año 0, así que la importación fallaría con 500). Esto es anterior a los arreglos.
- `2010-01-01T00:00:00-06:00` y `+00:00` ahora devuelven null; antes se aceptaban. Es una regresión menor causada por el arreglo, porque la expresión regular ahora termina en `$` y solo admite `Z`.

### H6. Página EPI en navegadores sin `<input type="month">` (baja; causado: no, el arreglo solo lo hace visible)
- En `ReportesAsistenciaEpi.jsx` se envía `fecha_referencia = \`${mes}-01\``. Firefox y Safari de escritorio muestran `type="month"` como un campo de texto libre. Si se escribe `05/2026`, el backend responde 400 "Fecha de referencia inválida (AAAA-MM-DD)", y ese mensaje sí se muestra en pantalla. Además `anioEstudiantes = mes.slice(0,4)` envía un `anio` inválido, y la lista de estudiantes se vacía y se borra el filtro sin avisar al usuario.

## Detalle por área (sin hallazgo)

1. **errorHandler**: todos los servicios que usan `err.status` (orientación, padres, reportes, suspensión con 409) se capturan en sus controladores con `e.status || 500` y no llegan a `errorHandler`. En el backend no hay `throw new Error` dirigido al usuario. Los AppError 500/504 (`personalService.js:492`, `cupoSeccionError.js:51`, `haciendaService.js:74`) conservan su mensaje, y en producción el comportamiento es idéntico al anterior. Solo cambia que en desarrollo ya no se ven los mensajes internos de PostgreSQL.
2. **Personal EPI en la interfaz**: `GestionDocentes.jsx:661` muestra `rol_label` ("Equipo de Permanencia Estudiantil (EPI)"). Las acciones de sustitución y la columna de asignaciones solo aparecen con `nombre_rol === 'profesor'` (líneas 675, 717 y 728), así que una persona EPI ve "—" y solo puede editar o cambiar de estado. Los candidatos a sustituto se filtran por `profesor` (`personalService.js:314,347`), y en `Asignacion.jsx:56` también se filtra por profesor. El rol `epi` solo aparece en SQL en ROLES_PERSONAL (H1) y en `personaController.js:323`.
3. **Secciones**: si el nombre no tiene el sufijo `-N`, se usa `numero_seccion` como respaldo. `Math.max` evita repetir nombres cuando hay huecos y no cambia el orden de reutilización de secciones con cupo.
4. **Expulsión con 403**: el controlador (`orientacionController.js:77-84`) devuelve `{error}` con 403. `eliminarEstadoOrientacion` existe en `orientacionServices.jsx:40`, pero ningún componente lo llama, así que no afecta a la interfaz.
5. **fechaDiaAnterior**: el cálculo en UTC es correcto y lo usa solo `cancelarSustitucion` (`personalService.js:472`). `fechaHoyIso` sigue en hora del servidor, lo cual es anterior a los arreglos.
6. **Cookies**: con claves ASCII de 32 caracteres o más, los bytes son idénticos. Con claves no ASCII, la versión anterior producía más de 32 bytes y AES fallaba, por lo que no existían cookies válidas que pudieran romperse.
7. **Frontend global**:
   - `--ring`: el anillo de foco es oscuro sobre el fondo blanco de la página. El modo oscuro tiene su propio `--ring`, y el skip-link usa `outline-offset`.
   - `select.jsx`: ningún `<Select>` usa `readOnly`. Input y textarea conservan el estilo de solo lectura.
   - `AlertDialog`: la trampa de foco y la devolución del foco son correctas. `closeAlert` es estable y `onCloseRef` evita volver a ejecutar el efecto. ConfirmDialog va por separado y no se vio afectado.
   - `mainBar`: `max-lg:invisible` solo se aplica por debajo de `lg`, y la transición de `visibility` lo muestra en cuanto se abre.
   - `index.html`: `lang="es"` y el nuevo título no tienen efectos secundarios.
   - El rol EPI llega a `/epi/reportes` con `rutaInicioPorRol`, que usan Login y Cambio. Nadie navega a `/inicio` con un rol fijo.
8. **Contrato EPI**:
   - Semanal: `type=date`. Mensual: `${mes}-01`. Anual: `${anio}-01-01`, con años de un `<select>`. Todos cumplen `esFechaIsoValida` en Chrome y Edge, y los campos `required` del `<form>` impiden enviar vacíos.
   - Personalizado con más de 366 días o inicio mayor que fin: AppError 400 `{error}`, que se muestra en pantalla.
   - Para `anio` de estudiantes, si llega vacío el backend usa el año actual, y los 4 dígitos del selector son válidos.
   - Los ids salen de selects con ids numéricos. `id_estudiante` solo se envía si hay sección.
   - El PDF reutiliza los parámetros ya validados (`paramsReporte`).
   - Las rutas `/api/epi/*` y `/api/notificaciones` no chocan con otros routers, que tampoco tienen middleware a nivel de router.

## Riesgos de despliegue
- Ejecutar `database/34_bd_rol_epi.sql` antes del backend (H1) y confirmar que existe `jwt_revocado` (script 29) (H2).
- `ALTER TYPE ... ADD VALUE` no puede usarse en la misma transacción que lo consume. El script lo hace en un bloque DO aparte del trigger, así que es correcto.
