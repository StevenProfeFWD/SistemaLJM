/**
 * Restablecer contraseña (super administrador → administradores; administrador → profesor,
 * orientador, EPI y encargados). BD simulada; bcrypt real para verificar el hash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
// bcrypt se resuelve desde backend-node (es dependencia de la app, no de esta suite)
const bcrypt = createRequire(new URL('../../../../backend-node/package.json', import.meta.url))('bcrypt');
import * as DB from '../helpers/dbMock.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import {
  restablecerContrasena,
  buscarUsuariosRestablecibles,
  CONTRASENA_RESTABLECIDA,
} from '../../../../backend-node/src/services/restablecimientoContrasenaService.js';
import { rolesRestableciblesPor, puedeRestablecerContrasenas } from '../../../../backend-node/src/utils/roles.js';
import { verificarRestablecerContrasenas } from '../../../../backend-node/src/middlewares/verificarRoles.js';
import * as M from '../../../../backend-node/src/middlewares/verificarToken.js';
import * as TR from '../../../../backend-node/src/services/tokenRevocationService.js';
import * as CE from '../../../../backend-node/src/utils/cookieEncryption.js';

beforeEach(() => DB.reset());

/** Resolver: la persona objetivo (lectura) y el update de usuariosistema (1 fila). */
const resolverObjetivo = (objetivo, actualizados = 1) => (q) => {
  if (q.tabla === 'persona as p') return objetivo;
  if (q.tabla === 'usuariosistema' && DB.tieneOp(q, 'update')) return actualizados;
  return undefined;
};

const restablecerComo = (rolSolicitante, idObjetivo, idSolicitante = 1) =>
  restablecerContrasena({ idSolicitante, rolSolicitante, idObjetivo });

describe('rolesRestableciblesPor / permisos', () => {
  it('super administrador solo restablece administradores', () => {
    expect(rolesRestableciblesPor('super_administrador')).toEqual(['administrador']);
  });
  it('administrador restablece profesor, orientador, EPI y encargado (no administradores)', () => {
    expect(rolesRestableciblesPor('administrador')).toEqual(['profesor', 'orientador', 'epi', 'padre_de_familia']);
    expect(rolesRestableciblesPor('administrador')).not.toContain('administrador');
    expect(rolesRestableciblesPor('administrador')).not.toContain('super_administrador');
  });
  it.each(['profesor', 'orientador', 'epi', 'padre_de_familia', 'estudiante', undefined, 'toString'])(
    '%s no puede restablecer contraseñas',
    (rol) => {
      expect(rolesRestableciblesPor(rol)).toEqual([]);
      expect(puedeRestablecerContrasenas(rol)).toBe(false);
    }
  );
  it('el arreglo devuelto es una copia (no se puede alterar la configuración)', () => {
    rolesRestableciblesPor('super_administrador').push('profesor');
    expect(rolesRestableciblesPor('super_administrador')).toEqual(['administrador']);
  });
});

describe('middleware verificarRestablecerContrasenas', () => {
  const correr = (rol) => {
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    const next = vi.fn();
    verificarRestablecerContrasenas({ user: { rol } }, res, next);
    return { res, next };
  };
  it.each(['administrador', 'super_administrador'])('%s pasa', (rol) => {
    expect(correr(rol).next).toHaveBeenCalled();
  });
  it.each(['profesor', 'orientador', 'epi', 'padre_de_familia', undefined])('%s → 403', (rol) => {
    const { res, next } = correr(rol);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('restablecerContrasena', () => {
  it('administrador restablece a un profesor: hash bcrypt de "liceomarti" y primer_login = true', async () => {
    DB.setResolver(resolverObjetivo({ id_persona: 20, nombre_completo: 'Ana Prof', nombre_rol: 'profesor', id_usuario: 5 }));
    const r = await restablecerComo('administrador', '20');
    expect(r).toMatchObject({ id_persona: 20, nombre_completo: 'Ana Prof', nombre_rol: 'profesor' });
    expect(r.message).not.toContain(CONTRASENA_RESTABLECIDA); // la respuesta no repite la contraseña
    const upd = DB.llamadas.find((l) => l.tabla === 'usuariosistema');
    expect(DB.argsDe(upd, 'where')).toEqual([[{ persona_id: 20 }]]);
    const [[cambios]] = DB.argsDe(upd, 'update');
    expect(cambios.primer_login).toBe(true);
    expect(cambios.contrasena_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(cambios.contrasena_hash).not.toContain('liceomarti');
    expect(await bcrypt.compare('liceomarti', cambios.contrasena_hash)).toBe(true);
    expect(await bcrypt.compare('otra', cambios.contrasena_hash)).toBe(false);
  });

  it.each(['profesor', 'orientador', 'epi', 'padre_de_familia'])('administrador puede restablecer a %s', async (rol) => {
    DB.setResolver(resolverObjetivo({ id_persona: 20, nombre_completo: 'X', nombre_rol: rol, id_usuario: 5 }));
    await expect(restablecerComo('administrador', 20)).resolves.toMatchObject({ nombre_rol: rol });
  });

  it.each(['administrador', 'super_administrador', 'estudiante'])('administrador NO puede restablecer a %s → 403', async (rol) => {
    DB.setResolver(resolverObjetivo({ id_persona: 20, nombre_completo: 'X', nombre_rol: rol, id_usuario: 5 }));
    const e = await restablecerComo('administrador', 20).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(403);
    expect(DB.llamadas.some((l) => l.tabla === 'usuariosistema')).toBe(false);
  });

  it('super administrador restablece a un administrador', async () => {
    DB.setResolver(resolverObjetivo({ id_persona: 30, nombre_completo: 'Admin', nombre_rol: 'administrador', id_usuario: 7 }));
    await expect(restablecerComo('super_administrador', 30)).resolves.toMatchObject({ nombre_rol: 'administrador' });
  });

  it.each(['profesor', 'orientador', 'epi', 'padre_de_familia', 'super_administrador'])(
    'super administrador NO puede restablecer a %s → 403',
    async (rol) => {
      DB.setResolver(resolverObjetivo({ id_persona: 30, nombre_completo: 'X', nombre_rol: rol, id_usuario: 7 }));
      const e = await restablecerComo('super_administrador', 30).catch((x) => x);
      expect(e.statusCode).toBe(403);
    }
  );

  it('nadie puede restablecer su propia contraseña → 400 sin tocar la BD', async () => {
    const e = await restablecerComo('administrador', 1, 1).catch((x) => x);
    expect(e.statusCode).toBe(400);
    expect(e.message).toMatch(/Cambiar contraseña/);
    expect(DB.llamadas).toHaveLength(0);
  });

  it.each(['profesor', 'epi', 'padre_de_familia'])('un %s no puede usar el servicio → 403', async (rol) => {
    const e = await restablecerComo(rol, 20).catch((x) => x);
    expect(e.statusCode).toBe(403);
    expect(DB.llamadas).toHaveLength(0);
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648', '', ' ', '12abc'])('id inválido %j → 400', async (id) => {
    const e = await restablecerComo('administrador', id).catch((x) => x);
    expect(e.statusCode).toBe(400);
  });

  it('persona inexistente → 404', async () => {
    DB.setResolver(resolverObjetivo(undefined));
    expect((await restablecerComo('administrador', 99).catch((x) => x)).statusCode).toBe(404);
  });

  it('persona sin cuenta de acceso (sin usuariosistema) → 404 y no se actualiza nada', async () => {
    DB.setResolver(resolverObjetivo({ id_persona: 20, nombre_completo: 'X', nombre_rol: 'profesor', id_usuario: null }));
    const e = await restablecerComo('administrador', 20).catch((x) => x);
    expect(e.statusCode).toBe(404);
    expect(e.message).toMatch(/cuenta/);
    expect(DB.llamadas.some((l) => l.tabla === 'usuariosistema')).toBe(false);
  });

  it('si el update no afecta filas → 404', async () => {
    DB.setResolver(resolverObjetivo({ id_persona: 20, nombre_completo: 'X', nombre_rol: 'profesor', id_usuario: 5 }, 0));
    expect((await restablecerComo('administrador', 20).catch((x) => x)).statusCode).toBe(404);
  });
});

describe('buscarUsuariosRestablecibles', () => {
  it('filtra por los roles permitidos, excluye al solicitante y limita a 50', async () => {
    DB.setResolver(() => [{ id_persona: 20, nombre_completo: 'Ana', nombre_rol: 'padre_de_familia' }]);
    const r = await buscarUsuariosRestablecibles('administrador', 1, '');
    expect(r).toEqual([{ id_persona: 20, nombre_completo: 'Ana', nombre_rol: 'padre_de_familia', rol_label: 'Encargado' }]);
    const q = DB.llamadas[0];
    const [[col, roles]] = DB.argsDe(q, 'whereIn');
    expect(JSON.stringify(col)).toContain('nombre_rol::text');
    expect(roles).toEqual(['profesor', 'orientador', 'epi', 'padre_de_familia']);
    expect(DB.argsDe(q, 'whereNot')).toEqual([['p.id_persona', 1]]);
    expect(DB.argsDe(q, 'limit')).toEqual([[50]]);
    expect(DB.tieneOp(q, 'where')).toBe(false); // sin texto no hay filtro de búsqueda
  });

  it('super administrador solo busca administradores', async () => {
    DB.setResolver(() => []);
    await buscarUsuariosRestablecibles('super_administrador', 1, 'x');
    const [[, roles]] = DB.argsDe(DB.llamadas[0], 'whereIn');
    expect(roles).toEqual(['administrador']);
  });

  it('con texto agrega el filtro y escapa comodines de LIKE', async () => {
    DB.setResolver(() => []);
    await buscarUsuariosRestablecibles('administrador', 1, '  50%_a\\b ');
    const q = DB.llamadas[0];
    expect(DB.tieneOp(q, 'where')).toBe(true);
    const ilikes = q.ops.filter((o) => /ILike/.test(o.op)).map((o) => o.args[1]);
    expect(ilikes.length).toBeGreaterThan(0);
    for (const patron of ilikes) expect(patron).toBe('%50\\%\\_a\\\\b%');
  });

  it('un arreglo en q se ignora (no rompe) y un rol sin permiso → 403', async () => {
    DB.setResolver(() => []);
    await expect(buscarUsuariosRestablecibles('administrador', 1, ['a', 'b'])).resolves.toEqual([]);
    expect((await buscarUsuariosRestablecibles('profesor', 1, '').catch((x) => x)).statusCode).toBe(403);
  });
});

describe('sesiones tras un restablecimiento (verificarToken)', () => {
  const CLAVE = 'clave-de-prueba-unitaria-0123456789';
  let previa;
  beforeEach(() => {
    previa = process.env.COOKIE_ENCRYPTION_KEY;
    process.env.COOKIE_ENCRYPTION_KEY = CLAVE;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    if (previa === undefined) delete process.env.COOKIE_ENCRYPTION_KEY;
    else process.env.COOKIE_ENCRYPTION_KEY = previa;
    vi.restoreAllMocks();
  });

  const fila = (primer_login) => ({
    id_persona: 20, nombre_rol: 'profesor', correo: 'p@x.cr', persona_activa: true, cuenta_activa: true, primer_login,
  });
  const resolver = (primer_login) => (r) => (r.tabla === 'persona as p' ? fila(primer_login) : undefined);
  async function correr(mw, cookies, params = {}) {
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    const next = vi.fn();
    await mw({ cookies, params }, res, next);
    return { res, next };
  }

  it('sesión normal con primer_login = true (restablecida) → 401 y no continúa', async () => {
    DB.setResolver(resolver(true));
    const token = CE.cifrarCookie(TR.firmarTokenAcceso({ id: 20, rol: 'profesor' }));
    const { res, next } = await correr(M.verificarTokenInterno, { token });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Su contraseña fue restablecida. Inicie sesión nuevamente.' });
  });

  it('sesión normal con primer_login = false o null sigue funcionando', async () => {
    for (const valor of [false, null, undefined]) {
      DB.setResolver(resolver(valor));
      const token = CE.cifrarCookie(TR.firmarTokenAcceso({ id: 20, rol: 'profesor' }));
      const { next } = await correr(M.verificarTokenInterno, { token });
      expect(next).toHaveBeenCalled();
    }
  });

  it('el token temporal de cambio de contraseña sí permite cambiarla aunque quede la cookie de sesión vieja', async () => {
    DB.setResolver(resolver(true));
    const vieja = CE.cifrarCookie(TR.firmarTokenAcceso({ id: 20, rol: 'profesor' }));
    const pendiente = CE.cifrarCookie(TR.firmarTokenPendientePassword(20));
    const { next, res } = await correr(
      M.verificarTokenCambioContrasena,
      { token: vieja, pending_password_change: pendiente },
      { id: '20' }
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('solo con la cookie de sesión vieja no se puede cambiar la contraseña → 401', async () => {
    DB.setResolver(resolver(true));
    const vieja = CE.cifrarCookie(TR.firmarTokenAcceso({ id: 20, rol: 'profesor' }));
    const { next, res } = await correr(M.verificarTokenCambioContrasena, { token: vieja }, { id: '20' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
