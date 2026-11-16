/**
 * Generación de cookies de sesión de prueba (caja negra: se replica el formato
 * observado — JWT HS256 cifrado AES-256-GCM en base64 dentro de la cookie `token`).
 */
import crypto from 'crypto';
import { requireApp } from './paths.mjs';

const jwt = requireApp('jsonwebtoken');

function key() {
  const k = process.env.COOKIE_ENCRYPTION_KEY;
  return k.length >= 32 ? Buffer.from(k.slice(0, 32), 'utf8') : crypto.createHash('sha256').update(k).digest();
}

export function cifrar(valor, k = key()) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv, { authTagLength: 16 });
  const enc = Buffer.concat([c.update(valor, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function firmar(payload, { secret = process.env.JWT_SECRET, expiresIn = '1h', jti = true, algorithm = 'HS256' } = {}) {
  const p = { ...payload };
  if (jti === true) p.jti = crypto.randomUUID().replace(/-/g, '');
  else if (typeof jti === 'string') p.jti = jti;
  return jwt.sign(p, secret, { algorithm, expiresIn });
}

export const USUARIOS = {
  epi: 1, administrador: 2, super_administrador: 3, profesor: 4, orientador: 5, padre_de_familia: 6,
  epi_persona_inactiva: 7, epi_cuenta_inactiva: 8, epi_sin_cuenta: 9, estudiante: 10, sin_rol: 11, EPI_mayus: 12,
};

/** Cookie lista para supertest `.set('Cookie', ...)` */
export function cookiePara(idOrRol, opts = {}) {
  const id = typeof idOrRol === 'number' ? idOrRol : USUARIOS[idOrRol];
  const rol = typeof idOrRol === 'string' ? idOrRol : 'epi';
  const token = firmar({ id, rol, correo: `u${id}@test.local` }, opts);
  return `token=${encodeURIComponent(cifrar(token))}`;
}

export function cookieCruda(valor) {
  return `token=${encodeURIComponent(valor)}`;
}
