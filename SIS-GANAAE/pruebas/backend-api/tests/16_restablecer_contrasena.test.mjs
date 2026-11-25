/**
 * Restablecer contraseña por HTTP (caja negra): matriz de permisos y validaciones
 * que se resuelven antes de escribir en la BD. La escritura del hash y primer_login
 * se cubre en pruebas/backend-unitarias (servicios/restablecimientoContrasena.test.js).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { setTables } from '../support/fakeDb.mjs';
import { generarDatos } from '../support/seed.mjs';
import { appUrl, requireApp } from '../support/paths.mjs';
import { cookiePara, USUARIOS } from '../support/auth.mjs';

const express = requireApp('express');
const cookieParser = requireApp('cookie-parser');

let app;
beforeAll(async () => {
  setTables(generarDatos({ asistencias: 10 }));
  const { default: rutas } = await import(appUrl('routes/restablecimientoContrasenaRoutes.js'));
  const { errorHandler, notFound } = await import(appUrl('middlewares/errorHandler.js'));
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', rutas);
  app.use(notFound);
  app.use(errorHandler);
});

const post = (id, rol) => {
  const r = request(app).post(`/api/usuarios/${id}/restablecer-contrasena`);
  return rol ? r.set('Cookie', cookiePara(rol)) : r;
};

describe('POST /api/usuarios/:id/restablecer-contrasena', () => {
  it('sin sesión → 401', async () => {
    expect((await post(USUARIOS.profesor)).status).toBe(401);
  });

  for (const rol of ['profesor', 'orientador', 'epi', 'padre_de_familia']) {
    it(`rol ${rol} → 403`, async () => {
      const r = await post(USUARIOS.profesor, rol);
      expect(r.status).toBe(403);
      expect(r.body.error).toMatch(/administración/);
    });
  }

  it('administrador sobre sí mismo → 400', async () => {
    const r = await post(USUARIOS.administrador, 'administrador');
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/propia contraseña/);
  });

  it('super administrador sobre sí mismo → 400', async () => {
    expect((await post(USUARIOS.super_administrador, 'super_administrador')).status).toBe(400);
  });

  for (const id of ['abc', '0', '1.5', '2147483648', '12abc']) {
    it(`id inválido "${id}" → 400`, async () => {
      expect((await post(id, 'administrador')).status).toBe(400);
    });
  }

  it('respuesta JSON de error no expone detalles internos', async () => {
    const r = await post('abc', 'administrador');
    expect(r.body).toEqual({ status: 'error', message: 'Identificador inválido', code: 400, error: 'Identificador inválido' });
  });
});

describe('GET /api/usuarios/restablecer-contrasena', () => {
  it('sin sesión → 401', async () => {
    expect((await request(app).get('/api/usuarios/restablecer-contrasena')).status).toBe(401);
  });
  for (const rol of ['profesor', 'orientador', 'epi', 'padre_de_familia']) {
    it(`rol ${rol} → 403`, async () => {
      const r = await request(app).get('/api/usuarios/restablecer-contrasena').set('Cookie', cookiePara(rol));
      expect(r.status).toBe(403);
    });
  }
});
