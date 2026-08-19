import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import { buildNombreCompletoCr } from '../utils/nombrePersona.js';
import { normalizarIdentificacion } from './haciendaService.js';

function throwLegacy(statusCode, message) {
  throw new AppError(message, statusCode, { legacyJson: { error: message } });
}

const esVacio = (value) => value == null || (typeof value === 'string' && value.trim() === '');

export async function buscarEncargadosParaEstudiante(q) {
  const filtro = String(q || '').trim();
  if (filtro.length < 2) {
    return [];
  }

  const like = `%${filtro.toLowerCase()}%`;

  return db('persona')
    .select('id_persona', 'nombre_completo', 'cedula', 'correo', 'telefono', 'nombre_rol')
    .whereNot('nombre_rol', 'estudiante')
    .andWhere((qb) => {
      qb.whereRaw('LOWER(nombre_completo) LIKE ?', [like])
        .orWhereRaw('LOWER(cedula) LIKE ?', [like])
        .orWhereRaw('LOWER(correo) LIKE ?', [like]);
    })
    .orderBy('nombre_completo', 'asc')
    .limit(15);
}

async function assertCedulaCorreoUnicos(trx, idPersona, cedula, correo) {
  const dupCedula = await trx('persona')
    .where({ cedula })
    .whereNot('id_persona', idPersona)
    .first();
  if (dupCedula) {
    throwLegacy(409, 'La cédula ya está registrada en otra persona');
  }

  const dupCorreo = await trx('persona')
    .where({ correo })
    .whereNot('id_persona', idPersona)
    .first();
  if (dupCorreo) {
    throwLegacy(409, 'El correo ya está registrado en otra persona');
  }
}

async function buscarPersonaPorCedula(trx, cedulaRaw) {
  const cedulaNorm = normalizarIdentificacion(cedulaRaw);
  const cedulaTrim = String(cedulaRaw || '').trim();
  return trx('persona')
    .where((qb) => {
      qb.where('cedula', cedulaNorm).orWhere('cedula', cedulaTrim);
    })
    .first();
}

async function resolverIdEncargado(trx, body) {
  const idFromBody = body.encargado_id ?? body.id_persona_encargado ?? body.tutor?.id_persona;
  if (idFromBody != null && idFromBody !== '') {
    const id = parseInt(idFromBody, 10);
    if (!Number.isInteger(id) || id < 1) {
      throwLegacy(400, 'Identificador de encargado inválido');
    }
    const persona = await trx('persona').where({ id_persona: id }).first();
    if (!persona) {
      throwLegacy(404, 'El encargado seleccionado no existe');
    }
    if (persona.nombre_rol === 'estudiante') {
      throwLegacy(400, 'No se puede asignar un estudiante como tutor/encargado');
    }
    return id;
  }

  const nuevo = body.nuevo_encargado;
  if (!nuevo || typeof nuevo !== 'object') {
    return null;
  }

  const datos = validarDatosNuevoEncargado(nuevo);
  const cedulaNorm = normalizarIdentificacion(datos.cedula) || datos.cedula;

  const existente = await buscarPersonaPorCedula(trx, datos.cedula);
  if (existente) {
    if (existente.nombre_rol === 'estudiante') {
      throwLegacy(400, 'La cédula pertenece a un estudiante; no puede usarse como encargado');
    }
    return existente.id_persona;
  }

  const dupCorreo = await trx('persona').where({ correo: datos.correo }).first();
  if (dupCorreo) {
    throwLegacy(409, 'El correo ya está registrado');
  }

  const revalidacion = await buscarPersonaPorCedula(trx, cedulaNorm);
  if (revalidacion) {
    if (revalidacion.nombre_rol === 'estudiante') {
      throwLegacy(400, 'La cédula pertenece a un estudiante; no puede usarse como encargado');
    }
    return revalidacion.id_persona;
  }

  const [inserted] = await trx('persona')
    .insert({
      nombre_completo: datos.nombreCompleto,
      cedula: cedulaNorm,
      correo: datos.correo,
      telefono: datos.telefono,
      direccion: datos.direccion,
      fecha_nacimiento: datos.fechaNacimiento,
      nombre_rol: 'padre_de_familia',
      activo: true,
    })
    .returning('id_persona');

  return inserted?.id_persona ?? inserted;
}

async function vincularEncargadoEstudiante(trx, idEstudiante, idEncargado, patriaPotestad) {
  if (idEstudiante === idEncargado) {
    throwLegacy(400, 'El encargado no puede ser el mismo estudiante');
  }

  const flagPatria = patriaPotestad === true || patriaPotestad === 'true';
  if (!flagPatria) {
    throwLegacy(400, 'Debe confirmar patria potestad del encargado');
  }

  const relacion = await trx('encargado_estudiante')
    .where({ id_persona_estudiante: idEstudiante, id_persona_encargado: idEncargado })
    .first();

  if (!relacion) {
    await trx('encargado_estudiante').insert({
      id_persona_estudiante: idEstudiante,
      id_persona_encargado: idEncargado,
      fecha: new Date(),
      patria_potestad: true,
    });
  }

  const anioVigente = new Date().getFullYear();
  const matriculaVigente = await trx('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .where('m.id_persona_estudiante', idEstudiante)
    .andWhere('cl.anio_curso_lectivo', anioVigente)
    .select('m.id_matricula')
    .first();

  if (matriculaVigente?.id_matricula) {
    await trx('matricula')
      .where({ id_matricula: matriculaVigente.id_matricula })
      .update({ id_persona_tutor: idEncargado });
  }
}

function parsePatriaPotestad(body, nuevo) {
  const raw = body.patria_potestad ?? nuevo?.patria_potestad;
  return raw === true || raw === 'true';
}

function validarDatosNuevoEncargado(nuevo) {
  const nombreCompleto = String(nuevo.nombre_completo || '').trim()
    || buildNombreCompletoCr({
      nombre: nuevo.nombre,
      apellido1: nuevo.apellido1,
      apellido2: nuevo.apellido2,
    });
  const cedula = String(nuevo.cedula || '').trim();
  const correo = String(nuevo.correo || '').trim();
  const telefono = String(nuevo.telefono || '').trim();
  const direccion = String(nuevo.direccion || '').trim();
  const fechaNacimiento = String(nuevo.fecha_nacimiento || '').trim();

  if (
    !nombreCompleto ||
    !cedula ||
    !correo ||
    !telefono ||
    !direccion ||
    !fechaNacimiento
  ) {
    throwLegacy(
      400,
      'Todos los datos del encargado son obligatorios: nombre completo, cédula, correo, teléfono, dirección y fecha de nacimiento'
    );
  }

  return {
    nombreCompleto,
    cedula,
    correo,
    telefono,
    direccion,
    fechaNacimiento,
  };
}

export async function actualizarEstudianteConEncargado(idEstudiante, body) {
  const id = parseInt(idEstudiante, 10);
  if (!Number.isInteger(id)) {
    throwLegacy(400, 'Identificador de estudiante inválido');
  }

  const {
    nombre_completo,
    cedula,
    correo,
    telefono,
    direccion,
    fecha_nacimiento,
  } = body;

  if (
    esVacio(nombre_completo) ||
    esVacio(cedula) ||
    esVacio(correo) ||
    esVacio(telefono) ||
    esVacio(direccion) ||
    esVacio(fecha_nacimiento)
  ) {
    throwLegacy(400, 'Error: Todos los campos son obligatorios. No se permiten valores vacíos');
  }

  const estudiante = await db('persona').where({ id_persona: id, nombre_rol: 'estudiante' }).first();
  if (!estudiante) {
    throwLegacy(404, 'Estudiante no encontrado');
  }

  const patch = {
    nombre_completo: String(nombre_completo).trim(),
    cedula: String(cedula).trim(),
    correo: String(correo).trim(),
    telefono: String(telefono).trim(),
    direccion: String(direccion).trim(),
    fecha_nacimiento,
  };

  await db.transaction(async (trx) => {
    await assertCedulaCorreoUnicos(trx, id, patch.cedula, patch.correo);
    await trx('persona').where({ id_persona: id }).update(patch);

    const idEncargado = await resolverIdEncargado(trx, body);
    if (idEncargado) {
      const patriaPotestad = parsePatriaPotestad(body, body.nuevo_encargado);
      await vincularEncargadoEstudiante(trx, id, idEncargado, patriaPotestad);
    }
  });

  return { message: 'Estudiante actualizado correctamente' };
}

export async function reactivarEstudiante(idEstudiante) {
  const id = parseInt(idEstudiante, 10);
  if (!Number.isInteger(id)) {
    throwLegacy(400, 'Identificador de estudiante inválido');
  }

  const updated = await db('persona')
    .where({ id_persona: id, nombre_rol: 'estudiante', activo: false })
    .update({ activo: true });

  if (!updated) {
    throwLegacy(404, 'Estudiante archivado no encontrado');
  }

  return { message: 'Estudiante reactivado correctamente.' };
}
