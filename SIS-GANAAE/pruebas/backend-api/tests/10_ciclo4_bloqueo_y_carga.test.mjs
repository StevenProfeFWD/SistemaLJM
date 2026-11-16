/**
 * Ciclo 4: efectos observables por HTTP de la generación de PDFs grandes
 * (bloqueo del event loop) y estabilidad del endpoint de estudiantes en paralelo.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { setTables } from '../support/fakeDb.mjs';
import { generarDatos } from '../support/seed.mjs';

let app; let cookie;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 3000, seed: 4 })); cookie = cookiePara('epi'); });

describe('Bloqueo del event loop por el PDF', () => {
  it('[CORREGIDO-RENDIMIENTO] una petición ligera concurrente con un PDF anual de 20k incidencias debería responder en < 1 s', async () => {
    const t = generarDatos({ asistencias: 20000, seed: 8 });
    const est = ['ausente', 'tardanza', 'justificado'];
    t.asistencia = t.asistencia.map((a, i) => ({ ...a, estado: est[i % 3] }));
    setTables(t);
    const server = http.createServer(app);
    await new Promise((r) => server.listen(4513, '127.0.0.1', r));
    try {
      const pdf = request(server).get('/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-01').set('Cookie', cookie).buffer(true).parse((res, cb) => { res.on('data', () => {}); res.on('end', () => cb(null, null)); });
      let terminado = false;
      const pPdf = pdf.then((r) => { terminado = true; return r; });
      const lat = [];
      while (!terminado) {
        const t0 = performance.now();
        const ligera = await request(server).get('/api/epi/secciones/1/estudiantes?anio=2025').set('Cookie', cookie);
        lat.push(performance.now() - t0);
        expect(ligera.status).toBe(200);
        await new Promise((r) => setTimeout(r, 50));
      }
      await pPdf;
      const msLigera = Math.max(...lat);
      console.log(`peticiones ligeras durante el PDF: ${lat.length}; latencia máx ${msLigera.toFixed(0)} ms`);
      expect(msLigera).toBeLessThan(1000);
    } finally {
      server.close();
    }
  }, 120000);
});

describe('Estudiantes en paralelo', () => {
  it('17 secciones en paralelo => cada respuesta corresponde a su sección', async () => {
    setTables(generarDatos({ asistencias: 3000, seed: 4 }));
    const rs = await Promise.all(Array.from({ length: 17 }, (_, i) => request(app).get(`/api/epi/secciones/${i + 1}/estudiantes?anio=2025`).set('Cookie', cookie)));
    rs.forEach((r, i) => {
      expect(r.status).toBe(200);
      expect(r.body.id_seccion).toBe(i + 1);
      expect(r.body.estudiantes.length).toBeGreaterThanOrEqual(29);
    });
  });
});
