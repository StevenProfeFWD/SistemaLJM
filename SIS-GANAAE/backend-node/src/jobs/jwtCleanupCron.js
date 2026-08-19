import { limpiarRevocadosExpirados } from '../services/tokenRevocationService.js';

const HORA_LOCAL = parseInt(process.env.JWT_CLEANUP_HOUR || '3', 10);
const MS_DIA = 24 * 60 * 60 * 1000;

let timeoutId = null;
let intervalId = null;

/**
 * Milisegundos hasta la próxima ejecución a la hora local configurada (por defecto 03:00).
 */
function msHastaProximaEjecucion(hora = HORA_LOCAL) {
  const h = Number.isFinite(hora) && hora >= 0 && hora <= 23 ? hora : 3;
  const ahora = new Date();
  const next = new Date(ahora);
  next.setHours(h, 0, 0, 0);
  if (next.getTime() <= ahora.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - ahora.getTime();
}

async function ejecutarLimpiezaProgramada() {
  try {
    const eliminados = await limpiarRevocadosExpirados({ force: true });
    console.log(
      `[Cron] Limpieza de tokens expirados completada. Registros eliminados: ${eliminados}`
    );
  } catch (err) {
    console.error('[Cron] Error en limpieza de tokens expirados:', err.message);
  }
}

/**
 * Arranca la tarea diaria de limpieza de jwt_revocado.
 * No bloquea el listen() del servidor ni los healthchecks.
 */
export function iniciarLimpiezaJwtCron() {
  if (timeoutId || intervalId) return;

  const h = Number.isFinite(HORA_LOCAL) && HORA_LOCAL >= 0 && HORA_LOCAL <= 23 ? HORA_LOCAL : 3;
  const delayMs = msHastaProximaEjecucion(h);
  const enMin = Math.round(delayMs / 60000);

  console.log(
    `[Cron] Limpieza de jwt_revocado programada diariamente a las ${String(h).padStart(2, '0')}:00 (próxima en ~${enMin} min)`
  );

  timeoutId = setTimeout(async () => {
    timeoutId = null;
    await ejecutarLimpiezaProgramada();
    intervalId = setInterval(ejecutarLimpiezaProgramada, MS_DIA);
    if (typeof intervalId.unref === 'function') intervalId.unref();
  }, delayMs);

  if (typeof timeoutId.unref === 'function') timeoutId.unref();
}

export function detenerLimpiezaJwtCron() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
