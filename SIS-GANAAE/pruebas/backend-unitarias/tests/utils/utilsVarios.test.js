import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { parseNombreCompletoCr, buildNombreCompletoCr } from '../../../../backend-node/src/utils/nombrePersona.js';
import {
  MSG_CUPO_SECCION,
  isCupoSeccionDbError,
  throwCupoSeccionConflict,
  rethrowIfCupoSeccion,
  handleMatriculaWriteError,
} from '../../../../backend-node/src/utils/cupoSeccionError.js';
import asyncHandler from '../../../../backend-node/src/utils/asyncHandler.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import { cifrarCookie, descifrarCookie } from '../../../../backend-node/src/utils/cookieEncryption.js';
import { esProduccion, cookieAuthOptions, cookieClearOptions } from '../../../../backend-node/src/utils/cookieOptions.js';
import { obtenerOrigenesCorsPermitidos, corsOriginCallback } from '../../../../backend-node/src/utils/corsConfig.js';
import { validarSeguridadEntorno } from '../../../../backend-node/src/utils/validateEnv.js';
import { notFound, errorHandler } from '../../../../backend-node/src/middlewares/errorHandler.js';

const ENV_KEYS = ['NODE_ENV', 'COOKIE_ENCRYPTION_KEY', 'JWT_SECRET', 'FRONTEND_ORIGIN', 'CORS_ORIGIN'];
let envBackup;
beforeEach(() => {
  envBackup = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  vi.restoreAllMocks();
});

describe('nombrePersona', () => {
  it.each([
    [null, { nombre: '', apellido1: '', apellido2: '', nombre_completo: '' }],
    ['   ', { nombre: '', apellido1: '', apellido2: '', nombre_completo: '' }],
    ['Ana', { nombre: 'Ana', apellido1: '', apellido2: '', nombre_completo: 'Ana' }],
    ['Mora  Ana', { apellido1: 'Mora', apellido2: '', nombre: 'Ana', nombre_completo: 'Mora Ana' }],
    ['MORA SOLÍS ANA MARÍA', { apellido1: 'MORA', apellido2: 'SOLÍS', nombre: 'ANA MARÍA', nombre_completo: 'MORA SOLÍS ANA MARÍA' }],
    ['  Núñez\tPérez\nJosé ', { apellido1: 'Núñez', apellido2: 'Pérez', nombre: 'José', nombre_completo: 'Núñez Pérez José' }],
  ])('parse %j', (v, e) => expect(parseNombreCompletoCr(v)).toEqual(e));

  it('apellidos compuestos ("DE LA O") se parten incorrectamente — limitación del formato', () => {
    expect(parseNombreCompletoCr('DE LA O CARLOS').apellido1).toBe('DE');
  });

  it('build ignora vacíos y recorta', () => {
    expect(buildNombreCompletoCr({ nombre: ' Ana ', apellido1: 'Mora', apellido2: '' })).toBe('Mora Ana');
    expect(buildNombreCompletoCr({ nombre: null, apellido1: undefined, apellido2: '  ' })).toBe('');
    expect(buildNombreCompletoCr({ nombre: 'Ana María', apellido1: 'Solís', apellido2: 'Mora' })).toBe('Solís Mora Ana María');
  });

  it('ida y vuelta parse(build(x)) conserva el nombre completo', () => {
    const p = { nombre: 'Luis Diego', apellido1: 'Araya', apellido2: 'Vargas' };
    expect(parseNombreCompletoCr(buildNombreCompletoCr(p))).toMatchObject(p);
  });
});

describe('cupoSeccionError', () => {
  it.each([
    [{ message: 'Se superó el máximo de 25 estudiantes' }, true],
    [{ message: 'MAXIMO DE 25' }, true],
    [{ detail: 'máximo de 25' }, true],
    [{ code: 'P0001', message: 'Sección llena: 25' }, true],
    [{ code: 'P0001', message: 'otro error' }, false],
    [{ code: '23505', message: 'duplicate key 25 seccion' }, false],
    [null, false],
    ['máximo de 25', false],
    [{}, false],
  ])('isCupoSeccionDbError(%j) = %s', (e, r) => expect(isCupoSeccionDbError(e)).toBe(r));

  it('throwCupoSeccionConflict lanza AppError 409 con legacyJson', () => {
    try {
      throwCupoSeccionConflict();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e.statusCode).toBe(409);
      expect(e.legacyJson).toEqual({ status: 'error', message: MSG_CUPO_SECCION });
    }
  });

  it('rethrowIfCupoSeccion convierte cupo en 409 y relanza el resto tal cual', () => {
    expect(() => rethrowIfCupoSeccion({ message: 'máximo de 25' })).toThrow(MSG_CUPO_SECCION);
    const otro = new Error('x');
    expect(() => rethrowIfCupoSeccion(otro)).toThrow(otro);
  });

  it('handleMatriculaWriteError: AppError pasa, cupo → 409, resto → 500 con mensaje por defecto o propio', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new AppError('ya', 422);
    expect(() => handleMatriculaWriteError(app)).toThrow(app);
    expect(() => handleMatriculaWriteError({ message: 'maximo de 25' })).toThrow(MSG_CUPO_SECCION);
    try {
      handleMatriculaWriteError(new Error('db'));
    } catch (e) {
      expect(e.statusCode).toBe(500);
      expect(e.message).toBe('Error al procesar la matrícula');
      expect(e.legacyJson.error).toBe('Error al procesar la matrícula');
    }
    expect(() => handleMatriculaWriteError(new Error('db'), 'Otro')).toThrow('Otro');
  });
});

describe('AppError', () => {
  it('valores por defecto y opciones', () => {
    const e = new AppError('m');
    expect(e.statusCode).toBe(500);
    expect(e.name).toBe('AppError');
    expect(e.details).toBeUndefined();
    const e2 = new AppError('m', 400, { details: { a: 1 }, legacyJson: { x: 1 } });
    expect(e2.details).toEqual({ a: 1 });
    expect(e2.legacyJson).toEqual({ x: 1 });
    expect(new AppError('m', 400, 'no-objeto').details).toBeUndefined();
    expect(e).toBeInstanceOf(Error);
  });
});

describe('asyncHandler', () => {
  it('pasa errores async a next', async () => {
    const err = new Error('boom');
    const next = vi.fn();
    asyncHandler(async () => {
      throw err;
    })({}, {}, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(err);
  });
  it('no llama next si resuelve; soporta funciones síncronas', async () => {
    const next = vi.fn();
    asyncHandler(() => 1)({}, {}, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).not.toHaveBeenCalled();
  });
  it('error síncrono NO es capturado (se lanza antes de Promise.resolve)', () => {
    const next = vi.fn();
    expect(() =>
      asyncHandler(() => {
        throw new Error('sync');
      })({}, {}, next)
    ).toThrow('sync');
  });
});

describe('cookieEncryption', () => {
  it('sin clave: cifrar lanza, descifrar devuelve null', () => {
    expect(() => cifrarCookie('a')).toThrow(/COOKIE_ENCRYPTION_KEY/);
    expect(descifrarCookie('AAAA')).toBeNull();
  });

  it.each(['clave-corta-16ch', 'x'.repeat(32), 'y'.repeat(80)])('ida y vuelta con clave %s', (k) => {
    process.env.COOKIE_ENCRYPTION_KEY = k;
    const jwt = 'eyJhbGciOi.payload.firma-ñ-ü';
    const c = cifrarCookie(jwt);
    expect(c).not.toContain('payload');
    expect(descifrarCookie(c)).toBe(jwt);
  });

  it('IV aleatorio: dos cifrados del mismo valor difieren', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'k'.repeat(40);
    expect(cifrarCookie('v')).not.toBe(cifrarCookie('v'));
  });

  it('valor manipulado, corto, no-string o con otra clave → null', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'k'.repeat(40);
    const c = cifrarCookie('secreto');
    const buf = Buffer.from(c, 'base64');
    buf[buf.length - 1] ^= 1;
    expect(descifrarCookie(buf.toString('base64'))).toBeNull();
    expect(descifrarCookie('YWJj')).toBeNull();
    expect(descifrarCookie(null)).toBeNull();
    expect(descifrarCookie(123)).toBeNull();
    process.env.COOKIE_ENCRYPTION_KEY = 'z'.repeat(40);
    expect(descifrarCookie(c)).toBeNull();
  });

  it('dos claves que comparten los primeros 32 caracteres son equivalentes (se trunca)', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'a'.repeat(32) + 'XXXX';
    const c = cifrarCookie('v');
    process.env.COOKIE_ENCRYPTION_KEY = 'a'.repeat(32) + 'YYYY';
    expect(descifrarCookie(c)).toBe('v');
  });

  it('CORREGIDO D-09: clave ≥32 caracteres con multibyte (ñ, tildes) ya permite cifrar y descifrar', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'contraseña-del-año-'.repeat(2); // 38 caracteres, >32 bytes en sus primeros 32 chars
    expect(descifrarCookie(cifrarCookie('jwt'))).toBe('jwt');
  });

  it('compatibilidad: con una clave ASCII la clave derivada es la misma que antes (las cookies existentes siguen siendo válidas)', async () => {
    const crypto = await import('node:crypto');
    const clave = 'a'.repeat(40);
    process.env.COOKIE_ENCRYPTION_KEY = clave;
    const cifrado = Buffer.from(cifrarCookie('jwt'), 'base64');
    const iv = cifrado.subarray(0, 12);
    const tag = cifrado.subarray(12, 28);
    const datos = cifrado.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(clave.slice(0, 32), 'utf8'), iv, { authTagLength: 16 });
    d.setAuthTag(tag);
    expect(Buffer.concat([d.update(datos), d.final()]).toString('utf8')).toBe('jwt');
  });

  it('CORREGIDO D-09 (expectativa correcta): cualquier clave válida debería permitir cifrar', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'ñ'.repeat(32);
    expect(descifrarCookie(cifrarCookie('jwt'))).toBe('jwt');
  });
});

describe('cookieOptions', () => {
  it('desarrollo: lax, no secure; maxAge solo si es número > 0', () => {
    expect(esProduccion()).toBe(false);
    expect(cookieAuthOptions()).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
    expect(cookieAuthOptions({ maxAgeMs: 1000 }).maxAge).toBe(1000);
    expect(cookieAuthOptions({ maxAgeMs: 0 })).not.toHaveProperty('maxAge');
    expect(cookieAuthOptions({ maxAgeMs: '1000' })).not.toHaveProperty('maxAge');
    expect(cookieAuthOptions({ maxAgeMs: -5 })).not.toHaveProperty('maxAge');
  });
  it('producción: secure + none; clear coincide con auth (sin maxAge)', () => {
    process.env.NODE_ENV = 'production';
    expect(cookieAuthOptions()).toEqual({ httpOnly: true, secure: true, sameSite: 'none', path: '/' });
    expect(cookieClearOptions()).toEqual(cookieAuthOptions());
  });
});

describe('corsConfig', () => {
  it('lista desde FRONTEND_ORIGIN separada por comas (recorta y filtra vacíos)', () => {
    process.env.FRONTEND_ORIGIN = ' https://a.com , ,https://b.com';
    expect(obtenerOrigenesCorsPermitidos()).toEqual(['https://a.com', 'https://b.com']);
  });
  it('usa CORS_ORIGIN como respaldo', () => {
    process.env.CORS_ORIGIN = 'https://c.com';
    expect(obtenerOrigenesCorsPermitidos()).toEqual(['https://c.com']);
  });
  it('sin variables: dev → localhost Vite; prod → []', () => {
    expect(obtenerOrigenesCorsPermitidos()).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
    process.env.NODE_ENV = 'production';
    expect(obtenerOrigenesCorsPermitidos()).toEqual([]);
  });
  it('callback: sin origin permite; permitido permite; otro rechaza con error', () => {
    const cb = vi.fn();
    corsOriginCallback(undefined, cb);
    expect(cb).toHaveBeenLastCalledWith(null, true);
    corsOriginCallback('http://localhost:5173', cb);
    expect(cb).toHaveBeenLastCalledWith(null, true);
    corsOriginCallback('http://evil.com', cb);
    expect(cb.mock.lastCall[0]).toBeInstanceOf(Error);
    expect(cb.mock.lastCall[0].message).toBe('Origen CORS no permitido: http://evil.com');
  });
  it('coincidencia exacta: no acepta subdominios ni barra final', () => {
    process.env.FRONTEND_ORIGIN = 'https://app.com';
    const cb = vi.fn();
    corsOriginCallback('https://app.com/', cb);
    expect(cb.mock.lastCall[0]).toBeInstanceOf(Error);
    corsOriginCallback('https://app.com.evil.com', cb);
    expect(cb.mock.lastCall[0]).toBeInstanceOf(Error);
  });
});

describe('validateEnv.validarSeguridadEntorno', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('desarrollo con secretos débiles: solo advierte (2 advertencias)', () => {
    expect(() => validarSeguridadEntorno()).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('producción con secretos débiles y sin origen → lanza', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'changeme';
    expect(() => validarSeguridadEntorno()).toThrow(/Variables de entorno inseguras/);
    expect(console.error).toHaveBeenCalled();
  });

  it('producción con todo correcto → no lanza ni advierte', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a8f7d6s5a4f3g2h1j0k9';
    process.env.COOKIE_ENCRYPTION_KEY = 'q1w2e3r4t5y6u7i8o9p0';
    process.env.FRONTEND_ORIGIN = 'https://app.com';
    expect(() => validarSeguridadEntorno()).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('valores por defecto conocidos de ≥16 chars se rechazan (también con mayúsculas/espacios)', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_ORIGIN = 'https://app.com';
    process.env.JWT_SECRET = 'q1w2e3r4t5y6u7i8o9p0';
    process.env.COOKIE_ENCRYPTION_KEY = '  CLAVE-CIFRADO-COOKIES-32-CHARS-MINIMO ';
    expect(() => validarSeguridadEntorno()).toThrow();
  });

  it('producción: origen solo con espacios cuenta como ausente', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a8f7d6s5a4f3g2h1j0k9';
    process.env.COOKIE_ENCRYPTION_KEY = 'q1w2e3r4t5y6u7i8o9p0';
    process.env.FRONTEND_ORIGIN = '   ';
    expect(() => validarSeguridadEntorno()).toThrow();
  });

  it('secreto de 16 caracteres repetidos ("aaaaaaaaaaaaaaaa") se acepta — no mide entropía', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(16);
    process.env.COOKIE_ENCRYPTION_KEY = 'b'.repeat(16);
    process.env.FRONTEND_ORIGIN = 'https://x.com';
    expect(() => validarSeguridadEntorno()).not.toThrow();
  });
});

describe('errorHandler / notFound', () => {
  const fakeRes = (headersSent = false) => {
    const res = { headersSent };
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  };

  it('notFound: incluye la URL en desarrollo y la oculta en producción', () => {
    const next = vi.fn();
    notFound({ originalUrl: '/api/x' }, {}, next);
    expect(next.mock.lastCall[0].message).toBe('Ruta no encontrada: /api/x');
    expect(next.mock.lastCall[0].statusCode).toBe(404);
    process.env.NODE_ENV = 'production';
    notFound({ originalUrl: '/api/x' }, {}, next);
    expect(next.mock.lastCall[0].message).toBe('Ruta no encontrada');
  });

  it('AppError 400 con details (dev) → payload completo', () => {
    const res = fakeRes();
    errorHandler(new AppError('malo', 400, { details: { campo: 'x' } }), {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'malo', code: 400, error: 'malo', details: { campo: 'x' } });
  });

  it('details se omite en producción; 500 oculta el mensaje en producción', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    errorHandler(new AppError('malo', 400, { details: 1 }), {}, res, vi.fn());
    expect(res.json.mock.lastCall[0]).not.toHaveProperty('details');
    errorHandler(new Error('stack interno SQL'), {}, res, vi.fn());
    expect(res.json.mock.lastCall[0].message).toBe('Error interno del servidor');
  });

  it('err.code numérico se usa como status; code string (pg) no', () => {
    const res = fakeRes();
    errorHandler({ message: 'x', code: 418 }, {}, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(418);
    errorHandler({ message: 'x', code: '23505' }, {}, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(500);
    errorHandler({ message: 'x', statusCode: 302 }, {}, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(500);
    errorHandler({ message: 'x', statusCode: 600 }, {}, res, vi.fn());
    expect(res.status).toHaveBeenLastCalledWith(500);
  });

  it('error CORS → 403 "Origen no permitido"', () => {
    const res = fakeRes();
    errorHandler(new Error('Origen CORS no permitido: http://e.com'), {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.lastCall[0].message).toBe('Origen no permitido');
  });

  it('legacyJson se responde tal cual', () => {
    const res = fakeRes();
    errorHandler(new AppError('m', 409, { legacyJson: { status: 'error', message: 'cupo' } }), {}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'cupo' });
  });

  it('headersSent → delega a next(err)', () => {
    const res = fakeRes(true);
    const next = vi.fn();
    const err = new Error('x');
    errorHandler(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('err null/undefined → 500 genérico sin lanzar', () => {
    const res = fakeRes();
    errorHandler(undefined, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.lastCall[0].message).toBe('Error interno del servidor');
  });
});
