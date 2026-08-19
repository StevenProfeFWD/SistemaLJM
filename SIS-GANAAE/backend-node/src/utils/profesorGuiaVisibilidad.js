import db from '../db/knex.js';

/**
 * El docente es profesor guía del estudiante si la matrícula vigente del año
 * calendario lo ubica en una sección con id_persona_profesor_guia = idProfesor.
 */
export async function profesorEsGuiaDeEstudiante(idProfesor, idEstudiante) {
  const idProf = parseInt(idProfesor, 10);
  const idEst = parseInt(idEstudiante, 10);
  if (!Number.isInteger(idProf) || !Number.isInteger(idEst)) return false;

  const anio = new Date().getFullYear();

  const vinculo = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .join('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('m.id_persona_estudiante', idEst)
    .where('cl.anio_curso_lectivo', anio)
    .where('s.id_persona_profesor_guia', idProf)
    .first();

  return Boolean(vinculo);
}

/**
 * IDs de estudiantes visibles para un docente en el año lectivo vigente:
 * grupo guía o sección/materia asignada en profesor_materia_seccion.
 */
export async function obtenerIdsEstudiantesVisiblesParaProfesor(idProfesor) {
  const idProf = parseInt(idProfesor, 10);
  if (!Number.isInteger(idProf)) return [];

  const anio = new Date().getFullYear();

  const porGuia = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .join('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('cl.anio_curso_lectivo', anio)
    .where('s.id_persona_profesor_guia', idProf)
    .pluck('m.id_persona_estudiante');

  const porClase = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .join('profesor_materia_seccion as pms', function joinPms() {
      this.on('pms.id_seccion', 'm.id_seccion').andOn('pms.curso_lectivo', 'm.id_curso_lectivo');
    })
    .where('cl.anio_curso_lectivo', anio)
    .where('pms.id_persona_profesor', idProf)
    .pluck('m.id_persona_estudiante');

  return [...new Set([...porGuia, ...porClase])];
}
