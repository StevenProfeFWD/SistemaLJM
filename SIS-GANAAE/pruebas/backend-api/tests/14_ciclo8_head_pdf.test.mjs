/**
 * Ciclo 8: HEAD sobre el PDF ejecuta el mismo handler que GET (Express), es decir
 * genera el documento completo aunque no se envíe el cuerpo.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { stats } from '../support/fakeDb.mjs';

let app; let cookie;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 8000, seed: 12 })); cookie = cookiePara('epi'); });

describe('HEAD /api/epi/reporte-asistencia/pdf', () => {
  it('[OBSERVACIÓN] HEAD responde 200 con cabeceras de PDF y ejecuta las mismas consultas que GET (incluye detalle)', async () => {
    const q = '/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-01';
    const q0 = stats.queries;
    const h = await request(app).head(q).set('Cookie', cookie);
    const consultasHead = stats.queries - q0;
    const q1 = stats.queries;
    await request(app).get(q).set('Cookie', cookie).buffer(true).parse((res, cb) => { res.on('data', () => {}); res.on('end', () => cb(null, null)); });
    const consultasGet = stats.queries - q1;
    expect(h.status).toBe(200);
    expect(h.headers['content-type']).toBe('application/pdf');
    expect(consultasHead).toBe(consultasGet);
  });
});
