import {
  assertPadrePuedeVerEstudiante,
  consultarHistorialAsistenciaHijo,
} from './padresAsistenciaService.js';
import { listEstadosEspecialesHijo } from './padresEstadosService.js';

function inicioAnioLectivo() {
  return `${hoyIso().slice(0, 4)}-01-01`;
}

/** Fecha de hoy (AAAA-MM-DD) en hora de Costa Rica; toISOString() daba el día siguiente después de las 18:00. */
function hoyIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Inicio y fin de mes a partir de la fecha de Costa Rica (coherentes con hoyIso aunque el servidor corra en UTC).
function inicioMesActual() {
  return `${hoyIso().slice(0, 7)}-01`;
}

function finMesActual() {
  const [y, m] = hoyIso().split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

export async function obtenerDashboardHijo(padreId, idEstudiante) {
  const id = await assertPadrePuedeVerEstudiante(padreId, idEstudiante);

  const [anual, mensual, orientacion] = await Promise.all([
    consultarHistorialAsistenciaHijo(id, inicioAnioLectivo(), hoyIso()),
    consultarHistorialAsistenciaHijo(id, inicioMesActual(), finMesActual()),
    listEstadosEspecialesHijo(padreId, id),
  ]);

  const hoy = hoyIso();
  const estadosActivos = (orientacion.registros || []).filter((r) => {
    if (r.tipo_estado === 'expulsion') return true;
    if (!r.fecha_fin) return r.fecha_inicio <= hoy;
    return r.fecha_inicio <= hoy && r.fecha_fin >= hoy;
  });

  return {
    estudiante: anual.estudiante,
    anio_lectivo: anual.estudiante.anio_curso_lectivo || Number(hoyIso().slice(0, 4)),
    resumen_anual: anual.resumen,
    resumen_mes: mensual.resumen,
    rango_mes: mensual.rango,
    estados_orientacion: orientacion.registros || [],
    estados_activos: estadosActivos,
  };
}
