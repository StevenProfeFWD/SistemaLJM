/**
 * Caja negra: clases de equivalencia y valores límite de los parámetros de
 * GET /api/epi/reporte-asistencia.
 * Las pruebas marcadas [CORREGIDO] esperan el comportamiento correcto y FALLAN
 * mientras el defecto exista (se dejan a propósito como evidencia).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';

const URL = '/api/epi/reporte-asistencia';
let app; let cookie;
const get = (q) => request(app).get(URL).query(q).set('Cookie', cookie);
const getRaw = (qs) => request(app).get(`${URL}?${qs}`).set('Cookie', cookie);
const ANUAL = { periodo: 'anual', fecha_referencia: '2025-01-01' };

function hoyIso() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

beforeAll(async () => { ({ app } = await preparar({ asistencias: 5000 })); cookie = cookiePara('epi'); });

describe('periodo: clases válidas y cálculo de rango', () => {
  it('semanal (miércoles 2025-03-12) => lunes 10 a domingo 16', async () => {
    const r = await get({ periodo: 'semanal', fecha_referencia: '2025-03-12' });
    expect(r.status).toBe(200);
    expect(r.body.filtros).toMatchObject({ periodo: 'semanal', periodo_label: 'Semanal', fecha_inicio: '2025-03-10', fecha_fin: '2025-03-16' });
  });
  it('semanal con referencia lunes (límite inferior de la semana)', async () => {
    const r = await get({ periodo: 'semanal', fecha_referencia: '2025-03-10' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2025-03-10', fecha_fin: '2025-03-16' });
  });
  it('semanal con referencia domingo (límite superior de la semana)', async () => {
    const r = await get({ periodo: 'semanal', fecha_referencia: '2025-03-16' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2025-03-10', fecha_fin: '2025-03-16' });
  });
  it('semanal que cruza cambio de año (2025-01-01 => 2024-12-30 a 2025-01-05)', async () => {
    const r = await get({ periodo: 'semanal', fecha_referencia: '2025-01-01' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2024-12-30', fecha_fin: '2025-01-05' });
  });
  it('mensual febrero año no bisiesto => 28 días', async () => {
    const r = await get({ periodo: 'mensual', fecha_referencia: '2025-02-15' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2025-02-01', fecha_fin: '2025-02-28' });
  });
  it('mensual febrero año bisiesto => 29 días', async () => {
    const r = await get({ periodo: 'mensual', fecha_referencia: '2024-02-10' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2024-02-01', fecha_fin: '2024-02-29' });
  });
  it('mensual diciembre => 31 días', async () => {
    const r = await get({ periodo: 'mensual', fecha_referencia: '2025-12-31' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2025-12-01', fecha_fin: '2025-12-31' });
  });
  it('anual => 1 ene a 31 dic', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-06-01' });
    expect(r.body.filtros).toMatchObject({ periodo: 'anual', periodo_label: 'Anual', fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31' });
  });
  it('personalizado válido', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-03-01', fecha_fin: '2025-04-15' });
    expect(r.status).toBe(200);
    expect(r.body.filtros).toMatchObject({ periodo: 'personalizado', periodo_label: 'Personalizado', fecha_inicio: '2025-03-01', fecha_fin: '2025-04-15' });
  });
  it('personalizado de un solo día (inicio = fin, límite)', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-03-03', fecha_fin: '2025-03-03' });
    expect(r.status).toBe(200);
  });
  it('personalizado 29-feb en año bisiesto => 200', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2024-02-29', fecha_fin: '2024-02-29' });
    expect(r.status).toBe(200);
  });
  it('sin parámetros => mensual del mes actual', async () => {
    const r = await get({});
    expect(r.status).toBe(200);
    expect(r.body.filtros.periodo).toBe('mensual');
    expect(r.body.filtros.fecha_inicio).toBe(`${hoyIso().slice(0, 7)}-01`);
  });
  it('mensual sin fecha_referencia => mes actual', async () => {
    const r = await get({ periodo: 'mensual' });
    expect(r.body.filtros.fecha_inicio).toBe(`${hoyIso().slice(0, 7)}-01`);
  });
  it('personalizado ignora fecha_referencia', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-05-01', fecha_fin: '2025-05-02', fecha_referencia: '2020-01-01' });
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2025-05-01', fecha_fin: '2025-05-02' });
  });
});

describe('periodo / fechas: clases inválidas', () => {
  it('personalizado sin fechas => 400', async () => {
    const r = await get({ periodo: 'personalizado' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/fecha/i);
  });
  it('personalizado solo con fecha_inicio => 400', async () => {
    expect((await get({ periodo: 'personalizado', fecha_inicio: '2025-03-01' })).status).toBe(400);
  });
  it('personalizado solo con fecha_fin => 400', async () => {
    expect((await get({ periodo: 'personalizado', fecha_fin: '2025-03-01' })).status).toBe(400);
  });
  it('personalizado con rango invertido => 400', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-04-01', fecha_fin: '2025-03-01' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/posterior/);
  });
  it('personalizado con rango invertido por 1 día (límite) => 400', async () => {
    expect((await get({ periodo: 'personalizado', fecha_inicio: '2025-03-02', fecha_fin: '2025-03-01' })).status).toBe(400);
  });
  for (const f of ['2025/03/01', '01-03-2025', '2025-3-1', 'abc', '20250301', "2025-03-01' OR '1'='1", '2025-03-01T00:00:00', ' 2025-03-01']) {
    it(`personalizado con fecha mal formada ${JSON.stringify(f)} => 400`, async () => {
      expect((await get({ periodo: 'personalizado', fecha_inicio: f, fecha_fin: '2025-03-31' })).status).toBe(400);
    });
  }
  it('[CORREGIDO] personalizado con fecha imposible 2025-02-30 debería => 400 (se envía a la BD => 500)', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-02-30', fecha_fin: '2025-03-31' });
    expect(r.status).toBe(400);
  });
  it('[CORREGIDO] personalizado con mes 13 (2025-13-01) debería => 400', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-01-01', fecha_fin: '2025-13-01' });
    expect(r.status).toBe(400);
  });
  it('[CORREGIDO] periodo desconocido ("diario") debería => 400; hoy se ignora y se usa mensual', async () => {
    const r = await get({ periodo: 'diario', fecha_referencia: '2025-03-12' });
    expect(r.status).toBe(400);
  });
  it('periodo con mayúsculas ("SEMANAL") se normaliza a semanal (200)', async () => {
    const r = await get({ periodo: 'SEMANAL', fecha_referencia: '2025-03-12' });
    expect(r.status).toBe(200);
    expect(r.body.filtros.periodo).toBe('semanal');
  });
  it('[CORREGIDO] fecha_referencia mal formada debería => 400; hoy se usa la fecha actual en silencio', async () => {
    const r = await get({ periodo: 'semanal', fecha_referencia: '12/03/2025' });
    expect(r.status).toBe(400);
  });
  it('[CORREGIDO] fecha_referencia imposible (2025-02-31) en mensual debería => 400 o febrero; hoy se desplaza a marzo', async () => {
    const r = await get({ periodo: 'mensual', fecha_referencia: '2025-02-31' });
    expect(r.status === 400 || r.body.filtros?.fecha_inicio === '2025-02-01').toBe(true);
  });
  it('[CORREGIDO] rango personalizado sin límite (0001-01-01 a 9999-12-31) debería => 400 por rango excesivo', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '0001-01-01', fecha_fin: '9999-12-31' });
    expect(r.status).toBe(400);
  });
  it('periodo como arreglo (periodo[]=anual) no provoca 500', async () => {
    const r = await getRaw('periodo[]=anual&fecha_referencia=2025-01-01');
    expect(r.status).toBeLessThan(500);
  });
  it('[CORREGIDO] fecha_inicio como arreglo (fecha_inicio[]=…) debería => 400; hoy se acepta y filtros.fecha_inicio sale como arreglo', async () => {
    const r = await getRaw('periodo=personalizado&fecha_inicio[]=2025-03-01&fecha_fin=2025-03-31');
    expect(r.status === 400 || typeof r.body.filtros?.fecha_inicio === 'string').toBe(true);
  });
});

describe('ids (id_seccion, id_materia, id_estudiante): equivalencias y límites', () => {
  for (const p of ['id_seccion', 'id_materia', 'id_estudiante']) {
    it(`${p}=1 (mínimo válido) => 200 y eco en filtros`, async () => {
      const r = await get({ ...ANUAL, [p]: '1' });
      expect(r.status).toBe(200);
      expect(r.body.filtros[p]).toBe(1);
    });
    it(`${p} vacío => se ignora (null)`, async () => {
      const r = await get({ ...ANUAL, [p]: '' });
      expect(r.status).toBe(200);
      expect(r.body.filtros[p]).toBeNull();
    });
    for (const v of ['0', '-1', 'abc', '; DROP TABLE asistencia;--', 'NaN', 'Infinity', '-0']) {
      it(`${p}=${JSON.stringify(v)} => 400`, async () => {
        const r = await get({ ...ANUAL, [p]: v });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(new RegExp(`${p} inválido`));
      });
    }
    it(`[CORREGIDO] ${p}="1' OR '1'='1" debería => 400; parseInt lo trunca a 1 y responde 200`, async () => {
      const r = await get({ ...ANUAL, [p]: "1' OR '1'='1" });
      expect(r.status).toBe(400);
    });
    it(`[CORREGIDO] ${p}="12abc" debería => 400 (parseInt parcial)`, async () => {
      expect((await get({ ...ANUAL, [p]: '12abc' })).status).toBe(400);
    });
    it(`[CORREGIDO] ${p}="1.9" debería => 400 (decimal truncado a 1)`, async () => {
      expect((await get({ ...ANUAL, [p]: '1.9' })).status).toBe(400);
    });
    it(`[CORREGIDO] ${p}=2147483648 (int4 max + 1) debería => 400, no 500`, async () => {
      expect((await get({ ...ANUAL, [p]: '2147483648' })).status).toBe(400);
    });
    it(`${p}=2147483647 (int4 max) => 200 sin datos`, async () => {
      const r = await get({ ...ANUAL, [p]: '2147483647' });
      expect(r.status).toBe(200);
      expect(r.body.resumen_general.total).toBe(0);
    });
    it(`[CORREGIDO] ${p}=99999999999999999999 debería => 400, no 500`, async () => {
      expect((await get({ ...ANUAL, [p]: '99999999999999999999' })).status).toBe(400);
    });
  }
  it('id_seccion inexistente (12345) => 200, sin secciones y nombre_seccion null', async () => {
    const r = await get({ ...ANUAL, id_seccion: '12345' });
    expect(r.status).toBe(200);
    expect(r.body.secciones).toEqual([]);
    expect(r.body.filtros.nombre_seccion).toBeNull();
    expect(r.body.resumen_general).toMatchObject({ total: 0, porcentaje_asistencia: 0 });
  });
  it('id_seccion repetido (id_seccion=1&id_seccion=2) no provoca 500', async () => {
    const r = await getRaw('periodo=anual&fecha_referencia=2025-01-01&id_seccion=1&id_seccion=2');
    expect(r.status).toBeLessThan(500);
  });
  it('id con espacios (" 3 ") => se acepta como 3', async () => {
    const r = await get({ ...ANUAL, id_seccion: ' 3 ' });
    expect(r.status).toBe(200);
    expect(r.body.filtros.id_seccion).toBe(3);
  });
});

describe('Parámetros desconocidos / inyección', () => {
  it('parámetros extra se ignoran', async () => {
    expect((await get({ ...ANUAL, foo: 'bar' })).status).toBe(200);
  });
  it('payload de prototype pollution en query no rompe', async () => {
    const r = await getRaw('periodo=anual&fecha_referencia=2025-01-01&constructor[prototype][x]=1&__proto__[y]=1');
    expect(r.status).toBeLessThan(500);
    expect({}.x).toBeUndefined();
    expect({}.y).toBeUndefined();
  });
  it('fecha_referencia con inyección SQL => 400 (fecha mal formada) y no hay 500', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: "2025-01-01'; DROP TABLE asistencia;--" });
    expect(r.status).toBe(400);
  });
  it('query string muy largo (8 KB) no provoca 500', async () => {
    expect((await get({ ...ANUAL, x: 'a'.repeat(8000) })).status).toBeLessThan(500);
  });
});
