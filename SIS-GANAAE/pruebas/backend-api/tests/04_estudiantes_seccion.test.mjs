/**
 * GET /api/epi/secciones/:idSeccion/estudiantes?anio=
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { ANIO } from '../support/seed.mjs';

let app; let tablas; let cookie;
const get = (id, q = {}) => request(app).get(`/api/epi/secciones/${id}/estudiantes`).query(q).set('Cookie', cookie);

beforeAll(async () => { ({ app, tablas } = await preparar({ asistencias: 6000, seed: 11 })); cookie = cookiePara('epi'); });

describe('Clases válidas', () => {
  it('sección 1, año 2025 => 200 con forma {id_seccion, anio, estudiantes[]}', async () => {
    const r = await get(1, { anio: ANIO });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id_seccion: 1, anio: ANIO });
    expect(Array.isArray(r.body.estudiantes)).toBe(true);
    for (const e of r.body.estudiantes) expect(Object.keys(e).sort()).toEqual(['cedula', 'id_estudiante', 'nombre_completo']);
  });
  it('incluye matriculados activos (29) + el de matrícula cancelada que tiene asistencia (1) = 30, sin duplicados', async () => {
    const r = await get(1, { anio: ANIO });
    const ids = r.body.estudiantes.map((e) => e.id_estudiante);
    expect(new Set(ids).size).toBe(ids.length);
    const esperados = new Set(tablas.matricula.filter((m) => m.id_seccion === 1 && m.estado !== 'cancelada').map((m) => m.id_persona_estudiante));
    for (const id of esperados) expect(ids).toContain(id);
    expect(ids).toContain(1000); // cancelado pero con asistencia en 2025
  });
  it('ordenados por nombre (localeCompare es)', async () => {
    const r = await get(2, { anio: ANIO });
    const n = r.body.estudiantes.map((e) => e.nombre_completo);
    expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
  });
  it('sin anio => usa el año actual', async () => {
    const r = await get(1);
    expect(r.status).toBe(200);
    expect(r.body.anio).toBe(new Date().getFullYear());
  });
  it('anio no numérico ("abc") => 400 (DEF-11 corregido); sin anio => año actual (200)', async () => {
    expect((await get(1, { anio: 'abc' })).status).toBe(400);
    const r = await get(1, {});
    expect(r.status).toBe(200);
    expect(r.body.anio).toBe(new Date().getFullYear());
  });
  it('año anterior (2024) sin matrícula pero con 1 asistencia => lista solo ese estudiante', async () => {
    const r = await get(1, { anio: ANIO - 1 });
    expect(r.status).toBe(200);
    expect(r.body.estudiantes.map((e) => e.id_estudiante)).toEqual([1002]);
  });
  it('sección vacía (99) => lista vacía', async () => {
    const r = await get(99, { anio: ANIO });
    expect(r.status).toBe(200);
    expect(r.body.estudiantes).toEqual([]);
  });
  it('sección inexistente (5000) => 200 con lista vacía (no 404)', async () => {
    const r = await get(5000, { anio: ANIO });
    expect(r.status).toBe(200);
    expect(r.body.estudiantes).toEqual([]);
  });
});

describe('Clases inválidas / límites', () => {
  for (const id of ['0', '-1', 'abc', 'NaN', "'%20OR%201=1--"]) {
    it(`idSeccion=${id} => 400`, async () => {
      const r = await get(id, { anio: ANIO });
      expect(r.status).toBe(400);
    });
  }
  it('[CORREGIDO] idSeccion="1abc" debería => 400 (parseInt parcial lo acepta como 1)', async () => {
    expect((await get('1abc', { anio: ANIO })).status).toBe(400);
  });
  it('[CORREGIDO] idSeccion=2147483648 debería => 400, no 500', async () => {
    expect((await get('2147483648', { anio: ANIO })).status).toBe(400);
  });
  it('[CORREGIDO] anio=-5 debería => 400, no 500 (genera fecha "-5-01-01")', async () => {
    expect((await get(1, { anio: '-5' })).status).toBe(400);
  });
  it('[CORREGIDO] anio=0 debería => 400, no 500', async () => {
    expect((await get(1, { anio: '0' })).status).toBe(400);
  });
  it('[CORREGIDO] anio=99999999999 debería => 400, no 500', async () => {
    expect((await get(1, { anio: '99999999999' })).status).toBe(400);
  });
  it('anio=1900 (pasado lejano) => 200 y lista vacía', async () => {
    const r = await get(1, { anio: '1900' });
    expect(r.status).toBe(200);
    expect(r.body.estudiantes).toEqual([]);
  });
  it('ruta sin id (/api/epi/secciones//estudiantes) => 404', async () => {
    const r = await request(app).get('/api/epi/secciones//estudiantes').set('Cookie', cookie);
    expect(r.status).toBe(404);
  });
});
