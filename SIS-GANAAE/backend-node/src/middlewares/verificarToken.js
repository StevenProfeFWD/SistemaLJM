import jwt from 'jsonwebtoken';
import configJWT from '../../configjwt.js';
import db from '../db/knex.js';
import { descifrarCookie } from '../utils/cookieEncryption.js';
import { tokenEstaRevocado } from '../services/tokenRevocationService.js';

const { jwtSecret } = configJWT;
const VERIFY_OPTS = { algorithms: ['HS256'] };

/**
 * Confirma que la persona y su cuenta de sistema siguen activas.
 * Actualiza rol desde BD (evita privilegios obsoletos en el JWT).
 */
async function assertCuentaActivaYEnriquecer(decoded) {
  const id = parseInt(decoded?.id, 10);
  if (!Number.isInteger(id)) {
    return { ok: false, status: 403, mensaje: 'Token acceso inválido' };
  }

  const row = await db('persona as p')
    .leftJoin('usuariosistema as u', 'u.persona_id', 'p.id_persona')
    .where('p.id_persona', id)
    .select(
      'p.id_persona',
      'p.nombre_rol',
      'p.correo',
      'p.activo as persona_activa',
      'u.activo as cuenta_activa'
    )
    .first();

  if (!row) {
    return { ok: false, status: 403, mensaje: 'Usuario no encontrado' };
  }

  if (row.persona_activa === false) {
    return { ok: false, status: 403, mensaje: 'Cuenta desactivada' };
  }

  if (row.cuenta_activa !== true) {
    return { ok: false, status: 403, mensaje: 'Cuenta desactivada o sin acceso al sistema' };
  }

  return {
    ok: true,
    user: {
      ...decoded,
      id: row.id_persona,
      correo: row.correo || decoded.correo,
      rol: row.nombre_rol || decoded.rol,
    },
  };
}

async function assertTokenNoRevocado(decoded) {
  if (!decoded?.jti) {
    // Tokens antiguos sin jti: se aceptan hasta que expiren (migración suave)
    return { ok: true };
  }
  if (await tokenEstaRevocado(decoded.jti)) {
    return { ok: false, status: 401, mensaje: 'Sesión revocada. Inicie sesión nuevamente.' };
  }
  return { ok: true };
}

export const verificarTokenInterno = async (req, res, next) => {
  const tokenCifrado = req.cookies?.token;
  const token = descifrarCookie(tokenCifrado);

  if (!token) {
    return res.status(401).json({ mensaje: 'Token acceso faltante' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, VERIFY_OPTS);
    const rev = await assertTokenNoRevocado(decoded);
    if (!rev.ok) {
      return res.status(rev.status).json({ mensaje: rev.mensaje });
    }
    const check = await assertCuentaActivaYEnriquecer(decoded);
    if (!check.ok) {
      return res.status(check.status).json({ mensaje: check.mensaje });
    }
    req.user = check.user;
    next();
  } catch {
    return res.status(403).json({ mensaje: 'Token acceso inválido' });
  }
};

/**
 * Middleware para PATCH /personas/:id (cambio de contraseña).
 * Acepta token de sesión (cookie 'token') o token de primer login (cookie 'pending_password_change').
 * Valida que el id del token coincida con req.params.id.
 */
export const verificarTokenCambioContrasena = async (req, res, next) => {
  const tokenCifrado = req.cookies?.token;
  const pendingCifrado = req.cookies?.pending_password_change;
  const token = descifrarCookie(tokenCifrado);
  const pendingToken = descifrarCookie(pendingCifrado);
  const { id } = req.params;

  const tokenToVerify = token || pendingToken;
  if (!tokenToVerify) {
    return res.status(401).json({
      mensaje:
        'Token acceso faltante. Debe iniciar sesión o completar el flujo de primer login.',
    });
  }

  try {
    const decoded = jwt.verify(tokenToVerify, jwtSecret, VERIFY_OPTS);
    if (String(decoded.id) !== String(id)) {
      return res
        .status(403)
        .json({ mensaje: 'No tiene permiso para cambiar la contraseña de este usuario.' });
    }

    const rev = await assertTokenNoRevocado(decoded);
    if (!rev.ok) {
      return res.status(rev.status).json({ mensaje: rev.mensaje });
    }

    const check = await assertCuentaActivaYEnriquecer(decoded);
    if (!check.ok) {
      return res.status(check.status).json({ mensaje: check.mensaje });
    }
    req.user = check.user;
    next();
  } catch {
    return res.status(403).json({ mensaje: 'Token acceso inválido o expirado.' });
  }
};
