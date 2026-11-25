/**
 * Restablecimiento de contraseñas por parte de la administración.
 *
 * - El super administrador solo puede restablecer cuentas de administradores.
 * - El administrador puede restablecer cuentas de profesores, orientadores,
 *   EPI y encargados (no de otros administradores ni del super administrador).
 * - Nadie puede restablecer su propia contraseña por esta vía (para eso existe
 *   "Cambiar contraseña").
 *
 * La contraseña queda en "liceomarti" (cifrada con bcrypt, igual que el resto del
 * sistema) y se marca primer_login = true: al ingresar, el usuario debe cambiarla.
 * Con primer_login = true, verificarToken rechaza las sesiones abiertas antes del
 * restablecimiento.
 */
import bcrypt from 'bcrypt';
import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import { rolesRestableciblesPor, etiquetaRolPersona } from '../utils/roles.js';

export const CONTRASENA_RESTABLECIDA = 'liceomarti';
const RONDAS_BCRYPT = 10;
const INT4_MAX = 2147483647;
const LIMITE_BUSQUEDA = 50;

function parseIdPersona(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) throw new AppError('Identificador inválido', 400);
  const id = Number(texto);
  if (id < 1 || id > INT4_MAX) throw new AppError('Identificador inválido', 400);
  return id;
}

function rolesPermitidos(rolSolicitante) {
  const roles = rolesRestableciblesPor(rolSolicitante);
  if (roles.length === 0) {
    throw new AppError('No tiene permiso para restablecer contraseñas', 403);
  }
  return roles;
}

/**
 * Busca usuarios cuya contraseña puede restablecer el solicitante
 * (por nombre, cédula o correo). Sin texto devuelve los primeros por nombre.
 */
export async function buscarUsuariosRestablecibles(rolSolicitante, idSolicitante, texto = '') {
  const roles = rolesPermitidos(rolSolicitante);
  const q = String(Array.isArray(texto) ? '' : texto ?? '').trim().slice(0, 100);

  let consulta = db('persona as p')
    .join('usuariosistema as u', 'u.persona_id', 'p.id_persona')
    // ::text: no depende de que todos los valores existan en el enum tipo_rol
    .whereIn(db.raw('p.nombre_rol::text'), roles)
    .whereNot('p.id_persona', idSolicitante)
    .select(
      'p.id_persona',
      'p.nombre_completo',
      'p.cedula',
      'p.correo',
      'p.nombre_rol',
      'p.activo',
      'u.activo as cuenta_activa',
      'u.primer_login'
    )
    .orderBy('p.nombre_completo', 'asc')
    .limit(LIMITE_BUSQUEDA);

  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    consulta = consulta.where((w) => {
      w.whereILike('p.nombre_completo', patron)
        .orWhereILike('p.cedula', patron)
        .orWhereILike('p.correo', patron);
    });
  }

  const filas = await consulta;
  return filas.map((f) => ({ ...f, rol_label: etiquetaRolPersona(f.nombre_rol) }));
}

/**
 * Restablece la contraseña de idObjetivo a "liceomarti" (bcrypt) y obliga a cambiarla.
 */
export async function restablecerContrasena({ idSolicitante, rolSolicitante, idObjetivo }) {
  const roles = rolesPermitidos(rolSolicitante);
  const id = parseIdPersona(idObjetivo);

  if (Number(idSolicitante) === id) {
    throw new AppError(
      'No puede restablecer su propia contraseña. Use la opción «Cambiar contraseña».',
      400
    );
  }

  const objetivo = await db('persona as p')
    .leftJoin('usuariosistema as u', 'u.persona_id', 'p.id_persona')
    .where('p.id_persona', id)
    .first('p.id_persona', 'p.nombre_completo', 'p.nombre_rol', 'u.id_usuario');

  if (!objetivo) throw new AppError('Usuario no encontrado', 404);

  if (!roles.includes(objetivo.nombre_rol)) {
    throw new AppError('No tiene permiso para restablecer la contraseña de este usuario', 403);
  }

  if (objetivo.id_usuario == null) {
    throw new AppError('La persona no tiene una cuenta de acceso al sistema', 404);
  }

  const hash = await bcrypt.hash(CONTRASENA_RESTABLECIDA, RONDAS_BCRYPT);
  const actualizados = await db('usuariosistema')
    .where({ persona_id: id })
    .update({ contrasena_hash: hash, primer_login: true });

  if (!actualizados) throw new AppError('Usuario no encontrado', 404);

  return {
    message: `Contraseña restablecida. ${objetivo.nombre_completo} deberá ingresar con la contraseña temporal y cambiarla.`,
    id_persona: id,
    nombre_completo: objetivo.nombre_completo,
    nombre_rol: objetivo.nombre_rol,
  };
}
