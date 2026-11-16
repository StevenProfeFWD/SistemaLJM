import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara, cookieCruda, firmar, cifrar, USUARIOS } from '../support/auth.mjs';
import { state } from '../support/fakeDb.mjs';

const EPI_RUTAS = [
  '/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-03-10',
  '/api/epi/secciones/1/estudiantes?anio=2025',
  '/api/epi/reporte-asistencia/pdf?periodo=semanal&fecha_referencia=2025-03-10',
];

let app;
beforeAll(async () => { ({ app } = await preparar({ asistencias: 3000 })); });

describe('Matriz de roles sobre endpoints EPI', () => {
  for (const ruta of EPI_RUTAS) {
    describe(ruta.split('?')[0], () => {
      it('sin cookie => 401', async () => {
        const r = await request(app).get(ruta);
        expect(r.status).toBe(401);
        expect(r.body).toHaveProperty('mensaje');
      });
      for (const rol of ['epi', 'administrador', 'super_administrador']) {
        it(`rol ${rol} => 200`, async () => {
          const r = await request(app).get(ruta).set('Cookie', cookiePara(rol));
          expect(r.status).toBe(200);
        });
      }
      for (const rol of ['profesor', 'orientador', 'padre_de_familia', 'estudiante', 'sin_rol', 'EPI_mayus']) {
        it(`rol ${rol} => 403`, async () => {
          const r = await request(app).get(ruta).set('Cookie', cookiePara(rol));
          expect(r.status).toBe(403);
          expect(r.body.error || r.body.mensaje).toBeTruthy();
        });
      }
    });
  }
});

describe('Validación del token / sesión', () => {
  const ruta = EPI_RUTAS[0];
  it('cookie con basura (no base64 válido) => 401', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda('xxxx'));
    expect(r.status).toBe(401);
  });
  it('JWT sin cifrar en la cookie => 401', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(firmar({ id: 1 })));
    expect(r.status).toBe(401);
  });
  it('cookie cifrada con otra clave => 401', async () => {
    const otra = Buffer.alloc(32, 7);
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: 1 }), otra)));
    expect(r.status).toBe(401);
  });
  it('JWT firmado con otro secreto => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: 1 }, { secret: 'otro' }))));
    expect(r.status).toBe(403);
  });
  it('JWT expirado => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: 1 }, { expiresIn: -10 }))));
    expect(r.status).toBe(403);
  });
  it('JWT HS512 (algoritmo no permitido) => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: 1 }, { algorithm: 'HS512' }))));
    expect(r.status).toBe(403);
  });
  it('JWT alg=none => 403', async () => {
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ id: 1, rol: 'epi' })).toString('base64url');
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(`${h}.${p}.`)));
    expect(r.status).toBe(403);
  });
  it('JWT con id no numérico => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: 'abc', rol: 'epi' }))));
    expect(r.status).toBe(403);
  });
  it('JWT de usuario inexistente => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: 999999, rol: 'epi' }))));
    expect(r.status).toBe(403);
  });
  it('persona inactiva => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookiePara(USUARIOS.epi_persona_inactiva));
    expect(r.status).toBe(403);
  });
  it('cuenta de sistema inactiva => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookiePara(USUARIOS.epi_cuenta_inactiva));
    expect(r.status).toBe(403);
  });
  it('persona sin usuario de sistema => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookiePara(USUARIOS.epi_sin_cuenta));
    expect(r.status).toBe(403);
  });
  it('el rol se toma de la BD, no del JWT (profesor con rol=epi en el token) => 403', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: USUARIOS.profesor, rol: 'epi' }))));
    expect(r.status).toBe(403);
  });
  it('JWT con rol=profesor pero BD dice epi => 200', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookieCruda(cifrar(firmar({ id: USUARIOS.epi, rol: 'profesor' }))));
    expect(r.status).toBe(200);
  });
  it('jti revocado => 401', async () => {
    state.revoked.add('jti-revocado-qa');
    const r = await request(app).get(ruta).set('Cookie', cookiePara('epi', { jti: 'jti-revocado-qa' }));
    expect(r.status).toBe(401);
  });
  it('token sin jti (legado) es aceptado => 200', async () => {
    const r = await request(app).get(ruta).set('Cookie', cookiePara('epi', { jti: false }));
    expect(r.status).toBe(200);
  });
  it('token en header Authorization (no cookie) => 401', async () => {
    const r = await request(app).get(ruta).set('Authorization', `Bearer ${firmar({ id: 1 })}`);
    expect(r.status).toBe(401);
  });
});

describe('Matriz de roles sobre /api/reportes/* (control de regresión)', () => {
  const rutas = ['/api/reportes/estadisticas?fecha_inicio=2025-03-01&fecha_fin=2025-03-31', '/api/reportes/permanencia-alertas?fecha_inicio=2025-03-01&fecha_fin=2025-03-31'];
  for (const ruta of rutas) {
    it(`${ruta.split('?')[0]} sin cookie => 401`, async () => {
      expect((await request(app).get(ruta)).status).toBe(401);
    });
    for (const [rol, st] of [['administrador', 200], ['super_administrador', 200], ['orientador', 200], ['epi', 403], ['profesor', 403], ['padre_de_familia', 403]]) {
      it(`${ruta.split('?')[0]} rol ${rol} => ${st}`, async () => {
        expect((await request(app).get(ruta).set('Cookie', cookiePara(rol))).status).toBe(st);
      });
    }
  }
});
