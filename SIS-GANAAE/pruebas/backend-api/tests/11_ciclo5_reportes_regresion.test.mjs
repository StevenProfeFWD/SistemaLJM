/**
 * Ciclo 5: regresión funcional mínima de /api/reportes/* (montado junto a EPI)
 * y comparación cruzada de totales entre /reportes/estadisticas y /epi/reporte-asistencia.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';

let app; let admin; let epi;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 5000, seed: 13 })); admin = cookiePara('administrador'); epi = cookiePara('epi'); });

describe('/api/reportes/estadisticas', () => {
  it('forma básica y catálogos', async () => {
    const r = await request(app).get('/api/reportes/estadisticas?fecha_inicio=2025-03-01&fecha_fin=2025-03-31').set('Cookie', admin);
    expect(r.status).toBe(200);
    for (const k of ['filtros', 'kpis', 'por_seccion', 'por_materia', 'matriz_exportacion', 'catalogos']) expect(r.body).toHaveProperty(k);
  });
  it('id_seccion=abc => 400', async () => {
    const r = await request(app).get('/api/reportes/estadisticas?id_seccion=abc').set('Cookie', admin);
    expect(r.status).toBe(400);
  });
  it('rango invertido => 400', async () => {
    const r = await request(app).get('/api/reportes/estadisticas?fecha_inicio=2025-04-01&fecha_fin=2025-03-01').set('Cookie', admin);
    expect(r.status).toBe(400);
  });
  it('mismo rango: nº de filas de matriz_exportacion = total EPI', async () => {
    const q = 'fecha_inicio=2025-03-01&fecha_fin=2025-03-31';
    const a = await request(app).get(`/api/reportes/estadisticas?${q}`).set('Cookie', admin);
    const b = await request(app).get(`/api/epi/reporte-asistencia?periodo=personalizado&${q}`).set('Cookie', epi);
    expect(a.body.matriz_exportacion.length).toBe(b.body.resumen_general.total);
  });
  it('mismo rango y sección: por_seccion.total_registros = total sección EPI', async () => {
    const q = 'fecha_inicio=2025-05-01&fecha_fin=2025-06-30&id_seccion=6';
    const a = await request(app).get(`/api/reportes/estadisticas?${q}`).set('Cookie', admin);
    const b = await request(app).get(`/api/epi/reporte-asistencia?periodo=personalizado&${q}`).set('Cookie', epi);
    expect(a.body.por_seccion[0].total_registros).toBe(b.body.secciones[0].totales.total);
  });
  it('[OBSERVACIÓN] id_seccion=0 es aceptado por /reportes (200) mientras EPI lo rechaza (400): validación inconsistente', async () => {
    const a = await request(app).get('/api/reportes/estadisticas?id_seccion=0').set('Cookie', admin);
    const b = await request(app).get('/api/epi/reporte-asistencia?id_seccion=0').set('Cookie', epi);
    expect(a.status).toBe(200);
    expect(b.status).toBe(400);
  });
});

describe('/api/reportes/permanencia-alertas', () => {
  it('forma básica', async () => {
    const r = await request(app).get('/api/reportes/permanencia-alertas?fecha_inicio=2025-02-01&fecha_fin=2025-11-30').set('Cookie', admin);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ umbrales: { tardias: 3, ausencias: 3 } });
    expect(r.body.total_alertas).toBe(r.body.alertas.length);
  });
});
