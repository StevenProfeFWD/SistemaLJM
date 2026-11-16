/**
 * Caja blanca de verificarToken (protege las rutas EPI) y tokenRevocationService.
 * JWT reales firmados con firmarTokenAcceso; BD simulada; cookies cifradas con clave de prueba.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const CLAVE_COOKIE = 'clave-de-prueba-unitaria-0123456789';

import * as DB from '../helpers/dbMock.js';
import * as M from '../../../../backend-node/src/middlewares/verificarToken.js';
import * as TR from '../../../../backend-node/src/services/tokenRevocationService.js';
import * as CE from '../../../../backend-node/src/utils/cookieEncryption.js';

let keyBackup;
beforeEach(async () => {
  keyBackup = process.env.COOKIE_ENCRYPTION_KEY;
  process.env.COOKIE_ENCRYPTION_KEY = CLAVE_COOKIE;
  DB.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (keyBackup === undefined) delete process.env.COOKIE_ENCRYPTION_KEY;
  else process.env.COOKIE_ENCRYPTION_KEY = keyBackup;
  vi.restoreAllMocks();
});

const fakeRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const filaActiva = (extra = {}) => ({
  id_persona: 10,
  nombre_rol: 'epi',
  correo: 'epi@liceo.cr',
  persona_activa: true,
  cuenta_activa: true,
  ...extra,
});

/** Resolver: persona → fila; jwt_revocado → revocado. */
const resolver = ({ persona = filaActiva(), revocado = undefined } = {}) => (r) => {
  if (r.tabla === 'persona as p') return persona;
  if (r.tabla === 'jwt_revocado') {
    if (revocado instanceof Error) throw revocado;
    return revocado;
  }
  return undefined;
};

async function correr(mw, { cookies = {}, params = {} } = {}) {
  const req = { cookies, params };
  const res = fakeRes();
  const next = vi.fn();
  await mw(req, res, next);
  return { req, res, next };
}

const cookieDe = (jwt) => CE.cifrarCookie(jwt);

const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwtManual(payload, { alg = 'HS256', secret = 'otra-clave' } = {}) {
  const h = b64u({ alg, typ: 'JWT' });
  const p = b64u({ iat: Math.floor(Date.now() / 1000), ...payload });
  if (alg === 'none') return `${h}.${p}.`;
  const firma = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${firma}`;
}

describe('verificarTokenInterno', () => {
  it('sin cookie → 401 "Token acceso faltante"', async () => {
    const { res, next } = await correr(M.verificarTokenInterno);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Token acceso faltante' });
    expect(next).not.toHaveBeenCalled();
  });

  it('cookie con JWT sin cifrar (manipulada) → 401', async () => {
    const { res } = await correr(M.verificarTokenInterno, { cookies: { token: TR.firmarTokenAcceso({ id: 10 }) } });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('token válido de usuario EPI activo → next() y req.user enriquecido desde BD', async () => {
    DB.setResolver(resolver());
    const jwt = TR.firmarTokenAcceso({ id: 10, rol: 'epi', correo: 'viejo@x.com' });
    const { req, next, res } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(jwt) } });
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 10, rol: 'epi', correo: 'epi@liceo.cr' });
    expect(req.user.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it('el rol se toma de la BD (token dice administrador, BD dice epi → epi)', async () => {
    DB.setResolver(resolver({ persona: filaActiva({ nombre_rol: 'epi' }) }));
    const jwt = TR.firmarTokenAcceso({ id: 10, rol: 'administrador' });
    const { req } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(jwt) } });
    expect(req.user.rol).toBe('epi');
  });

  it('OBSERVACIÓN O-05: si nombre_rol en BD es null se conserva el rol del JWT (privilegio potencialmente obsoleto)', async () => {
    DB.setResolver(resolver({ persona: filaActiva({ nombre_rol: null, correo: null }) }));
    const jwt = TR.firmarTokenAcceso({ id: 10, rol: 'administrador', correo: 'a@x.com' });
    const { req } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(jwt) } });
    expect(req.user.rol).toBe('administrador');
    expect(req.user.correo).toBe('a@x.com');
  });

  it.each([
    ['usuario inexistente', null, 'Usuario no encontrado'],
    ['persona inactiva', filaActiva({ persona_activa: false }), 'Cuenta desactivada'],
    ['cuenta de sistema inactiva', filaActiva({ cuenta_activa: false }), 'Cuenta desactivada o sin acceso al sistema'],
    ['sin cuenta de sistema (null)', filaActiva({ cuenta_activa: null }), 'Cuenta desactivada o sin acceso al sistema'],
  ])('%s → 403', async (_n, persona, mensaje) => {
    DB.setResolver(resolver({ persona }));
    const jwt = TR.firmarTokenAcceso({ id: 10 });
    const { res, next } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(jwt) } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje });
    expect(next).not.toHaveBeenCalled();
  });

  it('persona_activa null (no false) se considera activa', async () => {
    DB.setResolver(resolver({ persona: filaActiva({ persona_activa: null }) }));
    const { next } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(TR.firmarTokenAcceso({ id: 10 })) } });
    expect(next).toHaveBeenCalled();
  });

  it('id no numérico en el token → 403 sin consultar persona', async () => {
    DB.setResolver(resolver());
    const { res } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(TR.firmarTokenAcceso({ id: 'abc' })) } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(DB.llamadas.some((l) => l.tabla === 'persona as p')).toBe(false);
  });

  it('token revocado (jti en jwt_revocado) → 401', async () => {
    DB.setResolver(resolver({ revocado: { jti: 'x' } }));
    const { res } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(TR.firmarTokenAcceso({ id: 10 })) } });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Sesión revocada. Inicie sesión nuevamente.' });
  });

  it('CORREGIDO O-04 (seguridad): si la consulta de revocación falla, el token se rechaza con 503 (fail-closed, sin cerrar la sesión)', async () => {
    DB.setResolver(resolver({ revocado: new Error('BD caída') }));
    const { next, res } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(TR.firmarTokenAcceso({ id: 10 })) } });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('token sin jti (antiguo) se acepta sin consultar revocación', async () => {
    DB.setResolver(resolver());
    const jwt = jwtManual({ id: 10, exp: Math.floor(Date.now() / 1000) + 600 }, { secret: 'clave-jwt' });
    const { next } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(jwt) } });
    // Solo es válido si JWT_SECRET del entorno de pruebas es el valor por defecto de configjwt
    if (!process.env.JWT_SECRET) {
      expect(next).toHaveBeenCalled();
      expect(DB.llamadas.some((l) => l.tabla === 'jwt_revocado')).toBe(false);
    }
  });

  it.each([
    ['firmado con otra clave', () => jwtManual({ id: 10, jti: 'a' }, { secret: 'otra' })],
    ['alg "none"', () => jwtManual({ id: 10 }, { alg: 'none' })],
    ['expirado', () => TR.firmarTokenAcceso({ id: 10 }, -10)],
    ['basura', () => 'no.es.jwt'],
  ])('JWT %s → 403 "Token acceso inválido"', async (_n, gen) => {
    DB.setResolver(resolver());
    const { res, next } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(gen()) } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Token acceso inválido' });
    expect(next).not.toHaveBeenCalled();
  });

  it('error de BD al consultar persona → 403 (capturado)', async () => {
    DB.setResolver((r) => {
      if (r.tabla === 'persona as p') throw new Error('timeout');
      return undefined;
    });
    const { res } = await correr(M.verificarTokenInterno, { cookies: { token: cookieDe(TR.firmarTokenAcceso({ id: 10 })) } });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('verificarTokenCambioContrasena', () => {
  it('sin tokens → 401', async () => {
    const { res } = await correr(M.verificarTokenCambioContrasena, { params: { id: '10' } });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('token de otro usuario → 403', async () => {
    DB.setResolver(resolver());
    const { res } = await correr(M.verificarTokenCambioContrasena, {
      cookies: { token: cookieDe(TR.firmarTokenAcceso({ id: 11 })) },
      params: { id: '10' },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.lastCall[0].mensaje).toMatch(/contraseña de este usuario/);
  });

  it('token pendiente de primer login (cookie pending_password_change) → next', async () => {
    DB.setResolver(resolver());
    const { next, req } = await correr(M.verificarTokenCambioContrasena, {
      cookies: { pending_password_change: cookieDe(TR.firmarTokenPendientePassword(10)) },
      params: { id: '10' },
    });
    expect(next).toHaveBeenCalled();
    expect(req.user.purpose).toBe('password_change');
  });

  it('revocado → 401; cuenta inactiva → 403; token inválido → 403', async () => {
    const jwt = cookieDe(TR.firmarTokenAcceso({ id: 10 }));
    DB.setResolver(resolver({ revocado: { jti: 1 } }));
    expect((await correr(M.verificarTokenCambioContrasena, { cookies: { token: jwt }, params: { id: 10 } })).res.status).toHaveBeenCalledWith(401);
    DB.setResolver(resolver({ persona: filaActiva({ cuenta_activa: false }) }));
    expect((await correr(M.verificarTokenCambioContrasena, { cookies: { token: jwt }, params: { id: 10 } })).res.status).toHaveBeenCalledWith(403);
    const malo = cookieDe('x.y.z');
    const r = await correr(M.verificarTokenCambioContrasena, { cookies: { token: malo }, params: { id: 10 } });
    expect(r.res.json).toHaveBeenCalledWith({ mensaje: 'Token acceso inválido o expirado.' });
  });
});

