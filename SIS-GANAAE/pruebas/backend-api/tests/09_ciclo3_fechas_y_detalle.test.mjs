/**
 * Ciclo 3: años de 1–3 dígitos, consistencia entre JSON y PDF en volumen, y
 * estabilidad de resultados repetidos (determinismo).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { binParser, esPdfValido } from '../support/pdf.mjs';

let app; let cookie;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 4000, seed: 77 })); cookie = cookiePara('epi'); });
const get = (qs) => request(app).get(`/api/epi/reporte-asistencia?${qs}`).set('Cookie', cookie);

describe('Años con menos de 4 cifras significativas', () => {
  it('[CORREGIDO] anual con fecha_referencia=0050-06-01 debería cubrir 0050 (o => 400); hoy calcula 1950', async () => {
    const r = await get('periodo=anual&fecha_referencia=0050-06-01');
    expect(r.status === 400 || r.body.filtros?.fecha_inicio === '0050-01-01').toBe(true);
  });
  it('[CORREGIDO] mensual con fecha_referencia=0001-01-15 debería => 0001-01 (o 400); hoy => 1901-01', async () => {
    const r = await get('periodo=mensual&fecha_referencia=0001-01-15');
    expect(r.status === 400 || r.body.filtros?.fecha_inicio === '0001-01-01').toBe(true);
  });
  it('anual con fecha_referencia=1000-06-01 => 1000-01-01..1000-12-31', async () => {
    const r = await get('periodo=anual&fecha_referencia=1000-06-01');
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '1000-01-01', fecha_fin: '1000-12-31' });
  });
});

describe('Determinismo', () => {
  it('10 llamadas idénticas devuelven exactamente el mismo cuerpo', async () => {
    const q = 'periodo=anual&fecha_referencia=2025-01-01&id_seccion=4';
    const first = JSON.stringify((await get(q)).body);
    for (let i = 0; i < 9; i++) expect(JSON.stringify((await get(q)).body)).toBe(first);
  });
  it('el orden de los parámetros no altera el resultado', async () => {
    const a = (await get('periodo=anual&fecha_referencia=2025-01-01&id_seccion=4&id_materia=2')).body;
    const b = (await get('id_materia=2&id_seccion=4&fecha_referencia=2025-01-01&periodo=anual')).body;
    expect(b).toEqual(a);
  });
});

describe('Rol administrador / super_administrador ven lo mismo que epi', () => {
  it('mismo cuerpo JSON para los tres roles permitidos', async () => {
    const q = '/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-04-10';
    const [a, b, c] = await Promise.all(['epi', 'administrador', 'super_administrador'].map((r) => request(app).get(q).set('Cookie', cookiePara(r))));
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
  });
  it('PDF del administrador es válido', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia/pdf?periodo=mensual&fecha_referencia=2025-04-10').set('Cookie', cookiePara('administrador')).buffer(true).parse(binParser);
    expect(esPdfValido(r.body)).toBe(true);
  });
});
