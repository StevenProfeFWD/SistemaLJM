/**
 * Ciclo 6: tamaño de la respuesta JSON acotado (no crece con las filas) y
 * filas con `fecha` como objeto Date (como las devuelve node-postgres) en el PDF.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { setTables } from '../support/fakeDb.mjs';
import { generarDatos } from '../support/seed.mjs';
import { binParser, esPdfValido, contarPaginas } from '../support/pdf.mjs';

let app; let cookie;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 2000, seed: 2 })); cookie = cookiePara('epi'); });

describe('Tamaño de la respuesta JSON', () => {
  it('el JSON anual no crece con el volumen (2k vs 60k filas difieren < 10 %)', async () => {
    const q = '/api/epi/reporte-asistencia?periodo=anual&fecha_referencia=2025-01-01';
    setTables(generarDatos({ asistencias: 2000, seed: 2 }));
    const a = await request(app).get(q).set('Cookie', cookie);
    setTables(generarDatos({ asistencias: 60000, seed: 2 }));
    const b = await request(app).get(q).set('Cookie', cookie);
    const la = Buffer.byteLength(a.text); const lb = Buffer.byteLength(b.text);
    console.log(`JSON anual: ${la} B (2k filas) vs ${lb} B (60k filas)`);
    expect(Math.abs(lb - la) / la).toBeLessThan(0.1);
  });
});

describe('Fechas como Date (node-postgres)', () => {
  it('PDF mensual con fechas Date => válido y mismas páginas que con strings', async () => {
    const q = '/api/epi/reporte-asistencia/pdf?periodo=mensual&fecha_referencia=2025-04-10';
    setTables(generarDatos({ asistencias: 6000, seed: 9, fechasDate: false }));
    const s = await request(app).get(q).set('Cookie', cookie).buffer(true).parse(binParser);
    setTables(generarDatos({ asistencias: 6000, seed: 9, fechasDate: true }));
    const d = await request(app).get(q).set('Cookie', cookie).buffer(true).parse(binParser);
    expect(esPdfValido(d.body)).toBe(true);
    expect(contarPaginas(d.body)).toBe(contarPaginas(s.body));
  });
  it('JSON con fechas Date => mismos totales que con strings', async () => {
    const q = '/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-04-10';
    setTables(generarDatos({ asistencias: 6000, seed: 9, fechasDate: false }));
    const s = await request(app).get(q).set('Cookie', cookie);
    setTables(generarDatos({ asistencias: 6000, seed: 9, fechasDate: true }));
    const d = await request(app).get(q).set('Cookie', cookie);
    expect(d.body.resumen_general).toEqual(s.body.resumen_general);
  });
});
