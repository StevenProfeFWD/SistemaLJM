/**
 * Revisión (caja negra HTTP) de las correcciones del backend: validación estricta EPI,
 * revocación fail-closed (503), errores 5xx sin detalle interno y PDF con cesión del event loop.
 * BD simulada (support/fakeDb.mjs). Servidor propio sólo en el puerto 4521 (se cierra al final).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';

vi.mock('../../../../backend-node/src/db/knex.js', async () => import('../../support/fakeDb.mjs'));

import { preparar } from '../../support/contexto.mjs';
import { cookiePara } from '../../support/auth.mjs';
import { state } from '../../support/fakeDb.mjs';

const URL = '/api/epi/reporte-asistencia';
let app; let tablas; let cookie;

beforeAll(async () => {
  ({ app, tablas } = await preparar({ asistencias: 4000 }));
  cookie = cookiePara('epi');
});
afterEach(() => {
  state.failTable = null;
  state.failNext = null;
});

const getRaw = (qs, ruta = URL) => request(app).get(`${ruta}?${qs}`).set('Cookie', cookie);

describe('parámetros repetidos / anidados → 400 (antes podían dar 500 o ignorarse)', () => {
  it.each([
    'periodo=mensual&periodo=anual',
    'periodo[]=mensual',
    'periodo[x]=mensual',
    'periodo=semanal&fecha_referencia=2025-03-12&fecha_referencia=2025-03-13',
    'periodo=personalizado&fecha_inicio[]=2025-01-01&fecha_fin=2025-01-31',
    'id_seccion=1&id_seccion=2',
    'id_materia[a]=1',
    'id_estudiante[]=1',
  ])('JSON: %s', async (qs) => {
    const r = await getRaw(qs);
    expect(r.status).toBe(400);
    expect(typeof r.body.message).toBe('string');
  });

  it('PDF: parámetro repetido → 400 JSON (no se abre el PDF)', async () => {
    const r = await getRaw('periodo=mensual&periodo=anual', `${URL}/pdf`);
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/json/);
  });

  it('estudiantes de sección: anio repetido o id con signo → 400', async () => {
    expect((await getRaw('anio=2025&anio=2024', '/api/epi/secciones/1/estudiantes')).status).toBe(400);
    expect((await getRaw('anio=2025', '/api/epi/secciones/+1/estudiantes')).status).toBe(400);
    expect((await getRaw('anio=2025', '/api/epi/secciones/2147483648/estudiantes')).status).toBe(400);
  });
});

describe('formas que envía el frontend siguen respondiendo 200', () => {
  it.each([
    { periodo: 'mensual', fecha_referencia: '2025-03-01' },
    { periodo: 'anual', fecha_referencia: '2025-01-01' },
    { periodo: 'semanal', fecha_referencia: '2025-03-12' },
    { periodo: 'personalizado', fecha_inicio: '2025-03-01', fecha_fin: '2025-03-31' },
    { periodo: 'mensual', fecha_referencia: '2025-03-01', id_seccion: '1', id_materia: '1' },
    { periodo: 'Anual', fecha_referencia: '2025-01-01' },
    {},
  ])('%o', async (q) => {
    const r = await request(app).get(URL).query(q).set('Cookie', cookie);
    expect(r.status).toBe(200);
  });

  it('anio de estudiantes como lo envía la página (AAAA) → 200', async () => {
    const idSec = tablas.seccion[0].id_seccion;
    const r = await request(app).get(`/api/epi/secciones/${idSec}/estudiantes`).query({ anio: '2025' }).set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.anio).toBe(2025);
  });
});

describe('errores 5xx no exponen detalles internos', () => {
  it('fallo de BD en asistencia → 500 con mensaje genérico (sin texto de PostgreSQL)', async () => {
    const e = new Error('relation "asistencia" does not exist');
    e.code = '42P01';
    state.failTable = { table: 'asistencia', error: e };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await request(app).get(URL).query({ periodo: 'mensual', fecha_referencia: '2025-03-01' }).set('Cookie', cookie);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation|asistencia|42P01/);
    expect(r.body.message).toBe('Error interno del servidor');
  });

  it('error con code numérico 4xx de un driver sigue siendo 4xx', async () => {
    const e = new Error('Petición inválida (simulada)');
    e.code = 409;
    state.failTable = { table: 'asistencia', error: e };
    const r = await request(app).get(URL).query({ periodo: 'mensual', fecha_referencia: '2025-03-01' }).set('Cookie', cookie);
    expect(r.status).toBe(409);
  });
});

describe('revocación de sesión fail-closed', () => {
  it('jwt_revocado no disponible → 503 (no 200, no 401) en JSON y PDF', async () => {
    state.failTable = { table: 'jwt_revocado', error: new Error('BD caída') };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const j = await request(app).get(URL).set('Cookie', cookie);
    const p = await request(app).get(`${URL}/pdf`).set('Cookie', cookie);
    for (const r of [j, p]) {
      expect(r.status).toBe(503);
      expect(r.body.mensaje).toMatch(/No se pudo validar la sesión/);
    }
  });

  it('al recuperarse la BD la misma cookie vuelve a funcionar', async () => {
    state.failTable = { table: 'jwt_revocado', error: new Error('BD caída') };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(app).get(URL).set('Cookie', cookie)).status).toBe(503);
    state.failTable = null;
    expect((await request(app).get(URL).set('Cookie', cookie)).status).toBe(200);
  });

  it('token sin jti no consulta la revocación (sigue entrando con la tabla caída)', async () => {
    state.failTable = { table: 'jwt_revocado', error: new Error('BD caída') };
    const r = await request(app).get(URL).set('Cookie', cookiePara('epi', { jti: false }));
    expect(r.status).toBe(200);
  });
});

describe('PDF: cliente que aborta a mitad de la generación', () => {
  it('el servidor sigue atendiendo y no hay excepción no capturada', async () => {
    const server = http.createServer(app);
    await new Promise((ok) => server.listen(4521, '127.0.0.1', ok));
    const errores = [];
    const onErr = (e) => errores.push(e);
    process.on('uncaughtException', onErr);
    process.on('unhandledRejection', onErr);
    try {
      // Petición de PDF anual que se aborta apenas llegan los primeros bytes.
      await new Promise((ok) => {
        const req = http.get(
          { host: '127.0.0.1', port: 4521, path: `${URL}/pdf?periodo=anual&fecha_referencia=2025-01-01`, headers: { Cookie: cookie } },
          (res) => {
            res.once('data', () => { req.destroy(); ok(); });
            res.on('error', () => {});
          }
        );
        req.on('error', () => ok());
        setTimeout(ok, 20000);
      });
      await new Promise((r) => setTimeout(r, 1500));
      const r = await request(server).get(URL).query({ periodo: 'mensual', fecha_referencia: '2025-03-01' }).set('Cookie', cookie);
      expect(r.status).toBe(200);
      expect(errores).toEqual([]);
    } finally {
      process.off('uncaughtException', onErr);
      process.off('unhandledRejection', onErr);
      await new Promise((ok) => server.close(ok));
    }
  });
});
