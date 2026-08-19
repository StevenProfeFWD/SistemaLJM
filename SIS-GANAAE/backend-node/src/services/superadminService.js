import db from '../db/knex.js';
import AppError from '../utils/AppError.js';

function throwLegacy(statusCode, message) {
  throw new AppError(message, statusCode, { legacyJson: { error: message } });
}

export async function listarAdministradores() {
  return db('persona as p')
    .join('usuariosistema as u', 'p.id_persona', 'u.persona_id')
    .whereIn('p.nombre_rol', ['administrador', 'super_administrador'])
    .select(
      'p.id_persona',
      'p.nombre_completo',
      'p.cedula',
      'p.correo',
      'p.telefono',
      'p.direccion',
      'p.fecha_nacimiento',
      'p.nombre_rol',
      'p.activo',
      'u.id_usuario',
      'u.primer_login',
      'u.activo as cuenta_activa',
      'u.fecha_registro'
    )
    .orderByRaw("CASE WHEN p.nombre_rol = 'super_administrador' THEN 0 ELSE 1 END")
    .orderBy('p.nombre_completo');
}

export async function crearAdministrador(body) {
  const {
    nombre_completo,
    cedula,
    correo,
    telefono,
    direccion,
    fecha_nacimiento,
  } = body;

  if (!nombre_completo?.trim() || !cedula?.trim() || !correo?.trim()
    || !telefono?.trim() || !direccion?.trim() || !fecha_nacimiento) {
    throwLegacy(400, 'Todos los campos del administrador son obligatorios');
  }

  const correoExistente = await db('persona').where({ correo: correo.trim() }).first();
  if (correoExistente) throwLegacy(409, 'El correo ya está registrado');

  const cedulaExistente = await db('persona').where({ cedula: cedula.trim() }).first();
  if (cedulaExistente) throwLegacy(409, 'La cédula ya está registrada');

  const trx = await db.transaction();
  try {
    const [inserted] = await trx('persona')
      .insert({
        nombre_completo: nombre_completo.trim(),
        cedula: cedula.trim(),
        correo: correo.trim(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        fecha_nacimiento,
        nombre_rol: 'administrador',
        activo: true,
      })
      .returning('*');

    await trx.commit();
    return {
      message: 'Administrador registrado correctamente. Contraseña inicial: liceomarti',
      administrador: inserted,
    };
  } catch (e) {
    await trx.rollback();
    throw e;
  }
}

export async function actualizarAdministrador(idPersona, body) {
  const id = parseInt(idPersona, 10);
  if (!Number.isInteger(id)) throwLegacy(400, 'Identificador inválido');

  const existente = await db('persona')
    .where({ id_persona: id, nombre_rol: 'administrador' })
    .first();
  if (!existente) throwLegacy(404, 'Administrador no encontrado');

  const patch = {};
  if (body.nombre_completo != null) patch.nombre_completo = String(body.nombre_completo).trim();
  if (body.cedula != null) patch.cedula = String(body.cedula).trim();
  if (body.correo != null) patch.correo = String(body.correo).trim();
  if (body.telefono != null) patch.telefono = String(body.telefono).trim();
  if (body.direccion != null) patch.direccion = String(body.direccion).trim();
  if (body.fecha_nacimiento != null) patch.fecha_nacimiento = body.fecha_nacimiento;

  if (patch.correo && patch.correo !== existente.correo) {
    const dup = await db('persona').where({ correo: patch.correo }).whereNot('id_persona', id).first();
    if (dup) throwLegacy(409, 'El correo ya está en uso');
  }
  if (patch.cedula && patch.cedula !== existente.cedula) {
    const dup = await db('persona').where({ cedula: patch.cedula }).whereNot('id_persona', id).first();
    if (dup) throwLegacy(409, 'La cédula ya está en uso');
  }

  if (Object.keys(patch).length === 0) {
    throwLegacy(400, 'No hay datos para actualizar');
  }

  const [updated] = await db('persona')
    .where({ id_persona: id })
    .update(patch)
    .returning('*');

  return { message: 'Administrador actualizado', administrador: updated };
}

export async function setAdministradorActivo(idPersona, activo) {
  const id = parseInt(idPersona, 10);
  if (!Number.isInteger(id)) throwLegacy(400, 'Identificador inválido');

  const existente = await db('persona')
    .where({ id_persona: id, nombre_rol: 'administrador' })
    .first();
  if (!existente) throwLegacy(404, 'Administrador no encontrado');

  const flag = Boolean(activo);

  await db.transaction(async (trx) => {
    await trx('persona').where({ id_persona: id }).update({ activo: flag });
    await trx('usuariosistema').where({ persona_id: id }).update({ activo: flag });
  });

  return {
    message: flag ? 'Cuenta de administrador reactivada' : 'Cuenta de administrador desactivada',
    id_persona: id,
    activo: flag,
  };
}
