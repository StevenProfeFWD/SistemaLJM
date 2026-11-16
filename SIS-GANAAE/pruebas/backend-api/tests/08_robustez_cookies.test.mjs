/**
 * Ciclo 2: robustez de la cookie de sesión y privacidad del filtro id_estudiante.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara, cookieCruda, cifrar, firmar } from '../support/auth.mjs';

const URL = '/api/epi/reporte-asistencia?periodo=semanal&fecha_referencia=2025-03-12';
let app;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 2000, seed: 99 })); });

describe('Variantes de cookie', () => {
  it('cookie token vacía => 401', async () => {
    expect((await request(app).get(URL).set('Cookie', 'token=')).status).toBe(401);
  });
  it('cookie con base64 de longitud < 28 bytes => 401', async () => {
    expect((await request(app).get(URL).set('Cookie', cookieCruda(Buffer.alloc(20).toString('base64')))).status).toBe(401);
  });
  it('cookie con 1 bit alterado (auth tag GCM falla) => 401', async () => {
    const c = Buffer.from(cifrar(firmar({ id: 1 })), 'base64');
    c[c.length - 1] ^= 1;
    expect((await request(app).get(URL).set('Cookie', cookieCruda(c.toString('base64')))).status).toBe(401);
  });
  it('cookie muy grande (16 KB de basura) => 401, no 500', async () => {
    const r = await request(app).get(URL).set('Cookie', cookieCruda('A'.repeat(16000)));
    expect(r.status).toBe(401);
  });
  it('dos cookies token (válida + basura): cookie-parser toma la primera', async () => {
    const r = await request(app).get(URL).set('Cookie', `${cookiePara('epi')}; token=basura`);
    expect(r.status).toBe(200);
  });
  it('cookie válida con otro nombre (Token) => 401 (nombre sensible a mayúsculas)', async () => {
    const r = await request(app).get(URL).set('Cookie', cookiePara('epi').replace(/^token=/, 'Token='));
    expect(r.status).toBe(401);
  });
  it('JWT con id como string numérico ("1") => 200', async () => {
    const r = await request(app).get(URL).set('Cookie', cookieCruda(cifrar(firmar({ id: '1' }))));
    expect(r.status).toBe(200);
  });
  it('[OBSERVACIÓN] JWT con id "1abc" se acepta como id 1 (parseInt parcial en el middleware)', async () => {
    const r = await request(app).get(URL).set('Cookie', cookieCruda(cifrar(firmar({ id: '1abc' }))));
    expect(r.status).toBe(200);
  });
  it('JWT con nbf futuro => 403', async () => {
    const r = await request(app).get(URL).set('Cookie', cookieCruda(cifrar(firmar({ id: 1, nbf: Math.floor(Date.now() / 1000) + 3600 }))));
    expect(r.status).toBe(403);
  });
});

describe('Privacidad de id_estudiante', () => {
  it('[CORREGIDO-PRIVACIDAD] id_estudiante de una persona que no es estudiante (encargado, id 6) no debería devolver su nombre/cédula', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=anual&fecha_referencia=2025-01-01&id_estudiante=6').set('Cookie', cookiePara('epi'));
    expect(r.status).toBe(200);
    expect(r.body.filtros.cedula_estudiante).toBeNull();
  });
});
