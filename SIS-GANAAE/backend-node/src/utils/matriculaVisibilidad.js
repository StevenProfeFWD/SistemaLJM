import db from '../db/knex.js';
import AppError from './AppError.js';
import { tutorTieneVisibilidadSobreEstudiante } from './tutorVisibilidad.js';
import { profesorEsGuiaDeEstudiante } from './profesorGuiaVisibilidad.js';
import { ROL_ORIENTADOR, ROL_PROFESOR } from './roles.js';

const ROLES_LECTURA_GLOBAL = new Set([
  'super_administrador',
  'administrador',
  ROL_ORIENTADOR,
]);

export function tieneLecturaGlobalMatricula(rol) {
  return ROLES_LECTURA_GLOBAL.has(rol);
}

function anioCalendarioActual() {
  return new Date().getFullYear();
}

/**
 * Docente ve matrícula del alumno si es guía de su sección o imparte en esa sección (año vigente).
 */
export async function profesorTieneVisibilidadMatriculaEstudiante(idProfesor, idEstudiante) {
  const idProf = parseInt(idProfesor, 10);
  const idEst = parseInt(idEstudiante, 10);
  if (!Number.isInteger(idProf) || !Number.isInteger(idEst)) return false;

  if (await profesorEsGuiaDeEstudiante(idProf, idEst)) {
    return true;
  }

  const anio = anioCalendarioActual();
  const porAsignacion = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .join('profesor_materia_seccion as pms', function joinPms() {
      this.on('pms.id_seccion', 'm.id_seccion').andOn('pms.curso_lectivo', 'm.id_curso_lectivo');
    })
    .where('m.id_persona_estudiante', idEst)
    .where('cl.anio_curso_lectivo', anio)
    .where('pms.id_persona_profesor', idProf)
    .first();

  return Boolean(porAsignacion);
}

export async function assertPuedeConsultarEstudianteMatricula(usuario, idEstudiante) {
  const idEst = parseInt(idEstudiante, 10);
  if (!usuario?.id || !Number.isInteger(idEst)) {
    throw new AppError('No autorizado para consultar esta matrícula', 403);
  }

  const rol = usuario.rol;

  if (tieneLecturaGlobalMatricula(rol)) {
    return;
  }

  if (rol === 'padre_de_familia') {
    const ok = await tutorTieneVisibilidadSobreEstudiante(usuario.id, idEst);
    if (!ok) {
      throw new AppError('No tiene permiso para consultar el expediente de este estudiante', 403);
    }
    return;
  }

  if (rol === ROL_PROFESOR) {
    const ok = await profesorTieneVisibilidadMatriculaEstudiante(usuario.id, idEst);
    if (!ok) {
      throw new AppError(
        'Solo puede consultar matrículas de alumnos de su grupo guía o de sus secciones asignadas',
        403
      );
    }
    return;
  }

  throw new AppError('No autorizado para consultar matrículas', 403);
}

export async function assertPuedeBuscarEstudiantePorCedula(usuario) {
  const rol = usuario?.rol;

  if (tieneLecturaGlobalMatricula(rol)) {
    return;
  }

  if (rol === ROL_PROFESOR) {
    throw new AppError('Los docentes no pueden realizar búsqueda global de estudiantes por cédula', 403);
  }

  if (rol === 'padre_de_familia') {
    return;
  }

  throw new AppError('No autorizado para buscar estudiantes por cédula', 403);
}

/** Tras resolver estudiante por cédula, el padre solo puede ver hijos vinculados. */
export async function assertPadrePuedeBuscarCedulaEstudiante(usuario, idEstudiante) {
  if (usuario?.rol !== 'padre_de_familia') return;

  const ok = await tutorTieneVisibilidadSobreEstudiante(usuario.id, idEstudiante);
  if (!ok) {
    throw new AppError('No tiene permiso para consultar el expediente de este estudiante', 403);
  }
}

export async function assertPuedeConsultarMatriculaPorId(usuario, idMatricula) {
  const idMat = parseInt(idMatricula, 10);
  if (!Number.isInteger(idMat)) {
    throw new AppError('Identificador de matrícula inválido', 400);
  }

  const fila = await db('matricula')
    .where({ id_matricula: idMat })
    .select('id_persona_estudiante')
    .first();

  if (!fila) {
    throw new AppError('Matrícula no encontrada', 404);
  }

  await assertPuedeConsultarEstudianteMatricula(usuario, fila.id_persona_estudiante);
}

export async function assertPuedeListarMatriculas(usuario) {
  const rol = usuario?.rol;
  if (
    tieneLecturaGlobalMatricula(rol) ||
    rol === 'padre_de_familia' ||
    rol === ROL_PROFESOR
  ) {
    return;
  }
  throw new AppError('No autorizado para listar matrículas', 403);
}
