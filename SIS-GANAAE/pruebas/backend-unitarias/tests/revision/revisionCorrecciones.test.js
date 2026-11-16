/**
 * Revisión de las correcciones del backend (ronda posterior a QA).
 * Prueba bordes de cada corrección y posibles regresiones en otros llamadores.
 * BD simulada (helpers/dbMock.js); nunca se conecta a una BD real.
 * Las pruebas marcadas [HALLAZGO-CORREGIDO] fallan a propósito: documentan un defecto real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import * as DB from '../helpers/dbMock.js';
import { resolverEpi, fila, filaDet, argsDe } from '../helpers/epiFixtures.js';
import { generarPdf, extraerTexto } from '../helpers/pdf.js';

import { obtenerDashboardHijo } from '../../../../backend-node/src/services/padresDashboardService.js';
import { cifrarCookie, descifrarCookie } from '../../../../backend-node/src/utils/cookieEncryption.js';
import { etiquetaRolPersona, puedeVerReportesEpi } from '../../../../backend-node/src/utils/roles.js';
import { parseFechaNacimiento } from '../../../../backend-node/src/utils/csvPrecarga.js';
import { obtenerOAsignarSeccion } from '../../../../backend-node/src/utils/seccionHelper.js';
import { fechaDiaAnterior } from '../../../../backend-node/src/utils/sustitucionHelper.js';
import { errorHandler } from '../../../../backend-node/src/middlewares/errorHandler.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import * as TR from '../../../../backend-node/src/services/tokenRevocationService.js';
import { verificarTokenInterno, verificarTokenCambioContrasena } from '../../../../backend-node/src/middlewares/verificarToken.js';
import {
  calcularRangoPeriodo,
  obtenerReporteAsistenciaEpi,
  listarEstudiantesSeccionEpi,
} from '../../../../backend-node/src/services/epiReportesService.js';
import { pipeReporteAsistenciaEpiPdf } from '../../../../backend-node/src/services/pdfService.js';

const TZ0 = process.env.TZ;
const KEY0 = process.env.COOKIE_ENCRYPTION_KEY;
beforeEach(() => {
  DB.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (TZ0 === undefined) delete process.env.TZ;
  else process.env.TZ = TZ0;
  if (KEY0 === undefined) delete process.env.COOKIE_ENCRYPTION_KEY;
  else process.env.COOKIE_ENCRYPTION_KEY = KEY0;
});

const fakeRes = () => {
  const res = { headersSent: false };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

// ─────────────────────────── padresDashboardService (zona horaria) ───────────────────────────
describe('padresDashboardService: "hoy" en hora de Costa Rica con el servidor en UTC', () => {
  const resolverPadres = (q) => {
    if (q.tabla === 'matricula as m') return q.ops.some((o) => o.op === 'leftJoin') ? { anio_curso_lectivo: 2026 } : { ok: 1 };
    if (q.tabla === 'persona') return { id_persona: 5, nombre_completo: 'Hijo', cedula: '1' };
    if (q.tabla === 'persona as p') return { id_persona: 5, nombre_completo: 'Hijo', cedula: '1' };
    if (q.tabla === 'estado_estudiante_periodo') return [];
    if (q.tabla === 'asistencia as a') return [];
    return undefined;
  };

  it('servidor UTC, 14/11/2026 10:00 hora CR: funciona igual que antes', async () => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T16:00:00Z'));
    DB.setResolver(resolverPadres);
    const r = await obtenerDashboardHijo(1, 5);
    expect(r.rango_mes).toEqual({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
  });

  it('[HALLAZGO-CORREGIDO] servidor UTC, 31/12/2026 20:00 hora CR (01/01/2027 02:00 UTC): el dashboard del encargado no debería fallar', async () => {
    // inicioAnioLectivo() usa el año del servidor (2027-01-01) y hoyIso() el de CR (2026-12-31):
    // parseRangoFechas lanza 400 "fecha_inicio no puede ser posterior a fecha_fin".
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-01T02:00:00Z'));
    DB.setResolver(resolverPadres);
    const r = await obtenerDashboardHijo(1, 5).catch((e) => e);
    expect(r).not.toBeInstanceOf(Error);
  });

  it('[HALLAZGO-CORREGIDO] servidor UTC, 30/11/2026 20:00 hora CR: el resumen del mes debería ser noviembre (el mes de "hoy")', async () => {
    // inicioMesActual()/finMesActual() siguen en la hora del servidor → ya devuelven diciembre.
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T02:00:00Z'));
    DB.setResolver(resolverPadres);
    const r = await obtenerDashboardHijo(1, 5);
    expect(r.rango_mes).toEqual({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
  });
});

// ─────────────────────────── cookieEncryption ───────────────────────────
describe('cookieEncryption: 32 bytes de clave', () => {
  const descifrarConClave = (valor, clave) => {
    const buf = Buffer.from(valor, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', clave, buf.subarray(0, 12), { authTagLength: 16 });
    d.setAuthTag(buf.subarray(12, 28));
    return d.update(buf.subarray(28)) + d.final('utf8');
  };

  it('clave ASCII ≥ 32: la clave derivada es idéntica a la anterior (cookies existentes siguen válidas)', () => {
    const clave = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
    process.env.COOKIE_ENCRYPTION_KEY = clave;
    const c = cifrarCookie('jwt.de.prueba');
    // Derivación anterior: Buffer.from(key.slice(0, 32), 'utf8')
    expect(descifrarConClave(c, Buffer.from(clave.slice(0, 32), 'utf8'))).toBe('jwt.de.prueba');
  });

  it('clave ASCII de exactamente 32 caracteres → ida y vuelta', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'x'.repeat(32);
    expect(descifrarCookie(cifrarCookie('hola'))).toBe('hola');
  });

  it('clave con multibyte (ñ, tildes) ≥ 32 caracteres ya no rompe AES', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'ñandú-canción-pingüino-árbol-café-ÑÁÉÍÓÚ';
    expect(descifrarCookie(cifrarCookie('hola'))).toBe('hola');
  });

  it('clave multibyte cuyo byte 32 cae a mitad de un carácter → ida y vuelta correcta', () => {
    process.env.COOKIE_ENCRYPTION_KEY = `${'a'.repeat(31)}ñ${'b'.repeat(10)}`;
    expect(descifrarCookie(cifrarCookie('hola'))).toBe('hola');
  });

  it('clave corta (< 32) sigue derivándose con SHA-256', () => {
    process.env.COOKIE_ENCRYPTION_KEY = 'corta';
    const c = cifrarCookie('hola');
    expect(descifrarConClave(c, crypto.createHash('sha256').update('corta').digest())).toBe('hola');
  });
});

// ─────────────────────────── roles ───────────────────────────
describe('roles.etiquetaRolPersona / puedeVerReportesEpi', () => {
  it('propiedades heredadas de Object.prototype no se devuelven como etiqueta', () => {
    expect(etiquetaRolPersona('toString')).toBe('toString');
    expect(etiquetaRolPersona('constructor')).toBe('constructor');
    expect(etiquetaRolPersona('hasOwnProperty')).toBe('hasOwnProperty');
    expect(typeof etiquetaRolPersona('__proto__')).toBe('string');
  });
  it('etiquetas conocidas sin cambios + EPI', () => {
    expect(etiquetaRolPersona('profesor')).toBe('Profesor');
    expect(etiquetaRolPersona('padre_de_familia')).toBe('Encargado');
    expect(etiquetaRolPersona('epi')).toBe('Equipo de Permanencia Estudiantil');
    expect(etiquetaRolPersona('rol_nuevo')).toBe('rol nuevo');
    expect(etiquetaRolPersona(null)).toBe('');
  });
  it('puedeVerReportesEpi: epi, administrador, super_administrador; no orientador/profesor/padre', () => {
    expect(['epi', 'administrador', 'super_administrador'].every(puedeVerReportesEpi)).toBe(true);
    expect(['orientador', 'profesor', 'padre_de_familia', 'EPI', undefined, ''].some(puedeVerReportesEpi)).toBe(false);
  });
});

// ─────────────────────────── csvPrecarga.parseFechaNacimiento ───────────────────────────
describe('csvPrecarga.parseFechaNacimiento', () => {
  it.each([
    ['2010-01-01', '2010-01-01'],
    ['2010-01-01 00:00:00', '2010-01-01'],
    ['2010-01-01T00:00:00.000Z', '2010-01-01'],
    ['2012-02-29', '2012-02-29'],
    ['29/02/2012', '2012-02-29'],
    ['1/2/2010', '2010-02-01'],
    ['  05-03-2011 ', '2011-03-05'],
  ])('válida: %s → %s', (entrada, esperado) => {
    expect(parseFechaNacimiento(entrada)).toBe(esperado);
  });

  it.each(['2010-02-29', '2010-13-01', '2010-00-10', '2010-04-31', '31/02/2010', '00/01/2010', '2010-01-01abc', 'abc', '', null])(
    'inválida: %s → null',
    (entrada) => {
      expect(parseFechaNacimiento(entrada)).toBeNull();
    }
  );

  it('fecha ISO con desfase horario se sigue aceptando (como antes de la corrección D-14)', () => {
    expect(parseFechaNacimiento('2010-01-01T00:00:00-06:00')).toBe('2010-01-01');
    expect(parseFechaNacimiento('2010-01-01T00:00:00+0530')).toBe('2010-01-01');
  });

  it('[HALLAZGO-CORREGIDO] el año 0000 no existe en PostgreSQL: debería rechazarse en la validación del CSV', () => {
    // fechaExiste('0000','01','01') devuelve true → la fila pasa la validación y falla al insertar en BD.
    expect(parseFechaNacimiento('0000-01-01')).toBeNull();
    expect(parseFechaNacimiento('01/01/0000')).toBeNull();
  });
});

// ─────────────────────────── seccionHelper ───────────────────────────
describe('seccionHelper.obtenerOAsignarSeccion: número de la nueva sección', () => {
  function trxCon(secciones, llenas = true) {
    const inserts = [];
    DB.setResolver((q) => {
      if (q.tabla === 'seccion' && q.ops.some((o) => o.op === 'insert')) {
        inserts.push(argsDe(q, 'insert')[0][0]);
        return [{ id_seccion: 999 }];
      }
      if (q.tabla === 'seccion') return secciones;
      if (q.tabla === 'matricula') return { total: llenas ? 25 : 3 };
      return undefined;
    });
    return { trx: DB.db, inserts };
  }

  it('sin secciones → 1', async () => {
    const { trx, inserts } = trxCon([]);
    await obtenerOAsignarSeccion(trx, 1, 'septimo');
    expect(inserts[0]).toEqual({ numero_seccion: 1, nombre_seccion: '7-1' });
  });

  it('hueco (7-1, 7-3 llenas) → 7-4, no repite 7-3', async () => {
    const { trx, inserts } = trxCon([
      { id_seccion: 1, nombre_seccion: '7-1', numero_seccion: 1 },
      { id_seccion: 3, nombre_seccion: '7-3', numero_seccion: 3 },
    ]);
    await obtenerOAsignarSeccion(trx, 1, 'septimo');
    expect(inserts[0].nombre_seccion).toBe('7-4');
  });

  it('nombres sin sufijo numérico usan numero_seccion; nunca menor que la cantidad + 1', async () => {
    const { trx, inserts } = trxCon([
      { id_seccion: 1, nombre_seccion: '10-A', numero_seccion: null },
      { id_seccion: 2, nombre_seccion: '10-B', numero_seccion: null },
    ]);
    await obtenerOAsignarSeccion(trx, 1, 'decimo');
    expect(inserts[0].nombre_seccion).toBe('10-3');
  });

  it('una sección con cupo se reutiliza (no se crea otra)', async () => {
    const { trx, inserts } = trxCon([{ id_seccion: 8, nombre_seccion: '8-1', numero_seccion: 1 }], false);
    expect(await obtenerOAsignarSeccion(trx, 1, 'octavo')).toBe(8);
    expect(inserts).toHaveLength(0);
  });
});

// ─────────────────────────── sustitucionHelper.fechaDiaAnterior ───────────────────────────
describe('sustitucionHelper.fechaDiaAnterior en varias zonas horarias', () => {
  it.each(['UTC', 'America/Costa_Rica', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Sao_Paulo'])('TZ=%s', (tz) => {
    process.env.TZ = tz;
    expect(fechaDiaAnterior('2026-03-01')).toBe('2026-02-28');
    expect(fechaDiaAnterior('2024-03-01')).toBe('2024-02-29');
    expect(fechaDiaAnterior('2026-01-01')).toBe('2025-12-31');
    expect(fechaDiaAnterior('2026-11-14T23:59:00')).toBe('2026-11-13');
    expect(fechaDiaAnterior('')).toBe('');
  });
});

// ─────────────────────────── errorHandler ───────────────────────────
describe('errorHandler: 5xx no controlados no exponen el mensaje interno', () => {
  const correr = (err, env = 'development') => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    const res = fakeRes();
    try {
      errorHandler(err, { method: 'GET', originalUrl: '/x' }, res, vi.fn());
    } finally {
      process.env.NODE_ENV = prev;
    }
    return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
  };

  it('Error de PostgreSQL (dev) → 500 genérico y se registra en el log', () => {
    const r = correr(new Error('relation "persona" does not exist'));
    expect(r.status).toBe(500);
    expect(r.body.message).toBe('Error interno del servidor');
    expect(console.error).toHaveBeenCalled();
  });

  it('AppError 500 conserva su mensaje (intencional) en desarrollo', () => {
    expect(correr(new AppError('No hay curso lectivo activo', 500)).body.message).toBe('No hay curso lectivo activo');
  });

  it('AppError 4xx y Error con statusCode 4xx conservan el mensaje (dev y prod)', () => {
    expect(correr(new AppError('Periodo inválido', 400), 'production').body.message).toBe('Periodo inválido');
    const e = new Error('No encontrado');
    e.statusCode = 404;
    expect(correr(e, 'production').body).toMatchObject({ code: 404, message: 'No encontrado' });
  });

  it('CORS sigue respondiendo 403 "Origen no permitido"', () => {
    const r = correr(new Error('Origen CORS no permitido: http://malo'));
    expect(r).toMatchObject({ status: 403, body: { message: 'Origen no permitido' } });
  });

  it('riesgo documentado: Error con .status (no .statusCode) que llega al errorHandler se vuelve 500 genérico', () => {
    // Patrón usado por varios servicios (err.status = 400/403/404). Si se lanzan desde una ruta con asyncHandler
    // sin try/catch propio, el cliente recibe 500 y ahora (también en desarrollo) sin el mensaje.
    const e = new Error('id inválido');
    e.status = 400;
    expect(correr(e)).toMatchObject({ status: 500, body: { message: 'Error interno del servidor' } });
  });

  it('legacyJson se responde tal cual aun en 5xx', () => {
    const e = new AppError('x', 503, { legacyJson: { error: 'mantenimiento' } });
    expect(correr(e)).toEqual({ status: 503, body: { error: 'mantenimiento' } });
  });
});

// ─────────────────────────── revocación fail-closed ───────────────────────────
describe('verificarToken: revocación fail-closed (503)', () => {
  const persona = { id_persona: 10, nombre_rol: 'epi', correo: 'a@b.c', persona_activa: true, cuenta_activa: true };
  const correr = async (mw, cookies, params = {}) => {
    const req = { cookies, params };
    const res = fakeRes();
    const next = vi.fn();
    await mw(req, res, next);
    return { res, next };
  };
  beforeEach(() => {
    process.env.COOKIE_ENCRYPTION_KEY = 'clave-de-prueba-revision-0123456789';
  });

  it('falla la consulta de jwt_revocado → 503 (no 401: el frontend no cierra la sesión) y no llama next', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'jwt_revocado') throw new Error('timeout');
      if (q.tabla === 'persona as p') return persona;
      return undefined;
    });
    const jwt = TR.firmarTokenAcceso({ id: 10, rol: 'epi' });
    const { res, next } = await correr(verificarTokenInterno, { token: cifrarCookie(jwt) });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('cambio de contraseña con token pendiente: misma regla 503', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'jwt_revocado') throw new Error('timeout');
      if (q.tabla === 'persona as p') return persona;
      return undefined;
    });
    const jwt = TR.firmarTokenPendientePassword(10);
    const { res, next } = await correr(verificarTokenCambioContrasena, { pending_password_change: cifrarCookie(jwt) }, { id: '10' });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('token sin jti (migración suave) no consulta la tabla: sigue funcionando aunque la BD de revocación falle', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'jwt_revocado') throw new Error('no debería consultarse');
      if (q.tabla === 'persona as p') return persona;
      return undefined;
    });
    const { createRequire } = await import('node:module');
    const jwt = createRequire(import.meta.url)('../../../../backend-node/node_modules/jsonwebtoken');
    const cfg = (await import('../../../../backend-node/configjwt.js')).default;
    const sinJti = jwt.sign({ id: 10, rol: 'epi' }, cfg.jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
    const { next } = await correr(verificarTokenInterno, { token: cifrarCookie(sinJti) });
    expect(next).toHaveBeenCalledWith();
  });

  it('se recupera: tras un fallo, la siguiente consulta correcta deja pasar', async () => {
    let falla = true;
    DB.setResolver((q) => {
      if (q.tabla === 'jwt_revocado') {
        if (falla) throw new Error('caída');
        return undefined;
      }
      if (q.tabla === 'persona as p') return persona;
      return undefined;
    });
    const cookie = cifrarCookie(TR.firmarTokenAcceso({ id: 10, rol: 'epi' }));
    expect((await correr(verificarTokenInterno, { token: cookie })).res.status).toHaveBeenCalledWith(503);
    falla = false;
    expect((await correr(verificarTokenInterno, { token: cookie })).next).toHaveBeenCalledWith();
  });
});

// ─────────────────────────── EPI: validación estricta ───────────────────────────
describe('epiReportesService.calcularRangoPeriodo: bordes', () => {
  const status = (fn) => {
    try {
      fn();
      return 'ok';
    } catch (e) {
      return e.statusCode;
    }
  };

  it('periodo normalizado: " MENSUAL ", "Semanal"', () => {
    expect(calcularRangoPeriodo({ periodo: ' MENSUAL ', fecha_referencia: '2026-02-10' })).toEqual({
      periodo: 'mensual', fecha_inicio: '2026-02-01', fecha_fin: '2026-02-28',
    });
    expect(calcularRangoPeriodo({ periodo: 'Semanal', fecha_referencia: '2026-11-15' })).toMatchObject({
      fecha_inicio: '2026-11-09', fecha_fin: '2026-11-15',
    });
  });

  it('formas que envía el frontend (fecha_referencia AAAA-MM-01 / AAAA-01-01) siguen funcionando', () => {
    expect(calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: '2024-02-01' }).fecha_fin).toBe('2024-02-29');
    expect(calcularRangoPeriodo({ periodo: 'anual', fecha_referencia: '2026-01-01' })).toMatchObject({
      fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31',
    });
  });

  it('valores no simples o desconocidos → 400 (nunca 500)', () => {
    for (const q of [
      { periodo: ['mensual'] },
      { periodo: { a: 1 } },
      { periodo: 'trimestral' },
      { periodo: 'mensual', fecha_referencia: ['2026-01-01', '2026-02-01'] },
      { periodo: 'mensual', fecha_referencia: '2026-02-30' },
      { periodo: 'mensual', fecha_referencia: '-01' }, // input type=month vacío en el frontend
      { periodo: 'personalizado' },
      { periodo: 'personalizado', fecha_inicio: '2026-01-02', fecha_fin: '2026-01-01' },
      { periodo: 'personalizado', fecha_inicio: '0000-01-01', fecha_fin: '0000-01-02' },
      { periodo: 'semanal', fecha_referencia: '9999-12-31' }, // el domingo cae en el año 10000
    ]) {
      expect(status(() => calcularRangoPeriodo(q)), JSON.stringify(q)).toBe(400);
    }
  });

  it('personalizado: 366 días se acepta (año bisiesto), 367 no', () => {
    expect(status(() => calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' }))).toBe('ok');
    expect(status(() => calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2025-01-01', fecha_fin: '2026-01-01' }))).toBe('ok');
    expect(status(() => calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2025-01-01', fecha_fin: '2026-01-02' }))).toBe(400);
  });

  it('años límite: 0001 semanal empieza el lunes 0001-01-01; 9999 mensual/anual válidos', () => {
    expect(calcularRangoPeriodo({ periodo: 'semanal', fecha_referencia: '0001-01-03' })).toMatchObject({
      fecha_inicio: '0001-01-01', fecha_fin: '0001-01-07',
    });
    expect(calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: '9999-12-05' }).fecha_fin).toBe('9999-12-31');
    expect(calcularRangoPeriodo({ periodo: 'anual', fecha_referencia: '0050-06-01' }).fecha_inicio).toBe('0050-01-01');
  });

  it('"hoy" por defecto en hora CR aunque el servidor esté en UTC (14/11 20:00 CR = 15/11 UTC)', () => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T02:00:00Z')); // 30/11/2026 20:00 CR
    expect(calcularRangoPeriodo({ periodo: 'mensual' })).toMatchObject({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
    expect(calcularRangoPeriodo({})).toMatchObject({ periodo: 'mensual', fecha_inicio: '2026-11-01' });
  });
});

describe('epiReportesService: ids, anio y totales', () => {
  it('ids: sólo dígitos y dentro de int4', async () => {
    DB.setResolver(resolverEpi());
    for (const id of ['0', '-1', '+5', '1e3', '1.0', '0x10', '2147483648', '99999999999999999999']) {
      const e = await obtenerReporteAsistenciaEpi({ id_seccion: id }).catch((x) => x);
      expect(e.statusCode, id).toBe(400);
    }
    const ok = await obtenerReporteAsistenciaEpi({ id_seccion: ' 2147483647 ', id_materia: '' });
    expect(ok.filtros).toMatchObject({ id_seccion: 2147483647, id_materia: null });
  });

  it('anio de listarEstudiantesSeccionEpi', async () => {
    DB.setResolver(resolverEpi());
    for (const anio of ['0000', '12345', '26', 'abc', ['2026'], '2026-01']) {
      const e = await listarEstudiantesSeccionEpi('3', { anio }).catch((x) => x);
      expect(e.statusCode, String(anio)).toBe(400);
    }
    expect((await listarEstudiantesSeccionEpi('3', { anio: ' 2026 ' })).anio).toBe(2026);
    expect((await listarEstudiantesSeccionEpi('3', { anio: '' })).anio).toBeGreaterThan(2000);
  });

  it('% con aritmética entera: 203/400 → 50.8; 1/3 → 33.3; 2/3 → 66.7; 1/8 → 12.5', async () => {
    const casos = [
      [203, 400, 50.8],
      [1, 3, 33.3],
      [2, 3, 66.7],
      [1, 8, 12.5],
      [0, 5, 0],
    ];
    for (const [pres, total, esperado] of casos) {
      DB.setResolver(
        resolverEpi({
          agregadas: [fila(1, '7-1', 1, 'Mate', 'presente', pres), fila(1, '7-1', 1, 'Mate', 'ausente', total - pres)].filter(
            (f) => f.cantidad > 0
          ),
        })
      );
      const r = await obtenerReporteAsistenciaEpi({ fecha_referencia: '2026-11-01' });
      expect(r.resumen_general.porcentaje_asistencia, `${pres}/${total}`).toBe(esperado);
    }
  });

  it('catalogos.secciones en orden natural; id_estudiante sólo resuelve personas estudiante', async () => {
    DB.setResolver(
      resolverEpi({
        secciones: [
          { id_seccion: 3, nombre_seccion: '10-1' },
          { id_seccion: 4, nombre_seccion: '11-3' },
          { id_seccion: 1, nombre_seccion: '7-1' },
          { id_seccion: 2, nombre_seccion: '7-10' },
          { id_seccion: 5, nombre_seccion: '7-2' },
        ],
        persona: undefined,
      })
    );
    const r = await obtenerReporteAsistenciaEpi({ id_estudiante: '9' });
    expect(r.catalogos.secciones.map((s) => s.nombre_seccion)).toEqual(['7-1', '7-2', '7-10', '10-1', '11-3']);
    const consultaPersona = DB.llamadas.find((l) => l.tabla === 'persona');
    expect(argsDe(consultaPersona, 'where')[0][0]).toEqual({ id_persona: 9, nombre_rol: 'estudiante' });
    expect(r.filtros.nombre_estudiante).toBeNull();
  });
});

// ─────────────────────────── PDF EPI ───────────────────────────
describe('pipeReporteAsistenciaEpiPdf: bordes de las correcciones', () => {
  const totales = (p = 1, o = 0) => ({
    total: p + o, presentes: p, tardias: 0, ausencias_justificadas: 0, ausencias_injustificadas: 0, otros: o,
    porcentaje_asistencia: p + o ? Math.round((p * 1000) / (p + o)) / 10 : 0,
  });
  const base = (extra = {}) => ({
    filtros: { periodo: 'mensual', periodo_label: 'Mensual', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' },
    resumen_general: totales(),
    secciones: [{ id_seccion: 1, nombre_seccion: '7-1', totales: totales(), materias: [{ id_materia: 1, nombre_materia: 'Mate', totales: totales() }] }],
    ...extra,
  });

  it('textos con emoji / pares sustitutos y nombres muy largos no rompen la generación', async () => {
    const largo = '😀'.repeat(200) + 'Ñandú'.repeat(100);
    const rep = base({
      secciones: [{ id_seccion: 1, nombre_seccion: largo, totales: totales(), materias: [{ id_materia: 1, nombre_materia: largo, totales: totales() }] }],
      detalle_diario: [
        { fecha: '2026-11-02', secciones: [{ nombre_seccion: largo, registros: [{ id_estudiante: 1, nombre_completo: largo, cedula: largo, estado: 'ausente', condicion: largo, materias: [largo] }] }] },
      ],
    });
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, rep);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('fechas inválidas del detalle → "Sin fecha"; columna Otros sólo si hay otros', async () => {
    const rep = base({
      resumen_general: totales(1, 0),
      detalle_diario: [{ fecha: null, secciones: [] }, { fecha: '2026-13-01', secciones: [] }],
      detalle_solo_incidencias: true,
    });
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep));
    expect(todo.match(/Sin fecha/g)?.length).toBe(2);
    expect(todo).not.toMatch(/\bOtros\b/);
    const conOtros = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, base({ resumen_general: totales(1, 2) })));
    expect(conOtros.todo).toMatch(/\bOtros\b/);
  });

  it('una fila del detalle con cientos de materias (más alta que una página) termina sin colgarse', async () => {
    const materias = Array.from({ length: 400 }, (_, i) => `Materia número ${i}`);
    const rep = base({
      detalle_diario: [{ fecha: '2026-11-02', secciones: [{ nombre_seccion: '7-1', registros: [{ id_estudiante: 1, nombre_completo: 'A', cedula: '1', estado: 'ausente', condicion: 'Ausencia', materias }] }] }],
    });
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, rep);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('la generación cede el event loop: un temporizador de 5 ms se dispara durante un PDF grande', async () => {
    const detalle = Array.from({ length: 60 }, (_, d) => ({
      fecha: `2026-11-${String((d % 28) + 1).padStart(2, '0')}`,
      secciones: [{ nombre_seccion: '7-1', registros: Array.from({ length: 50 }, (_, i) => ({ id_estudiante: i, nombre_completo: `Est ${i}`, cedula: `${i}`, estado: 'ausente', condicion: 'Ausencia injustificada', materias: ['Mate', 'Ciencias'] })) }],
    }));
    let disparos = 0;
    const t = setInterval(() => { disparos += 1; }, 5);
    try {
      await generarPdf(pipeReporteAsistenciaEpiPdf, base({ detalle_diario: detalle }));
    } finally {
      clearInterval(t);
    }
    expect(disparos).toBeGreaterThan(0);
  });
});

// Fixture no usada directamente pero importada para mantener el patrón de las suites EPI.
void filaDet;
