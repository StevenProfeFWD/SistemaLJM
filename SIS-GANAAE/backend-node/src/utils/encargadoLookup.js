import db from '../db/knex.js';

/** Dominios de datos semilla / precarga — no reciben notificaciones automáticas. */
const SUFIJOS_CORREO_NO_NOTIFICABLE = [
  '@pendiente.sistema.local',
  '@seed-historial.com',
  '@seed-historial.test',
];

/**
 * Correos de precarga / placeholder / semilla no deben recibir notificaciones automáticas.
 */
export function esCorreoNotificable(correo) {
  const c = String(correo || '').trim().toLowerCase();
  if (!c || !c.includes('@')) return false;
  if (c.startsWith('precarga.')) return false;
  if (SUFIJOS_CORREO_NO_NOTIFICABLE.some((sufijo) => c.endsWith(sufijo))) return false;
  return true;
}

/**
 * Obtiene el encargado legal con correo válido para notificar eventos de un estudiante.
 * @returns {Promise<{ id_persona: number, nombre_completo: string, correo: string, id_encargado_estudiante: number|null }|null>}
 */
export async function obtenerEncargadoParaNotificacion(idEstudiante) {
  const idEst = parseInt(idEstudiante, 10);
  if (!Number.isInteger(idEst)) return null;

  const anio = new Date().getFullYear();

  const matricula = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .where('m.id_persona_estudiante', idEst)
    .where('cl.anio_curso_lectivo', anio)
    .whereNotNull('m.id_persona_tutor')
    .orderBy('m.fecha_matricula', 'desc')
    .select('m.id_persona_tutor')
    .first();

  if (matricula?.id_persona_tutor) {
    const tutor = await db('persona')
      .where('id_persona', matricula.id_persona_tutor)
      .first();

    if (tutor && esCorreoNotificable(tutor.correo)) {
      const vinculo = await db('encargado_estudiante')
        .where({
          id_persona_estudiante: idEst,
          id_persona_encargado: tutor.id_persona,
        })
        .orderBy('fecha', 'desc')
        .first();

      return {
        id_persona: tutor.id_persona,
        nombre_completo: tutor.nombre_completo,
        correo: tutor.correo,
        id_encargado_estudiante: vinculo?.id_encargado_estudiante || null,
      };
    }
  }

  const enc = await db('encargado_estudiante as ee')
    .join('persona as p', 'ee.id_persona_encargado', 'p.id_persona')
    .where('ee.id_persona_estudiante', idEst)
    .orderBy('ee.fecha', 'desc')
    .select(
      'ee.id_encargado_estudiante',
      'p.id_persona',
      'p.nombre_completo',
      'p.correo'
    )
    .first();

  if (!enc || !esCorreoNotificable(enc.correo)) return null;

  return {
    id_persona: enc.id_persona,
    nombre_completo: enc.nombre_completo,
    correo: enc.correo,
    id_encargado_estudiante: enc.id_encargado_estudiante,
  };
}
