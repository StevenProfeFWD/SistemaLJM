import db from '../db/knex.js';

const TIPOS_VALIDOS = ['suspension', 'permiso_institucional', 'expulsion'];
const PRIORIDAD = { expulsion: 3, suspension: 2, permiso_institucional: 1 };

function fechaToStr(fecha) {
  if (!fecha) return null;
  if (typeof fecha === 'string') return fecha.slice(0, 10);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Estados activos para una lista de estudiantes en una fecha (YYYY-MM-DD).
 * @returns {Map<number, object>} id_estudiante → estadoEspecial
 */
export async function obtenerEstadosActivosPorEstudiantes(idsEstudiantes, fechaStr) {
  const map = new Map();
  if (!Array.isArray(idsEstudiantes) || idsEstudiantes.length === 0 || !fechaStr) {
    return map;
  }

  const ids = idsEstudiantes.map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n));
  if (ids.length === 0) return map;

  const rows = await db('estado_estudiante_periodo')
    .whereIn('id_persona_estudiante', ids)
    .where('fecha_inicio', '<=', fechaStr)
    .where(function vigenteEnFecha() {
      this.whereNull('fecha_fin').orWhere('fecha_fin', '>=', fechaStr);
    })
    .orderBy('fecha_inicio', 'desc');

  for (const row of rows) {
    const idEst = row.id_persona_estudiante;
    const actual = map.get(idEst);
    const prio = PRIORIDAD[row.tipo_estado] || 0;
    const prioActual = actual ? (PRIORIDAD[actual.tipo_estado] || 0) : 0;
    if (!actual || prio >= prioActual) {
      map.set(idEst, {
        tipo_estado: row.tipo_estado,
        id_estado_periodo: row.id_estado_periodo,
        motivo: row.motivo,
        fecha_inicio: fechaToStr(row.fecha_inicio),
        fecha_fin: fechaToStr(row.fecha_fin),
      });
    }
  }

  return map;
}

export function esEstadoBloqueante(tipoEstado) {
  return tipoEstado === 'suspension' || tipoEstado === 'expulsion';
}

export function estadoAsistenciaForzado(tipoEstado) {
  if (tipoEstado === 'suspension' || tipoEstado === 'expulsion') return 'justificado';
  if (tipoEstado === 'permiso_institucional') return 'justificado';
  return null;
}

/**
 * Indica si el estudiante tiene expulsión definitiva registrada (permanente).
 */
export async function estudianteTieneExpulsionDefinitiva(idEstudiante, dbOrTrx = db) {
  const id = parseInt(idEstudiante, 10);
  if (!Number.isInteger(id)) return false;

  const row = await dbOrTrx('estado_estudiante_periodo')
    .where({
      id_persona_estudiante: id,
      tipo_estado: 'expulsion',
    })
    .first();

  return Boolean(row);
}

/** Formato DD/MM/AAAA para mensajes al usuario. */
export function formatFechaEs(fecha) {
  const s = fechaToStr(fecha);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Busca una suspensión del mismo estudiante cuyo rango colisione con el solicitado.
 * No existe columna estado_registro: se consideran todas las suspensiones registradas
 * (incluye futuras y levantadas anticipadamente con fecha_fin acortada).
 */
export async function buscarSuspensionSolapada(
  idEstudiante,
  fechaInicio,
  fechaFin,
  excluirIdEstado = null,
  dbOrTrx = db
) {
  const idEst = parseInt(idEstudiante, 10);
  if (!Number.isInteger(idEst) || !fechaInicio || !fechaFin) return null;

  let q = dbOrTrx('estado_estudiante_periodo')
    .where('id_persona_estudiante', idEst)
    .where('tipo_estado', 'suspension')
    .where('fecha_inicio', '<=', fechaFin)
    .where('fecha_fin', '>=', fechaInicio);

  const excluir = excluirIdEstado != null ? parseInt(excluirIdEstado, 10) : null;
  if (Number.isInteger(excluir)) {
    q = q.whereNot('id_estado_periodo', excluir);
  }

  return q.orderBy('fecha_inicio', 'asc').first();
}

export function crearErrorSuspensionSolapada(colision) {
  const err = new Error(
    `El estudiante ya cuenta con una suspensión activa en el rango de fechas seleccionado (del ${formatFechaEs(colision.fecha_inicio)} al ${formatFechaEs(colision.fecha_fin)}).`
  );
  err.status = 409;
  return err;
}

export async function validarSuspensionSinSolapamiento(
  idEstudiante,
  fechaInicio,
  fechaFin,
  excluirIdEstado = null,
  dbOrTrx = db
) {
  const colision = await buscarSuspensionSolapada(
    idEstudiante,
    fechaInicio,
    fechaFin,
    excluirIdEstado,
    dbOrTrx
  );
  if (colision) {
    throw crearErrorSuspensionSolapada(colision);
  }
}

export { TIPOS_VALIDOS, fechaToStr };
