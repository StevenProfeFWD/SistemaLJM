/**
 * Ciclo 8: cadena completa de middlewares de las rutas EPI ejecutada a mano
 * (verificarTokenInterno → verificarReportesEpi → handler), con BD simulada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import router from '../../../../backend-node/src/routes/epiRoutes.js';
import { firmarTokenAcceso } from '../../../../backend-node/src/services/tokenRevocationService.js';
import { cifrarCookie } from '../../../../backend-node/src/utils/cookieEncryption.js';
import { calcularRangoPeriodo } from '../../../../backend-node/src/services/epiReportesService.js';

let bk;
beforeEach(() => {
  bk = process.env.COOKIE_ENCRYPTION_KEY;
  process.env.COOKIE_ENCRYPTION_KEY = 'clave-cadena-epi-0123456789abcdef';
  DB.reset();
});
afterEach(() => {
  if (bk === undefined) delete process.env.COOKIE_ENCRYPTION_KEY;
  else process.env.COOKIE_ENCRYPTION_KEY = bk;
});

/** Ejecuta la pila de una ruta como lo haría Express (next secuencial). */
async function ejecutarRuta(path, req) {
  const capa = router.stack.find((l) => l.route.path === path);
  const pila = capa.route.stack.map((s) => s.handle);
  const res = { headers: {} };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn((k, v) => (res.headers[k] = v));
  let errorNext = null;
  for (const mw of pila) {
    let avanzar = false;
    await new Promise((ok) => {
      const next = (err) => {
        if (err) errorNext = err;
        avanzar = !err;
        ok();
      };
      const r = mw(req, res, next);
      Promise.resolve(r).then(() => setTimeout(ok, 0));
    });
    if (!avanzar) break;
  }
  return { res, errorNext };
}

const resolver = (rolBd) => (r) => {
  if (r.tabla === 'persona as p') return { id_persona: 1, nombre_rol: rolBd, persona_activa: true, cuenta_activa: true };
  if (r.tabla === 'jwt_revocado') return undefined;
  if (r.tabla === 'asistencia as a') return [];
  if (r.tabla === 'seccion' || r.tabla === 'materia') return [];
  if (r.tabla === 'matricula as m') return [];
  return undefined;
};

const cookie = (rol) => ({ token: cifrarCookie(firmarTokenAcceso({ id: 1, rol })) });

describe('GET /epi/reporte-asistencia (cadena completa)', () => {
  it.each([
    ['epi', 200],
    ['administrador', 200],
    ['super_administrador', 200],
    ['orientador', 403],
    ['profesor', 403],
    ['padre_de_familia', 403],
  ])('rol en BD %s → %i', async (rol, esperado) => {
    DB.setResolver(resolver(rol));
    const { res } = await ejecutarRuta('/epi/reporte-asistencia', { cookies: cookie(rol), query: { periodo: 'semanal', fecha_referencia: '2026-11-11' } });
    if (esperado === 200) {
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json.mock.lastCall[0].filtros).toMatchObject({ fecha_inicio: '2026-11-09', fecha_fin: '2026-11-15' });
    } else {
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json.mock.lastCall[0]).toEqual({ error: 'Acceso restringido al Equipo de Permanencia Estudiantil' });
    }
  });

  it('token con rol "epi" pero BD dice "profesor" (rol revocado) → 403', async () => {
    DB.setResolver(resolver('profesor'));
    const { res } = await ejecutarRuta('/epi/reporte-asistencia', { cookies: cookie('epi'), query: {} });
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('sin cookie → 401 y nunca se consulta asistencia', async () => {
    DB.setResolver(resolver('epi'));
    const { res } = await ejecutarRuta('/epi/reporte-asistencia', { cookies: {}, query: {} });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(DB.llamadas.some((l) => l.tabla === 'asistencia as a')).toBe(false);
  });

  it('parámetros inválidos con rol EPI → el AppError 400 llega a next(err)', async () => {
    DB.setResolver(resolver('epi'));
    const { errorNext } = await ejecutarRuta('/epi/reporte-asistencia', { cookies: cookie('epi'), query: { id_seccion: '-1' } });
    expect(errorNext?.statusCode).toBe(400);
  });

  it('CORREGIDO D-13 en la cadena: fecha_referencia[]=… llega al errorHandler como AppError 400 (antes TypeError → 500)', async () => {
    DB.setResolver(resolver('epi'));
    const { errorNext } = await ejecutarRuta('/epi/reporte-asistencia', {
      cookies: cookie('epi'),
      query: { periodo: 'semanal', fecha_referencia: ['2026-11-11'] },
    });
    expect(errorNext).not.toBeInstanceOf(TypeError);
    expect(errorNext.statusCode).toBe(400);
  });

  it('/epi/secciones/:idSeccion/estudiantes con EPI devuelve lista vacía', async () => {
    DB.setResolver(resolver('epi'));
    const { res } = await ejecutarRuta('/epi/secciones/:idSeccion/estudiantes', {
      cookies: cookie('epi'),
      params: { idSeccion: '3' },
      query: { anio: '2026' },
    });
    expect(res.json.mock.lastCall[0]).toEqual({ id_seccion: 3, anio: 2026, estudiantes: [] });
  });
});

describe('propiedades de calcularRangoPeriodo en 2000–2030', () => {
  it('mensual: empieza el día 1 y el día siguiente al fin es día 1 del mes siguiente', () => {
    for (let y = 2000; y <= 2030; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        const ref = `${y}-${String(m).padStart(2, '0')}-15`;
        const r = calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: ref });
        expect(r.fecha_inicio).toBe(`${ref.slice(0, 7)}-01`);
        const sig = new Date(`${r.fecha_fin}T00:00:00Z`);
        sig.setUTCDate(sig.getUTCDate() + 1);
        expect(sig.getUTCDate()).toBe(1);
      }
    }
  });

  it('febrero tiene 29 días exactamente en años bisiestos', () => {
    for (let y = 1896; y <= 2104; y += 1) {
      const bis = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const r = calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: `${y}-02-01` });
      expect(r.fecha_fin.slice(8)).toBe(bis ? '29' : '28');
    }
  });
});
