import db from '../db/knex.js';
import { obtenerOAsignarSeccion, MAX_ESTUDIANTES_POR_SECCION } from '../utils/seccionHelper.js';
import AppError from '../utils/AppError.js';
import { handleMatriculaWriteError } from '../utils/cupoSeccionError.js';
import * as haciendaService from './haciendaService.js';
import {
  parseCsvText,
  extractPrecargaRow,
  parseFechaNacimiento,
  nombreSeccionToAnoACursar,
} from '../utils/csvPrecarga.js';
import { tutorTieneVisibilidadSobreEstudiante } from '../utils/tutorVisibilidad.js';
import { obtenerIdsEstudiantesVisiblesParaProfesor } from '../utils/profesorGuiaVisibilidad.js';
import {
  profesorTieneVisibilidadMatriculaEstudiante,
  tieneLecturaGlobalMatricula,
} from '../utils/matriculaVisibilidad.js';
import { ROL_PROFESOR } from '../utils/roles.js';
import { estudianteTieneExpulsionDefinitiva } from '../utils/estadoEstudiantePeriodo.js';
import {
  getCursosLectivosCatalog,
  getSeccionMapByNombre,
  invalidateCursosLectivosCache,
} from './catalogCacheService.js';

export const HORARIO_REFERENCIA = 'Lunes a Viernes 7:00 am a 5:40 pm';

const MSG_ESTUDIANTE_EXPULSADO =
  'Estudiante expulsado de forma definitiva. No se permiten procesos académicos ni de matrícula para este usuario.';

async function assertEstudianteNoExpulsado(idEstudiante, trx = db) {
  const expulsado = await estudianteTieneExpulsionDefinitiva(idEstudiante, trx);
  if (expulsado) {
    throwLegacy(403, MSG_ESTUDIANTE_EXPULSADO);
  }
}

const ANOS_PERMITIDOS = ['septimo', 'octavo', 'noveno', 'decimo', 'undecimo'];

function throwLegacy(statusCode, bodyErrorMessage) {
  throw new AppError(bodyErrorMessage, statusCode, {
    legacyJson: { error: bodyErrorMessage },
  });
}

/** Datos del encargado con trim; valida campos obligatorios al crear vínculo sin encargado_id. */
function parseEncargadoParaCrear(body) {
  const nombreCompletoEncargado = String(body.nombre_completo_encargado || '').trim();
  const cedulaEncargado = String(body.cedula_encargado || '').trim();
  const correoEncargado = String(body.correo_encargado || '').trim();
  const telefonoEncargado = String(body.telefono_encargado || '').trim();
  const direccionEncargado = String(body.direccion_encargado || '').trim();
  const fechaNacimientoEncargado = String(body.fecha_nacimiento_encargado || '').trim();

  if (
    !nombreCompletoEncargado ||
    !cedulaEncargado ||
    !correoEncargado ||
    !telefonoEncargado ||
    !direccionEncargado ||
    !fechaNacimientoEncargado
  ) {
    throwLegacy(
      400,
      'Todos los datos del encargado son obligatorios: identificación, nombre completo, correo, teléfono, dirección y fecha de nacimiento'
    );
  }

  return {
    nombreCompletoEncargado,
    cedulaEncargado,
    correoEncargado,
    telefonoEncargado,
    direccionEncargado,
    fechaNacimientoEncargado,
  };
}

function assertPatriaPotestad(patria_potestad) {
  const ok = patria_potestad === 'true' || patria_potestad === true;
  if (!ok) {
    throwLegacy(400, 'Debe confirmar patria potestad');
  }
}

/** id de persona encargado ya existente (evita duplicar filas en persona). */
function getEncargadoIdFromBody(body) {
  const raw = body.encargado_id ?? body.id_persona_encargado ?? body.id_persona_tutor;
  if (raw == null || raw === '') return null;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id) || id < 1) {
    throwLegacy(400, 'Identificador de encargado inválido');
  }
  return id;
}

async function resolverEncargadoNuevoIngresoOTraslado(trx, body) {
  const idFromBody = getEncargadoIdFromBody(body);
  if (idFromBody) {
    const existe = await trx('persona').where({ id_persona: idFromBody }).first();
    if (!existe) {
      throwLegacy(404, 'El encargado indicado no existe en el sistema');
    }
    const actualizar =
      body.actualizar_datos_encargado === true || body.actualizar_datos_encargado === 'true';
    if (actualizar) {
      const enc = parseEncargadoParaCrear(body);
      await trx('persona').where({ id_persona: idFromBody }).update({
        nombre_completo: enc.nombreCompletoEncargado,
        correo: enc.correoEncargado,
        telefono: enc.telefonoEncargado,
        direccion: enc.direccionEncargado,
        fecha_nacimiento: enc.fechaNacimientoEncargado,
      });
    }
    return idFromBody;
  }

  const enc = parseEncargadoParaCrear(body);
  const encargadoExistente = await trx('persona').where({ cedula: enc.cedulaEncargado }).first();
  if (encargadoExistente) {
    return encargadoExistente.id_persona;
  }
  const [encargadoInsertado] = await trx('persona')
    .insert({
      nombre_completo: enc.nombreCompletoEncargado,
      cedula: enc.cedulaEncargado,
      correo: enc.correoEncargado,
      telefono: enc.telefonoEncargado,
      direccion: enc.direccionEncargado,
      fecha_nacimiento: enc.fechaNacimientoEncargado,
      nombre_rol: 'padre_de_familia',
    })
    .returning('id_persona');
  return encargadoInsertado.id_persona;
}

async function obtenerCursoLectivoActual(trx) {
  const anioActual = new Date().getFullYear();

  let cursoLectivo = await trx('curso_lectivo')
    .where({ anio_curso_lectivo: anioActual })
    .first();

  if (!cursoLectivo) {
    const [cursoCreado] = await trx('curso_lectivo')
      .insert({ anio_curso_lectivo: anioActual })
      .returning('id_curso_lectivo');

    cursoLectivo = cursoCreado;
    invalidateCursosLectivosCache();
  }

  return cursoLectivo.id_curso_lectivo;
}

export async function listMatriculas() {
  return db('matricula')
    .select(
      'matricula.*',
      'persona.nombre_completo as nombre_estudiante',
      'curso_lectivo.anio_curso_lectivo'
    )
    .leftJoin('persona', 'matricula.id_persona_estudiante', 'persona.id_persona')
    .leftJoin('curso_lectivo', 'matricula.id_curso_lectivo', 'curso_lectivo.id_curso_lectivo')
    .orderBy('matricula.fecha_matricula', 'desc');
}

/** Matrículas de estudiantes vinculados al encargado (padre_de_familia). */
export async function listMatriculasPorEncargado(idEncargado) {
  const idsEstudiantes = await db('encargado_estudiante')
    .where('id_persona_encargado', idEncargado)
    .distinct('id_persona_estudiante')
    .pluck('id_persona_estudiante');

  if (!idsEstudiantes.length) return [];

  return db('matricula')
    .whereIn('matricula.id_persona_estudiante', idsEstudiantes)
    .select(
      'matricula.*',
      'persona.nombre_completo as nombre_estudiante',
      'curso_lectivo.anio_curso_lectivo'
    )
    .leftJoin('persona', 'matricula.id_persona_estudiante', 'persona.id_persona')
    .leftJoin('curso_lectivo', 'matricula.id_curso_lectivo', 'curso_lectivo.id_curso_lectivo')
    .orderBy('matricula.fecha_matricula', 'desc');
}

/** Matrículas visibles al docente (grupo guía + secciones donde imparte). */
export async function listMatriculasPorProfesor(idProfesor) {
  const idsEstudiantes = await obtenerIdsEstudiantesVisiblesParaProfesor(idProfesor);
  if (!idsEstudiantes.length) return [];

  return db('matricula')
    .whereIn('matricula.id_persona_estudiante', idsEstudiantes)
    .select(
      'matricula.*',
      'persona.nombre_completo as nombre_estudiante',
      'curso_lectivo.anio_curso_lectivo'
    )
    .leftJoin('persona', 'matricula.id_persona_estudiante', 'persona.id_persona')
    .leftJoin('curso_lectivo', 'matricula.id_curso_lectivo', 'curso_lectivo.id_curso_lectivo')
    .orderBy('matricula.fecha_matricula', 'desc');
}

export async function getMatriculaById(id) {
  return db('matricula').where({ id_matricula: id }).first();
}

export async function listMatriculasPorEstudiante(idEstudiante) {
  return db('matricula')
    .where({ id_persona_estudiante: idEstudiante })
    .leftJoin('curso_lectivo', 'matricula.id_curso_lectivo', 'curso_lectivo.id_curso_lectivo')
    .select('matricula.*', 'curso_lectivo.anio_curso_lectivo')
    .orderBy('curso_lectivo.anio_curso_lectivo', 'desc');
}

export async function buscarEstudiantePorCedula(rawCedula) {
  const cedulaNorm = haciendaService.normalizarIdentificacion(rawCedula);
  const cedulaTrim = String(rawCedula || '').trim();
  const estudiante = await db('persona')
    .where((qb) => {
      qb.where('cedula', cedulaNorm).orWhere('cedula', cedulaTrim);
    })
    .first();

  if (!estudiante) {
    throwLegacy(404, 'Estudiante no encontrado con esa cédula/DIMEX');
  }

  const expulsadoDefinitivo = await estudianteTieneExpulsionDefinitiva(estudiante.id_persona);

  const matriculasAnteriores = await db('matricula')
    .where({ id_persona_estudiante: estudiante.id_persona })
    .leftJoin('curso_lectivo', 'matricula.id_curso_lectivo', 'curso_lectivo.id_curso_lectivo')
    .select('matricula.*', 'curso_lectivo.anio_curso_lectivo')
    .orderBy('curso_lectivo.anio_curso_lectivo', 'desc');

  const ultimaMatricula = await db('matricula as m')
    .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('persona as tut', 'm.id_persona_tutor', 'tut.id_persona')
    .where('m.id_persona_estudiante', estudiante.id_persona)
    .orderBy('cl.anio_curso_lectivo', 'desc')
    .orderBy('m.fecha_matricula', 'desc')
    .select(
      'm.id_matricula',
      'm.id_persona_tutor',
      'cl.anio_curso_lectivo',
      'tut.id_persona as tutor_id_persona',
      'tut.nombre_completo as tutor_nombre_completo',
      'tut.cedula as tutor_cedula',
      'tut.correo as tutor_correo',
      'tut.telefono as tutor_telefono',
      'tut.direccion as tutor_direccion',
      'tut.fecha_nacimiento as tutor_fecha_nacimiento'
    )
    .first();

  let tutorUltimoPeriodo = null;
  if (ultimaMatricula?.tutor_id_persona) {
    tutorUltimoPeriodo = {
      id_persona: ultimaMatricula.tutor_id_persona,
      nombre_completo: ultimaMatricula.tutor_nombre_completo,
      cedula: ultimaMatricula.tutor_cedula,
      correo: ultimaMatricula.tutor_correo,
      telefono: ultimaMatricula.tutor_telefono,
      direccion: ultimaMatricula.tutor_direccion,
      fecha_nacimiento: ultimaMatricula.tutor_fecha_nacimiento,
      id_matricula_referencia: ultimaMatricula.id_matricula,
      anio_curso_lectivo: ultimaMatricula.anio_curso_lectivo,
    };
  } else {
    const enc = await db('encargado_estudiante as ee')
      .leftJoin('persona as t', 'ee.id_persona_encargado', 't.id_persona')
      .where('ee.id_persona_estudiante', estudiante.id_persona)
      .orderBy('ee.fecha', 'desc')
      .select(
        't.id_persona',
        't.nombre_completo',
        't.cedula',
        't.correo',
        't.telefono',
        't.direccion',
        't.fecha_nacimiento'
      )
      .first();
    if (enc?.id_persona) {
      tutorUltimoPeriodo = {
        id_persona: enc.id_persona,
        nombre_completo: enc.nombre_completo,
        cedula: enc.cedula,
        correo: enc.correo,
        telefono: enc.telefono,
        direccion: enc.direccion,
        fecha_nacimiento: enc.fecha_nacimiento,
        id_matricula_referencia: null,
        anio_curso_lectivo: null,
      };
    }
  }

  const matriculaPendienteRow = await db('matricula as m')
    .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('m.id_persona_estudiante', estudiante.id_persona)
    .where('m.estado', 'pendiente')
    .whereNotExists(function notExistsActivaMismoCurso() {
      this.from('matricula as m2')
        .whereColumn('m2.id_persona_estudiante', 'm.id_persona_estudiante')
        .whereColumn('m2.id_curso_lectivo', 'm.id_curso_lectivo')
        .where('m2.estado', 'activa')
        .select(db.raw('1'));
    })
    .orderBy('cl.anio_curso_lectivo', 'desc')
    .select(
      'm.id_matricula',
      'm.id_curso_lectivo',
      'm.ano_a_cursar',
      'cl.anio_curso_lectivo',
      's.nombre_seccion'
    )
    .first();

  const matriculaPendiente = matriculaPendienteRow
    ? {
        id_matricula: matriculaPendienteRow.id_matricula,
        id_curso_lectivo: matriculaPendienteRow.id_curso_lectivo,
        anio_curso_lectivo: matriculaPendienteRow.anio_curso_lectivo,
        ano_a_cursar: matriculaPendienteRow.ano_a_cursar,
        nombre_seccion: matriculaPendienteRow.nombre_seccion,
      }
    : null;

  return {
    ...estudiante,
    expulsado_definitivo: expulsadoDefinitivo,
    matriculas_anteriores: matriculasAnteriores,
    tutor_ultimo_periodo: tutorUltimoPeriodo,
    matricula_pendiente: matriculaPendiente,
    puede_completar_matricula_pendiente: Boolean(matriculaPendiente),
  };
}

/**
 * Búsqueda inteligente de tutor para matrícula regular: persona local o sugerencia Hacienda.
 */
export async function buscarEncargadoPorCedulaParaMatricula(rawCedula) {
  const cedulaNorm = haciendaService.normalizarIdentificacion(rawCedula);
  if (!cedulaNorm || cedulaNorm.length < 5) {
    throwLegacy(400, 'Identificación del tutor no válida');
  }

  const cedulaTrim = String(rawCedula || '').trim();
  const persona = await db('persona')
    .where((qb) => {
      qb.where('cedula', cedulaNorm).orWhere('cedula', cedulaTrim);
    })
    .first();
  if (persona) {
    return {
      fuente: 'registro_local',
      persona: {
        id_persona: persona.id_persona,
        nombre_completo: persona.nombre_completo,
        cedula: persona.cedula,
        correo: persona.correo,
        telefono: persona.telefono,
        direccion: persona.direccion,
        fecha_nacimiento: persona.fecha_nacimiento,
      },
    };
  }

  const h = await haciendaService.consultarIdentificacion(rawCedula);
  if (h.encontrado && h.nombreCompleto) {
    return {
      fuente: 'hacienda',
      identificacion: h.identificacion,
      nombreCompleto: h.nombreCompleto,
      debeCompletarRegistro: true,
    };
  }

  return {
    fuente: 'no_encontrado',
    mensaje: h.mensaje || 'No se encontraron datos para esa identificación',
  };
}

export async function crearNuevoIngreso(body) {
  const {
    estudiante_id,
    nombre_completo,
    cedula,
    correo,
    telefono,
    direccion,
    fecha_nacimiento,
    ano_a_cursar,
    viene_de_otro_colegio,
    colegio_anterior,
    patria_potestad,
  } = body;

  const nombreCompletoEstudiante = String(nombre_completo || '').trim();

  if (!ano_a_cursar) {
    throwLegacy(400, 'El año a cursar es obligatorio');
  }
  if (!ANOS_PERMITIDOS.includes(ano_a_cursar)) {
    throwLegacy(400, 'Año a cursar no válido');
  }

  const trx = await db.transaction();

  try {
    let idPersonaEstudiante = estudiante_id;

    if (!idPersonaEstudiante) {
      if (!nombreCompletoEstudiante || !cedula || !correo || !telefono || !direccion || !fecha_nacimiento) {
        await trx.rollback();
        throwLegacy(400, 'Todos los datos del estudiante son obligatorios');
      }

      const personaExistente = await trx('persona').where({ cedula }).first();
      if (personaExistente) {
        await trx.rollback();
        throwLegacy(409, 'La cédula/DIMEX ya está registrada');
      }

      const [personaInsertada] = await trx('persona')
        .insert({
          nombre_completo: nombreCompletoEstudiante,
          cedula,
          correo,
          telefono,
          direccion,
          fecha_nacimiento,
          nombre_rol: 'estudiante',
        })
        .returning('id_persona');

      idPersonaEstudiante = personaInsertada.id_persona;
    } else {
      await assertEstudianteNoExpulsado(idPersonaEstudiante, trx);
    }

    const idEncargado = await resolverEncargadoNuevoIngresoOTraslado(trx, body);

    assertPatriaPotestad(patria_potestad);

    await trx('encargado_estudiante').insert({
      id_persona_estudiante: idPersonaEstudiante,
      id_persona_encargado: idEncargado,
      fecha: new Date(),
      patria_potestad: patria_potestad === 'true' || patria_potestad === true,
    });

    const idCursoLectivo = await obtenerCursoLectivoActual(trx);
    const idSeccion = await obtenerOAsignarSeccion(trx, idCursoLectivo, ano_a_cursar);

    const [matriculaInsertada] = await trx('matricula')
      .insert({
        id_curso_lectivo: idCursoLectivo,
        fecha_matricula: new Date(),
        estado: 'activa',
        id_persona_estudiante: idPersonaEstudiante,
        id_persona_tutor: idEncargado,
        ano_a_cursar: ano_a_cursar,
        horario: HORARIO_REFERENCIA,
        tipo_matricula: 'nuevo_ingreso',
        viene_de_otro_colegio: viene_de_otro_colegio === 'true' || viene_de_otro_colegio === true,
        colegio_anterior: colegio_anterior || null,
        id_seccion: idSeccion,
        id_materia: null,
      })
      .returning('id_matricula');

    const idMatricula = matriculaInsertada.id_matricula;

    await trx.commit();

    return {
      message: 'Matrícula de nuevo ingreso creada exitosamente',
      id_matricula: idMatricula,
    };
  } catch (error) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    handleMatriculaWriteError(error, 'Error al crear la matrícula');
  }
}

/**
 * Matrícula regular: id_persona_tutor obligatorio (heredado, persona existente o alta nueva en la misma transacción).
 * No duplica encargado_estudiante si el vínculo ya existe con el mismo tutor.
 */
export async function crearMatriculaRegular(body) {
  const {
    id_persona_estudiante,
    ano_a_cursar,
    mismo_tutor,
    id_persona_tutor,
    patria_potestad,
  } = body;

  const idEst = parseInt(id_persona_estudiante, 10);
  if (!idEst || !ano_a_cursar) {
    throwLegacy(400, 'El estudiante y el año a cursar son obligatorios');
  }
  if (!ANOS_PERMITIDOS.includes(ano_a_cursar)) {
    throwLegacy(400, 'Año a cursar no válido');
  }

  const mismoTutorBool = mismo_tutor === true || mismo_tutor === 'true';

  let idTutor =
    id_persona_tutor != null && id_persona_tutor !== ''
      ? parseInt(id_persona_tutor, 10)
      : null;

  const estudiante = await db('persona').where({ id_persona: idEst }).first();
  if (!estudiante) {
    throwLegacy(404, 'Estudiante no encontrado');
  }

  const trx = await db.transaction();

  try {
    await assertEstudianteNoExpulsado(idEst, trx);

    if (mismoTutorBool) {
      if (!idTutor) {
        await trx.rollback();
        throwLegacy(400, 'Debe indicar el tutor del periodo anterior (id_persona_tutor)');
      }
    } else {
      assertPatriaPotestad(patria_potestad);
      if (!idTutor) {
        const enc = parseEncargadoParaCrear(body);
        const existente = await trx('persona').where({ cedula: enc.cedulaEncargado }).first();
        if (existente) {
          idTutor = existente.id_persona;
        } else {
          const [nuevo] = await trx('persona')
            .insert({
              nombre_completo: enc.nombreCompletoEncargado,
              cedula: enc.cedulaEncargado,
              correo: enc.correoEncargado,
              telefono: enc.telefonoEncargado,
              direccion: enc.direccionEncargado,
              fecha_nacimiento: enc.fechaNacimientoEncargado,
              nombre_rol: 'padre_de_familia',
            })
            .returning('id_persona');
          idTutor = nuevo.id_persona;
        }
      }
    }

    const tutorRow = await trx('persona').where({ id_persona: idTutor }).first();
    if (!tutorRow) {
      await trx.rollback();
      throwLegacy(404, 'Tutor no encontrado');
    }

    const idCursoBody =
      body.id_curso_lectivo != null && body.id_curso_lectivo !== ''
        ? parseInt(body.id_curso_lectivo, 10)
        : body.id_ciclo_lectivo != null && body.id_ciclo_lectivo !== ''
          ? parseInt(body.id_ciclo_lectivo, 10)
          : null;

    const idCursoLectivo =
      idCursoBody && !Number.isNaN(idCursoBody) && idCursoBody > 0
        ? idCursoBody
        : await obtenerCursoLectivoActual(trx);

    const cursoExiste = await trx('curso_lectivo').where({ id_curso_lectivo: idCursoLectivo }).first();
    if (!cursoExiste) {
      await trx.rollback();
      throwLegacy(404, 'Curso lectivo no encontrado');
    }

    const matriculaExistente = await trx('matricula')
      .where({
        id_persona_estudiante: idEst,
        id_curso_lectivo: idCursoLectivo,
      })
      .first();

    if (matriculaExistente && matriculaExistente.estado !== 'pendiente') {
      await trx.rollback();
      throwLegacy(409, 'El estudiante ya tiene una matrícula para este curso lectivo');
    }

    const esCompletarPendiente = matriculaExistente && matriculaExistente.estado === 'pendiente';

    let idSeccion = null;
    if (!esCompletarPendiente) {
      idSeccion = await obtenerOAsignarSeccion(trx, idCursoLectivo, ano_a_cursar);
    }

    if (!mismoTutorBool) {
      const ultimoEnc = await trx('encargado_estudiante')
        .where({ id_persona_estudiante: idEst })
        .orderBy('fecha', 'desc')
        .first();
      const yaVinculado =
        ultimoEnc && parseInt(ultimoEnc.id_persona_encargado, 10) === idTutor;
      if (!yaVinculado) {
        await trx('encargado_estudiante').insert({
          id_persona_estudiante: idEst,
          id_persona_encargado: idTutor,
          fecha: new Date(),
          patria_potestad: patria_potestad === true || patria_potestad === 'true',
        });
      }
    }

    if (esCompletarPendiente) {
      await trx('matricula')
        .where({ id_matricula: matriculaExistente.id_matricula })
        .update({
          id_persona_tutor: idTutor,
          estado: 'activa',
          fecha_ratificacion: new Date(),
          horario: HORARIO_REFERENCIA,
          tipo_matricula: 'regular',
        });

      await trx.commit();

      return {
        message: 'Matrícula pendiente completada correctamente',
        id_matricula: matriculaExistente.id_matricula,
      };
    }

    const [matriculaInsertada] = await trx('matricula')
      .insert({
        id_curso_lectivo: idCursoLectivo,
        fecha_matricula: new Date(),
        fecha_ratificacion: new Date(),
        estado: 'activa',
        id_persona_estudiante: idEst,
        id_persona_tutor: idTutor,
        ano_a_cursar: ano_a_cursar,
        horario: HORARIO_REFERENCIA,
        tipo_matricula: 'regular',
        id_seccion: idSeccion,
        id_materia: null,
      })
      .returning('id_matricula');

    const idMatricula = matriculaInsertada.id_matricula;

    await trx.commit();

    return {
      message: 'Matrícula regular (ratificación) creada exitosamente',
      id_matricula: idMatricula,
    };
  } catch (error) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    handleMatriculaWriteError(error, 'Error al crear la matrícula');
  }
}

export async function crearMatriculaTraslado(body) {
  const {
    estudiante_id,
    nombre_completo,
    cedula,
    correo,
    telefono,
    direccion,
    fecha_nacimiento,
    ano_a_cursar,
    colegio_anterior,
    patria_potestad,
  } = body;

  const nombreCompletoEstudiante = String(nombre_completo || '').trim();
  const colegioAnteriorTrim = String(colegio_anterior || '').trim();

  if (!ano_a_cursar || !colegioAnteriorTrim) {
    throwLegacy(400, 'El año a cursar y el colegio anterior son obligatorios');
  }
  if (!ANOS_PERMITIDOS.includes(ano_a_cursar)) {
    throwLegacy(400, 'Año a cursar no válido');
  }

  const trx = await db.transaction();

  try {
    let idPersonaEstudiante = estudiante_id;

    if (!idPersonaEstudiante) {
      if (!nombreCompletoEstudiante || !cedula || !correo || !telefono || !direccion || !fecha_nacimiento) {
        await trx.rollback();
        throwLegacy(400, 'Todos los datos del estudiante son obligatorios');
      }

      const personaExistente = await trx('persona').where({ cedula }).first();
      if (personaExistente) {
        await trx.rollback();
        throwLegacy(409, 'La cédula/DIMEX ya está registrada');
      }

      const [personaInsertada] = await trx('persona')
        .insert({
          nombre_completo: nombreCompletoEstudiante,
          cedula,
          correo,
          telefono,
          direccion,
          fecha_nacimiento,
          nombre_rol: 'estudiante',
        })
        .returning('id_persona');

      idPersonaEstudiante = personaInsertada.id_persona;
    } else {
      await assertEstudianteNoExpulsado(idPersonaEstudiante, trx);
    }

    const idEncargado = await resolverEncargadoNuevoIngresoOTraslado(trx, body);

    assertPatriaPotestad(patria_potestad);

    await trx('encargado_estudiante').insert({
      id_persona_estudiante: idPersonaEstudiante,
      id_persona_encargado: idEncargado,
      fecha: new Date(),
      patria_potestad: patria_potestad === 'true' || patria_potestad === true,
    });

    const idCursoLectivo = await obtenerCursoLectivoActual(trx);
    const idSeccion = await obtenerOAsignarSeccion(trx, idCursoLectivo, ano_a_cursar);

    const [matriculaInsertada] = await trx('matricula')
      .insert({
        id_curso_lectivo: idCursoLectivo,
        fecha_matricula: new Date(),
        estado: 'activa',
        id_persona_estudiante: idPersonaEstudiante,
        id_persona_tutor: idEncargado,
        ano_a_cursar: ano_a_cursar,
        horario: HORARIO_REFERENCIA,
        tipo_matricula: 'traslado',
        viene_de_otro_colegio: true,
        colegio_anterior: colegioAnteriorTrim,
        id_seccion: idSeccion,
        id_materia: null,
      })
      .returning('id_matricula');

    const idMatricula = matriculaInsertada.id_matricula;

    await trx.commit();

    return {
      message: 'Matrícula por traslado creada exitosamente',
      id_matricula: idMatricula,
    };
  } catch (error) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    handleMatriculaWriteError(error, 'Error al crear la matrícula');
  }
}

export async function updateEstadoMatricula(idMatricula, estado) {
  const estadosValidos = ['pendiente', 'activa', 'cancelada', 'graduado'];
  if (!estadosValidos.includes(estado)) {
    throwLegacy(400, 'Estado no válido');
  }

  const matricula = await db('matricula').where({ id_matricula: idMatricula }).first();
  if (!matricula) {
    throwLegacy(404, 'Matrícula no encontrada');
  }

  if (estado === 'activa') {
    await assertEstudianteNoExpulsado(matricula.id_persona_estudiante);
  }

  try {
    const actualizado = await db('matricula').where({ id_matricula: idMatricula }).update({ estado });

    if (actualizado === 0) {
      throwLegacy(404, 'Matrícula no encontrada');
    }

    return { message: 'Estado de matrícula actualizado exitosamente' };
  } catch (error) {
    handleMatriculaWriteError(error, 'Error al actualizar el estado de la matrícula');
  }
}

/**
 * Carga datos para comprobante PDF y valida permisos del usuario autenticado.
 * @param {string|number} idMatricula
 * @param {{ id: number, rol: string }} user - req.user del JWT
 */
export async function getDatosComprobanteMatricula(idMatricula, user) {
  const row = await db('matricula as m')
    .leftJoin('persona as p', 'm.id_persona_estudiante', 'p.id_persona')
    .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .leftJoin('persona as tut', 'm.id_persona_tutor', 'tut.id_persona')
    .select(
      'm.id_matricula',
      'm.fecha_matricula',
      'm.estado',
      'm.ano_a_cursar',
      'p.id_persona as id_estudiante',
      'p.nombre_completo',
      'p.cedula',
      'cl.anio_curso_lectivo',
      's.nombre_seccion',
      'tut.id_persona as tutor_row_id',
      'tut.nombre_completo as tutor_row_nombre',
      'tut.cedula as tutor_row_cedula',
      'tut.telefono as tutor_row_telefono'
    )
    .where('m.id_matricula', idMatricula)
    .first();

  if (!row) {
    throwLegacy(404, 'Matricula no encontrada');
  }

  const matricula = {
    id_matricula: row.id_matricula,
    fecha_matricula: row.fecha_matricula,
    estado: row.estado,
    ano_a_cursar: row.ano_a_cursar,
    id_estudiante: row.id_estudiante,
    nombre_completo: row.nombre_completo,
    cedula: row.cedula,
    anio_curso_lectivo: row.anio_curso_lectivo,
    nombre_seccion: row.nombre_seccion,
  };

  let tutor = null;
  if (row.tutor_row_id) {
    const ee = await db('encargado_estudiante')
      .where({
        id_persona_estudiante: row.id_estudiante,
        id_persona_encargado: row.tutor_row_id,
      })
      .orderBy('fecha', 'desc')
      .first();
    tutor = {
      id_persona: row.tutor_row_id,
      nombre_completo: row.tutor_row_nombre,
      cedula: row.tutor_row_cedula,
      telefono: row.tutor_row_telefono,
      patria_potestad: ee ? ee.patria_potestad : null,
    };
  } else {
    tutor = await db('encargado_estudiante as ee')
      .leftJoin('persona as t', 'ee.id_persona_encargado', 't.id_persona')
      .where('ee.id_persona_estudiante', row.id_estudiante)
      .orderBy('ee.fecha', 'desc')
      .select(
        't.id_persona',
        't.nombre_completo',
        't.cedula',
        't.telefono',
        'ee.patria_potestad'
      )
      .first();
  }

  if (user.rol === 'padre_de_familia') {
    const autorizado = await tutorTieneVisibilidadSobreEstudiante(user.id, matricula.id_estudiante);
    if (!autorizado) {
      throwLegacy(403, 'No tiene permiso para descargar este comprobante');
    }
  } else if (user.rol === ROL_PROFESOR) {
    const ok = await profesorTieneVisibilidadMatriculaEstudiante(user.id, matricula.id_estudiante);
    if (!ok) {
      throwLegacy(403, 'No autorizado para descargar comprobantes de este estudiante');
    }
  } else if (!tieneLecturaGlobalMatricula(user.rol)) {
    throwLegacy(403, 'No autorizado para descargar comprobantes');
  }

  return { matricula, tutor };
}

const PLACEHOLDER_DIRECCION_PRECARGA = 'Pendiente — precarga masiva';

async function buscarPersonaPorCedulaFlexible(trx, rawCedula) {
  const norm = haciendaService.normalizarIdentificacion(rawCedula);
  const trim = String(rawCedula || '').trim();
  return trx('persona')
    .where((qb) => {
      qb.where('cedula', norm).orWhere('cedula', trim);
    })
    .first();
}

const PRECARGA_BATCH_SIZE = 50;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function validarFilasContraCatalogo(filas, seccionMap) {
  const catalogErrors = [];
  for (const f of filas) {
    const sec = seccionMap.get(f.seccionNombre);
    if (!sec) {
      catalogErrors.push({ linea: f.lineNum, error: `Sección "${f.seccionNombre}" no existe en el catálogo` });
      continue;
    }
    const anoACursar = nombreSeccionToAnoACursar(f.seccionNombre);
    if (!anoACursar || !ANOS_PERMITIDOS.includes(anoACursar)) {
      catalogErrors.push({
        linea: f.lineNum,
        error: `No se pudo determinar el grado a partir de la sección "${f.seccionNombre}"`,
      });
    }
  }
  return catalogErrors;
}

async function validarFilasContraCatalogoEnLotes(filasProcesables, seccionMap) {
  const catalogErrors = [];
  for (const chunk of chunkArray(filasProcesables, PRECARGA_BATCH_SIZE)) {
    catalogErrors.push(...validarFilasContraCatalogo(chunk, seccionMap));
    await yieldEventLoop();
  }
  return catalogErrors;
}

async function buscarPersonasPorCedulasEnLote(trxOrDb, filas) {
  const cedulas = new Set();
  for (const f of filas) {
    cedulas.add(f.cedulaNorm);
    const trim = String(f.cedulaRaw || '').trim();
    if (trim) cedulas.add(trim);
  }
  if (cedulas.size === 0) {
    return new Map();
  }

  const rows = await trxOrDb('persona').whereIn('cedula', [...cedulas]);
  const byCedula = new Map(rows.map((row) => [row.cedula, row]));
  const byNorm = new Map();

  for (const f of filas) {
    const trim = String(f.cedulaRaw || '').trim();
    const persona = byCedula.get(f.cedulaNorm) || (trim ? byCedula.get(trim) : null);
    if (persona) {
      byNorm.set(f.cedulaNorm, persona);
    }
  }

  return byNorm;
}

async function obtenerActivasPorSeccionCurso(idCursoLectivo) {
  const rows = await db('matricula')
    .where({ id_curso_lectivo: idCursoLectivo, estado: 'activa' })
    .whereNotNull('id_seccion')
    .groupBy('id_seccion')
    .select('id_seccion')
    .count('* as total');

  return new Map(rows.map((r) => [r.id_seccion, parseInt(r.total, 10) || 0]));
}

/**
 * Detecta sobrecupo en precarga CSV respecto al límite de activas por sección (trigger 28).
 */
function analizarAdvertenciasCupoPrecarga(filasValidas, seccionMap, activasPorSeccionId) {
  const filasPorSeccion = new Map();

  for (const f of filasValidas) {
    if (!filasPorSeccion.has(f.seccionNombre)) {
      filasPorSeccion.set(f.seccionNombre, []);
    }
    filasPorSeccion.get(f.seccionNombre).push(f);
  }

  for (const [, filas] of filasPorSeccion) {
    filas.sort((a, b) => a.lineNum - b.lineNum);
  }

  const advertencias_cupo = [];
  const filas_excedentes_cupo = [];

  for (const [nombreSeccion, filas] of filasPorSeccion) {
    const sec = seccionMap.get(nombreSeccion);
    if (!sec) continue;

    const activasExistentes = activasPorSeccionId.get(sec.id_seccion) || 0;
    const enCsv = filas.length;
    const cupoDisponible = Math.max(0, MAX_ESTUDIANTES_POR_SECCION - activasExistentes);

    if (enCsv > MAX_ESTUDIANTES_POR_SECCION) {
      advertencias_cupo.push({
        seccion: nombreSeccion,
        tipo: 'csv_supera_25',
        mensaje: `El CSV asigna ${enCsv} estudiantes a "${nombreSeccion}", superando el cupo de ${MAX_ESTUDIANTES_POR_SECCION} activos por sección.`,
        estudiantes_en_csv: enCsv,
        cupo_maximo: MAX_ESTUDIANTES_POR_SECCION,
      });
    }

    if (activasExistentes + enCsv > MAX_ESTUDIANTES_POR_SECCION) {
      advertencias_cupo.push({
        seccion: nombreSeccion,
        tipo: 'activacion_excede_cupo',
        mensaje: `En "${nombreSeccion}" hay ${activasExistentes} matrícula(s) activa(s) y el CSV agrega ${enCsv}; solo ${cupoDisponible} podrían activarse sin superar el cupo de ${MAX_ESTUDIANTES_POR_SECCION}.`,
        activas_existentes: activasExistentes,
        estudiantes_en_csv: enCsv,
        cupo_disponible: cupoDisponible,
        cupo_maximo: MAX_ESTUDIANTES_POR_SECCION,
      });

      if (cupoDisponible < enCsv) {
        filas.slice(cupoDisponible).forEach((f, idx) => {
          const posicion = cupoDisponible + idx + 1;
          filas_excedentes_cupo.push({
            linea: f.lineNum,
            seccion: nombreSeccion,
            motivo:
              activasExistentes >= MAX_ESTUDIANTES_POR_SECCION
                ? `La sección ya tiene ${activasExistentes} estudiantes activos (cupo lleno). Esta matrícula pendiente no podrá activarse aquí.`
                : `Al activar pendientes, esta fila excedería el cupo de ${MAX_ESTUDIANTES_POR_SECCION} activos (posición ${posicion} de ${enCsv} en el CSV para esta sección).`,
          });
        });
      }
    }
  }

  return { advertencias_cupo, filas_excedentes_cupo };
}

export async function listCursosLectivos() {
  return getCursosLectivosCatalog();
}

/**
 * Precarga masiva desde CSV (UTF-8). Transacción única al confirmar importación.
 * @param {{ idCursoLectivo: number, csvBuffer: Buffer, dryRun: boolean }} opts
 */
export async function precargaMasivaEstudiantes(opts) {
  const idCursoLectivo = parseInt(String(opts.idCursoLectivo), 10);
  if (!Number.isFinite(idCursoLectivo) || idCursoLectivo < 1) {
    throwLegacy(400, 'id_curso_lectivo (o id_ciclo_lectivo) es obligatorio y debe ser válido');
  }

  const curso = await db('curso_lectivo').where({ id_curso_lectivo: idCursoLectivo }).first();
  if (!curso) {
    throwLegacy(404, 'Curso lectivo no encontrado');
  }

  const text = opts.csvBuffer.toString('utf8');
  const { rows } = parseCsvText(text);
  if (rows.length === 0) {
    throwLegacy(400, 'El archivo CSV no contiene filas de datos');
  }

  const seenCedulas = new Set();
  const lineErrors = [];
  /** @type {Array<{ lineNum: number, cedulaRaw: string, cedulaNorm: string, nombreCompleto: string, fechaSql: string, seccionNombre: string }>} */
  const filasProcesables = [];

  for (let i = 0; i < rows.length; i += 1) {
    const lineNum = i + 2;
    const r = extractPrecargaRow(rows[i]);
    const cedulaNorm = haciendaService.normalizarIdentificacion(r.cedula);
    if (!r.cedula || !cedulaNorm || cedulaNorm.length < 5) {
      lineErrors.push({ linea: lineNum, error: 'Cédula inválida o vacía' });
      continue;
    }
    if (seenCedulas.has(cedulaNorm)) {
      lineErrors.push({ linea: lineNum, error: `Cédula duplicada en el archivo (${cedulaNorm})` });
      continue;
    }
    seenCedulas.add(cedulaNorm);

    if (!r.nombreCompleto) {
      lineErrors.push({ linea: lineNum, error: 'Nombre completo vacío (nombre/apellidos o nombre_completo)' });
      continue;
    }
    const fechaSql = parseFechaNacimiento(r.fechaNacimiento);
    if (!fechaSql) {
      lineErrors.push({ linea: lineNum, error: 'Fecha de nacimiento inválida; use dd/mm/aaaa o aaaa-mm-dd' });
      continue;
    }
    const seccionNombre = r.seccion.trim();
    if (!seccionNombre) {
      lineErrors.push({ linea: lineNum, error: 'Sección vacía' });
      continue;
    }

    filasProcesables.push({
      lineNum,
      cedulaRaw: String(r.cedula).trim(),
      cedulaNorm,
      nombreCompleto: r.nombreCompleto.replace(/\s+/g, ' ').trim(),
      fechaSql,
      seccionNombre,
    });
  }

  const seccionMap = await getSeccionMapByNombre();
  const catalogErrors = await validarFilasContraCatalogoEnLotes(filasProcesables, seccionMap);

  if (opts.dryRun) {
    let nuevasPersonas = 0;
    let actualizacionesPersona = 0;
    const errorLineSet = new Set(catalogErrors.map((e) => e.linea));
    const filasValidas = filasProcesables.filter((f) => !errorLineSet.has(f.lineNum));

    for (const chunk of chunkArray(filasValidas, PRECARGA_BATCH_SIZE)) {
      const personas = await buscarPersonasPorCedulasEnLote(db, chunk);
      for (const f of chunk) {
        if (personas.has(f.cedulaNorm)) actualizacionesPersona += 1;
        else nuevasPersonas += 1;
      }
      await yieldEventLoop();
    }

    const activasPorSeccion = await obtenerActivasPorSeccionCurso(idCursoLectivo);
    const { advertencias_cupo, filas_excedentes_cupo } = analizarAdvertenciasCupoPrecarga(
      filasValidas,
      seccionMap,
      activasPorSeccion
    );

    return {
      dry_run: true,
      id_curso_lectivo: idCursoLectivo,
      anio_curso_lectivo: curso.anio_curso_lectivo,
      total_filas_datos: rows.length,
      filas_validas_estructura: filasProcesables.length,
      estimacion_nuevas_personas: nuevasPersonas,
      estimacion_actualizaciones_persona: actualizacionesPersona,
      errores_estructura: lineErrors,
      errores_catalogo: catalogErrors,
      advertencias_cupo,
      filas_excedentes_cupo,
      cupo_maximo_por_seccion: MAX_ESTUDIANTES_POR_SECCION,
    };
  }

  if (lineErrors.length > 0 || catalogErrors.length > 0) {
    throw new AppError('El CSV contiene errores; corrija el archivo antes de importar.', 400, {
      legacyJson: {
        error: 'El CSV contiene errores; corrija el archivo antes de importar.',
        errores_estructura: lineErrors,
        errores_catalogo: catalogErrors,
      },
    });
  }

  const trx = await db.transaction();
  try {
    const resumen = { matriculas_creadas: 0, matriculas_actualizadas: 0, personas_nuevas: 0, personas_actualizadas: 0 };

    for (const chunk of chunkArray(filasProcesables, PRECARGA_BATCH_SIZE)) {
      const personasEnLote = await buscarPersonasPorCedulasEnLote(trx, chunk);
      const idsConocidos = [...personasEnLote.values()].map((p) => p.id_persona);
      const matsEnLote = idsConocidos.length
        ? await trx('matricula')
          .whereIn('id_persona_estudiante', idsConocidos)
          .andWhere({ id_curso_lectivo: idCursoLectivo })
        : [];
      const matByEst = new Map(matsEnLote.map((m) => [m.id_persona_estudiante, m]));

      for (const f of chunk) {
        const seccionRow = seccionMap.get(f.seccionNombre);
        const anoACursar = nombreSeccionToAnoACursar(f.seccionNombre);

        let persona = personasEnLote.get(f.cedulaNorm);

        if (persona) {
          await trx('persona')
            .where({ id_persona: persona.id_persona })
            .update({
              nombre_completo: f.nombreCompleto,
              fecha_nacimiento: f.fechaSql,
            });
          resumen.personas_actualizadas += 1;
        } else {
          const correoPlace = `precarga.${f.cedulaNorm}@pendiente.sistema.local`;
          const retIns = await trx('persona')
            .insert({
              nombre_completo: f.nombreCompleto,
              cedula: f.cedulaNorm,
              correo: correoPlace,
              telefono: '00000000',
              direccion: PLACEHOLDER_DIRECCION_PRECARGA,
              fecha_nacimiento: f.fechaSql,
              nombre_rol: 'estudiante',
              activo: true,
            })
            .returning('id_persona');
          const idIns =
            retIns[0] && typeof retIns[0] === 'object' && retIns[0] !== null
              ? retIns[0].id_persona
              : retIns[0];
          persona = await trx('persona').where({ id_persona: idIns }).first();
          personasEnLote.set(f.cedulaNorm, persona);
          resumen.personas_nuevas += 1;
        }

        await assertEstudianteNoExpulsado(persona.id_persona, trx);

        const mat = matByEst.get(persona.id_persona)
          || (await trx('matricula')
            .where({
              id_persona_estudiante: persona.id_persona,
              id_curso_lectivo: idCursoLectivo,
            })
            .first());

        if (!mat) {
          await trx('matricula').insert({
            id_curso_lectivo: idCursoLectivo,
            fecha_matricula: new Date(),
            estado: 'pendiente',
            id_persona_estudiante: persona.id_persona,
            id_persona_tutor: null,
            ano_a_cursar: anoACursar,
            horario: HORARIO_REFERENCIA,
            tipo_matricula: 'regular',
            id_seccion: seccionRow.id_seccion,
            id_materia: null,
          });
          resumen.matriculas_creadas += 1;
        } else {
          await trx('matricula')
            .where({ id_matricula: mat.id_matricula })
            .update({
              id_seccion: seccionRow.id_seccion,
              ano_a_cursar: anoACursar,
            });
          resumen.matriculas_actualizadas += 1;
          matByEst.set(persona.id_persona, { ...mat, id_seccion: seccionRow.id_seccion });
        }
      }

      await yieldEventLoop();
    }

    await trx.commit();

    return {
      ok: true,
      message: 'Precarga masiva aplicada correctamente',
      id_curso_lectivo: idCursoLectivo,
      anio_curso_lectivo: curso.anio_curso_lectivo,
      resumen,
    };
  } catch (error) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    if (error instanceof AppError) throw error;
    handleMatriculaWriteError(error, 'Error al procesar la precarga');
  }
}
