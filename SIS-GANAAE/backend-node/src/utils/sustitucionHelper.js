import db from '../db/knex.js';

export function fechaHoyIso() {
  const h = new Date();
  const m = String(h.getMonth() + 1).padStart(2, '0');
  const d = String(h.getDate()).padStart(2, '0');
  return `${h.getFullYear()}-${m}-${d}`;
}

/** Resta un día a una fecha ISO YYYY-MM-DD. */
export function fechaDiaAnterior(iso) {
  const base = fechaAIsoDia(iso);
  if (!base) return '';
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Normaliza fechas de PostgreSQL/Date a YYYY-MM-DD (evita "Tue Jun 30" con String(date).slice). */
export function fechaAIsoDia(valor) {
  if (valor == null || valor === '') return '';
  const s = String(valor);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

/**
 * Indica si un docente puede operar una asignación (titular o sustituto vigente).
 */
export async function profesorPuedeAccederAsignacion(idProfesor, idProfesorMateriaSeccion, fechaRef = null) {
  const idPms = parseInt(idProfesorMateriaSeccion, 10);
  const idProf = parseInt(idProfesor, 10);
  if (!Number.isInteger(idPms) || !Number.isInteger(idProf)) return false;

  const asignacion = await db('profesor_materia_seccion')
    .where('id_profesor_materia_seccion', idPms)
    .first();

  if (!asignacion) return false;
  if (asignacion.id_persona_profesor === idProf) return true;

  const fecha = fechaRef || fechaHoyIso();
  const sust = await db('sustitucion')
    .where({
      id_profesor_materia_seccion: idPms,
      id_persona_sustituto: idProf,
    })
    .where('fecha_desde', '<=', fecha)
    .where('fecha_hasta', '>=', fecha)
    .first();

  return Boolean(sust);
}

export function aplicarFiltroAsignacionesProfesor(query, idProfesor, fechaRef) {
  const fecha = fechaRef || fechaHoyIso();
  return query.andWhere(function filtroTitularOSustituto() {
    this.where('pms.id_persona_profesor', idProfesor).orWhereExists(function sustitutoVigente() {
      this.select(db.raw('1'))
        .from('sustitucion as s')
        .whereRaw('s.id_profesor_materia_seccion = pms.id_profesor_materia_seccion')
        .where('s.id_persona_sustituto', idProfesor)
        .where('s.fecha_desde', '<=', fecha)
        .where('s.fecha_hasta', '>=', fecha);
    });
  });
}
