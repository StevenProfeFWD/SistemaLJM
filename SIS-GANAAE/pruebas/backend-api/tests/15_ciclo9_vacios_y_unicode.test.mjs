/**
 * Ciclo 9: parámetros vacíos, unicode y espacios en fechas.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';

let app; let cookie;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 2000, seed: 31 })); cookie = cookiePara('epi'); });
const get = (qs) => request(app).get(`/api/epi/reporte-asistencia?${qs}`).set('Cookie', cookie);

describe('Parámetros vacíos y unicode', () => {
  it('periodo vacío (periodo=) => 200 mensual (fallback)', async () => {
    const r = await get('periodo=&fecha_referencia=2025-03-12');
    expect(r.status).toBe(200);
    expect(r.body.filtros.periodo).toBe('mensual');
  });
  it('personalizado con fechas vacías => 400', async () => {
    expect((await get('periodo=personalizado&fecha_inicio=&fecha_fin=')).status).toBe(400);
  });
  it('fecha con dígitos unicode (٢٠٢٥-٠٣-٠١, árabe-índicos) => 400 en personalizado', async () => {
    expect((await get(`periodo=personalizado&fecha_inicio=${encodeURIComponent('٢٠٢٥-٠٣-٠١')}&fecha_fin=2025-03-31`)).status).toBe(400);
  });
  it('fecha con espacio final codificado (2025-03-01%20) => 400', async () => {
    expect((await get('periodo=personalizado&fecha_inicio=2025-03-01%20&fecha_fin=2025-03-31')).status).toBe(400);
  });
  it('id con dígitos de ancho completo (１２) => 400', async () => {
    expect((await get(`id_seccion=${encodeURIComponent('１２')}`)).status).toBe(400);
  });
  it('id con byte nulo (1%00) => no 500', async () => {
    expect((await get('id_seccion=1%00')).status).toBeLessThan(500);
  });
  it('id hexadecimal (0x10) => 400 (parseInt base 10 da 0)', async () => {
    expect((await get('id_seccion=0x10')).status).toBe(400);
  });
});
