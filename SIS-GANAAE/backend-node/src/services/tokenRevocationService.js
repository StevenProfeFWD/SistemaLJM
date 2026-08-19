import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../db/knex.js';
import configJWT from '../../configjwt.js';

const { jwtSecret, jwtExpiresIn } = configJWT;
const SIGN_OPTS = { algorithm: 'HS256' };

let tablaLista = false;
let ultimaLimpiezaMs = 0;

async function asegurarTabla() {
  if (tablaLista) return;
  try {
    await db.raw(`
      CREATE TABLE IF NOT EXISTS jwt_revocado (
        jti VARCHAR(64) PRIMARY KEY,
        id_persona INTEGER,
        revocado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expira_en TIMESTAMPTZ NOT NULL
      )
    `);
    await db.raw(`
      CREATE INDEX IF NOT EXISTS idx_jwt_revocado_expira_en ON jwt_revocado (expira_en)
    `);
    tablaLista = true;
  } catch (err) {
    console.error('[tokenRevocation] No se pudo asegurar tabla jwt_revocado:', err.message);
  }
}

function expiracionDesdeJwt(decoded) {
  if (decoded?.exp) {
    return new Date(decoded.exp * 1000);
  }
  return new Date(Date.now() + 60 * 60 * 1000);
}

/**
 * Firma un JWT de acceso con jti único (para poder revocarlo).
 */
export function firmarTokenAcceso(payload, expiresIn = jwtExpiresIn) {
  const jti = crypto.randomUUID().replace(/-/g, '');
  return jwt.sign({ ...payload, jti }, jwtSecret, { ...SIGN_OPTS, expiresIn });
}

export function firmarTokenPendientePassword(idPersona) {
  return firmarTokenAcceso({ id: idPersona, purpose: 'password_change' }, '10m');
}

export async function tokenEstaRevocado(jti) {
  if (!jti) return false;
  await asegurarTabla();
  try {
    const row = await db('jwt_revocado').where({ jti: String(jti) }).first();
    return Boolean(row);
  } catch (err) {
    console.error('[tokenRevocation] Error al consultar revocación:', err.message);
    return false;
  }
}

export async function revocarJti(jti, idPersona, expiraEn) {
  if (!jti) return;
  await asegurarTabla();
  const expira = expiraEn instanceof Date ? expiraEn : new Date(expiraEn || Date.now() + 3600000);
  try {
    await db('jwt_revocado')
      .insert({
        jti: String(jti),
        id_persona: idPersona != null ? parseInt(idPersona, 10) || null : null,
        expira_en: expira,
      })
      .onConflict('jti')
      .ignore();
  } catch (err) {
    console.error('[tokenRevocation] Error al revocar jti:', err.message);
  }
}

export async function revocarDecoded(decoded) {
  if (!decoded?.jti) return;
  await revocarJti(decoded.jti, decoded.id, expiracionDesdeJwt(decoded));
}

/**
 * Elimina JTIs cuya `expira_en` (TIMESTAMPTZ) ya pasó según el reloj de PostgreSQL.
 * @param {{ force?: boolean }} [opts] - force=true ignora el throttle (uso en cron diario).
 * @returns {Promise<number>} cantidad de filas eliminadas
 */
export async function limpiarRevocadosExpirados(opts = {}) {
  const force = Boolean(opts.force);
  const ahora = Date.now();

  if (!force && ahora - ultimaLimpiezaMs < 15 * 60 * 1000) {
    return 0;
  }
  ultimaLimpiezaMs = ahora;

  await asegurarTabla();
  try {
    // db.fn.now() = NOW() de PostgreSQL (misma zona TIMESTAMPTZ que expira_en)
    const eliminados = await db('jwt_revocado').where('expira_en', '<', db.fn.now()).del();
    return typeof eliminados === 'number' ? eliminados : 0;
  } catch (err) {
    console.error('[tokenRevocation] Error en limpieza:', err.message);
    return 0;
  }
}
