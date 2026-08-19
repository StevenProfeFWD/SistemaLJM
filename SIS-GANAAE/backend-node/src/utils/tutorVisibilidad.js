import db from '../db/knex.js';

/**
 * El tutor puede ver el expediente del estudiante si:
 * - Es el id_persona_tutor de la matrícula del curso lectivo vigente (año calendario), o
 * - Tiene cualquier vínculo histórico en encargado_estudiante (compatibilidad).
 */
export async function tutorTieneVisibilidadSobreEstudiante(tutorPersonaId, estudiantePersonaId) {
  const anio = new Date().getFullYear();

  const porMatriculaVigente = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .where({
      'm.id_persona_estudiante': estudiantePersonaId,
      'm.id_persona_tutor': tutorPersonaId,
      'cl.anio_curso_lectivo': anio,
    })
    .first();

  if (porMatriculaVigente) return true;

  const porEncargado = await db('encargado_estudiante')
    .where({
      id_persona_estudiante: estudiantePersonaId,
      id_persona_encargado: tutorPersonaId,
    })
    .first();

  return !!porEncargado;
}
