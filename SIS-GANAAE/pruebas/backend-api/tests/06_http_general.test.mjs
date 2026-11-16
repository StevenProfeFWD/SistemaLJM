/**
 * Comportamiento HTTP general: rutas desconocidas, métodos no permitidos,
 * formato de errores, aislamiento entre peticiones concurrentes.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { oraculoConteos } from '../support/seed.mjs';
import { state } from '../support/fakeDb.mjs';

let app; let tablas; let cookie;
beforeAll(async () => { ({ app, tablas } = await preparar({ asistencias: 6000, seed: 5 })); cookie = cookiePara('epi'); });

describe('Rutas desconocidas => 404 con formato del errorHandler', () => {
  for (const ruta of ['/api/epi', '/api/epi/reporte', '/api/epi/reporte-asistencia/xlsx', '/api/epi/secciones/1', '/api/EPI/reporte-asistencia-x', '/api/noexiste', '/epi/reporte-asistencia']) {
    it(`GET ${ruta} => 404`, async () => {
      const r = await request(app).get(ruta).set('Cookie', cookie);
      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ status: 'error', code: 404 });
      expect(r.body.message).toMatch(/Ruta no encontrada/);
    });
  }
  it('en NODE_ENV=test el mensaje 404 incluye la URL (en producción no) — observación', async () => {
    const r = await request(app).get('/api/noexiste?x=1');
    expect(r.body.message).toContain('/api/noexiste?x=1');
  });
});

describe('Métodos HTTP no permitidos', () => {
  const rutas = ['/api/epi/reporte-asistencia', '/api/epi/reporte-asistencia/pdf', '/api/epi/secciones/1/estudiantes'];
  for (const ruta of rutas) {
    for (const m of ['post', 'put', 'patch', 'delete']) {
      it(`${m.toUpperCase()} ${ruta} => 404 (Express no distingue 405)`, async () => {
        const r = await request(app)[m](ruta).set('Cookie', cookie).send({});
        expect([404, 405]).toContain(r.status);
      });
    }
    it(`HEAD ${ruta} => igual que GET sin cuerpo (200 con sesión)`, async () => {
      const r = await request(app).head(`${ruta}?periodo=semanal&fecha_referencia=2025-03-12`).set('Cookie', cookie);
      expect(r.status).toBe(200);
    });
    it(`HEAD ${ruta} sin sesión => 401`, async () => {
      const r = await request(app).head(ruta);
      expect(r.status).toBe(401);
    });
  }
  it('[OBSERVACIÓN] POST a ruta existente responde 404 en vez de 405 + Allow', async () => {
    const r = await request(app).post('/api/epi/reporte-asistencia').set('Cookie', cookie);
    expect(r.status).toBe(404);
    expect(r.headers.allow).toBeUndefined();
  });
});

describe('Variantes de ruta', () => {
  it('barra final (/api/epi/reporte-asistencia/) => 200 (Express no estricto)', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia/?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookie);
    expect(r.status).toBe(200);
  });
  it('mayúsculas en la ruta (/api/EPI/REPORTE-ASISTENCIA) => 200 (Express no sensible a mayúsculas)', async () => {
    const r = await request(app).get('/api/EPI/REPORTE-ASISTENCIA?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookie);
    expect(r.status).toBe(200);
  });
  it('id con codificación URL (%31 = "1") => 200', async () => {
    const r = await request(app).get('/api/epi/secciones/%31/estudiantes?anio=2025').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.id_seccion).toBe(1);
  });
  it('id con path traversal codificado (..%2F) => 400 o 404, nunca 500', async () => {
    const r = await request(app).get('/api/epi/secciones/..%2F..%2Fetc/estudiantes').set('Cookie', cookie);
    expect([400, 404]).toContain(r.status);
  });
  it('URI mal codificada (%E0%A4%A) => 400, nunca 500', async () => {
    const r = await request(app).get('/api/epi/secciones/%E0%A4%A/estudiantes').set('Cookie', cookie);
    expect(r.status).toBeLessThan(500);
  });
});

describe('Formato de errores', () => {
  it('400 de validación usa {status, message, code, error}', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?id_seccion=abc').set('Cookie', cookie);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ status: 'error', message: 'id_seccion inválido', code: 400, error: 'id_seccion inválido' });
  });
  it('[OBSERVACIÓN] 401/403 usan formatos distintos ({mensaje} vs {error}) al de 400/404 ({status,message,code,error})', async () => {
    const r401 = await request(app).get('/api/epi/reporte-asistencia');
    const r403 = await request(app).get('/api/epi/reporte-asistencia').set('Cookie', cookiePara('profesor'));
    expect(Object.keys(r401.body)).toEqual(['mensaje']);
    expect(Object.keys(r403.body)).toEqual(['error']);
  });
  it('[CORREGIDO] errores 500 de BD exponen el mensaje interno de PostgreSQL cuando NODE_ENV≠production', async () => {
    // La fecha imposible ya se rechaza con 400 antes de llegar a la BD (DEF-03), así que el 500 se provoca con un fallo de BD.
    state.failTable = { table: 'asistencia', error: new Error('date/time field value out of range: "2025-02-30"') };
    try {
      const r = await request(app).get('/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-03-01').set('Cookie', cookie);
      expect(r.status).toBe(500);
      expect(r.body.message).not.toMatch(/date\/time field value out of range/);
      expect(r.body.message).toBe('Error interno del servidor');
    } finally { state.failTable = null; }
  });
  it('fecha imposible (2025-02-30) ya no llega a la BD: 400 con mensaje de validación', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=personalizado&fecha_inicio=2025-02-30&fecha_fin=2025-03-01').set('Cookie', cookie);
    expect(r.status).toBe(400);
  });
  it('respuestas JSON llevan charset utf-8', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookie);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
  });
  it('[OBSERVACIÓN] la respuesta JSON no lleva Cache-Control: no-store pese a contener datos personales', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=semanal&fecha_referencia=2025-03-12&id_estudiante=1005').set('Cookie', cookie);
    expect(r.headers['cache-control']).toBeUndefined();
  });
});

describe('Aislamiento bajo concurrencia', () => {
  it('40 peticiones paralelas con filtros distintos devuelven cada una su propio resultado (oráculo)', async () => {
    const qs = Array.from({ length: 40 }, (_, i) => ({ periodo: 'anual', fecha_referencia: '2025-01-01', id_seccion: 1 + (i % 17), id_materia: 1 + (i % 8) }));
    const rs = await Promise.all(qs.map((q) => request(app).get('/api/epi/reporte-asistencia').query(q).set('Cookie', cookie)));
    rs.forEach((r, i) => {
      expect(r.status).toBe(200);
      const o = oraculoConteos(tablas, { fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31', id_seccion: qs[i].id_seccion, id_materia: qs[i].id_materia, id_estudiante: null });
      expect(r.body.resumen_general.total).toBe(o.total);
      expect(r.body.filtros.id_seccion).toBe(qs[i].id_seccion);
    });
  });
  it('10 PDF paralelos con roles distintos => todos 200 y PDF válido', async () => {
    const roles = ['epi', 'administrador', 'super_administrador'];
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => request(app).get('/api/epi/reporte-asistencia/pdf?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookiePara(roles[i % 3])).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); })));
    for (const r of rs) {
      expect(r.status).toBe(200);
      expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
  it('mezcla paralela de 401/403/200 no contamina req.user entre peticiones', async () => {
    const pares = [];
    for (let i = 0; i < 30; i++) {
      const tipo = i % 3;
      const req = request(app).get('/api/epi/reporte-asistencia?periodo=semanal&fecha_referencia=2025-03-12');
      if (tipo === 1) req.set('Cookie', cookiePara('profesor'));
      if (tipo === 2) req.set('Cookie', cookiePara('epi'));
      pares.push(req.then((r) => [tipo, r.status]));
    }
    for (const [tipo, st] of await Promise.all(pares)) expect(st).toBe([401, 403, 200][tipo]);
  });
});
