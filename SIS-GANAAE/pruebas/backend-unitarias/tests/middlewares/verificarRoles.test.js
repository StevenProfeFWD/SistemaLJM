import { describe, it, expect, vi } from 'vitest';
import * as M from '../../../../backend-node/src/middlewares/verificarRoles.js';

const ROLES = ['super_administrador', 'administrador', 'orientador', 'profesor', 'epi', 'padre_de_familia'];

function fakeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function ejecutar(mw, user) {
  const req = user === undefined ? {} : { user };
  const res = fakeRes();
  const next = vi.fn();
  const ret = mw(req, res, next);
  return { req, res, next, ret };
}

const MATRIZ = {
  verificarConsultaCatalogoPersonas: [['super_administrador', 'administrador', 'orientador'], 'Acceso restringido a personal administrativo autorizado'],
  verificarPersonalAcademico: [['super_administrador', 'administrador', 'orientador', 'profesor'], 'Acceso restringido al personal académico autorizado'],
  verificarSuperAdministrador: [['super_administrador'], 'Acceso exclusivo del Super Administrador'],
  verificarAdminMatricula: [['administrador'], 'Solo los administradores pueden realizar esta acción'],
  verificarAdminAsignacion: [['administrador'], 'Solo administradores pueden realizar esta acción'],
  verificarProfesorOAdmin: [['super_administrador', 'administrador', 'profesor'], 'Acceso denegado'],
  verificarConsultaEstudiantes: [['super_administrador', 'administrador', 'profesor'], 'Acceso denegado'],
  verificarPadreDeFamilia: [['padre_de_familia'], 'Solo encargados pueden acceder a esta información'],
  verificarAdminOOrientador: [['administrador', 'orientador'], 'Acceso restringido a administradores y orientadores'],
  verificarLecturaOrientacion: [['super_administrador', 'administrador', 'orientador'], 'Acceso restringido a consulta de orientación'],
  verificarAdminOReportes: [['super_administrador', 'administrador', 'orientador'], 'Acceso restringido a reportes estratégicos'],
  verificarComprobanteOrientacionLectura: [['administrador', 'orientador', 'padre_de_familia', 'super_administrador'], 'No autorizado para descargar este comprobante'],
  verificarReportesEpi: [['super_administrador', 'administrador', 'epi'], 'Acceso restringido al Equipo de Permanencia Estudiantil'],
};

describe('verificarRoles — cobertura de exports', () => {
  it('todos los middlewares exportados están en la matriz de pruebas', () => {
    expect(Object.keys(M).sort()).toEqual(Object.keys(MATRIZ).sort());
  });
});

describe.each(Object.entries(MATRIZ))('%s', (nombre, [permitidos, mensaje]) => {
  const mw = M[nombre];

  it.each(ROLES)('rol %s', (rol) => {
    const { res, next } = ejecutar(mw, { rol });
    if (permitidos.includes(rol)) {
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: mensaje });
    }
  });

  it.each([{}, { rol: null }, { rol: 'EPI' }, { rol: 'administrador ' }])('usuario sin rol válido %j → 403', (user) => {
    const { res, next } = ejecutar(mw, user);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('req.user ausente (middleware usado sin verificarToken)', () => {
  const tolerantes = ['verificarConsultaCatalogoPersonas', 'verificarPersonalAcademico', 'verificarReportesEpi'];

  it.each(tolerantes)('%s usa optional chaining → responde 403', (nombre) => {
    const { res, next } = ejecutar(M[nombre], undefined);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(Object.keys(MATRIZ).filter((n) => !tolerantes.includes(n)))(
    'OBSERVACIÓN O-01: %s lanza TypeError si req.user no existe (inconsistente con verificarReportesEpi)',
    (nombre) => {
      expect(() => ejecutar(M[nombre], undefined)).toThrow(TypeError);
    }
  );
});

describe('verificarReportesEpi — detalles', () => {
  it('devuelve el resultado de res.json (return temprano) y no llama next', () => {
    const { ret, res, next } = ejecutar(M.verificarReportesEpi, { rol: 'profesor' });
    expect(ret).toBe(res);
    expect(next).not.toHaveBeenCalled();
  });

  it('no modifica req.user', () => {
    const user = { rol: 'epi', id: 1 };
    const { req } = ejecutar(M.verificarReportesEpi, user);
    expect(req.user).toEqual({ rol: 'epi', id: 1 });
  });

  it('rol como objeto con toString "epi" no se acepta (comparación estricta)', () => {
    const { next } = ejecutar(M.verificarReportesEpi, { rol: { toString: () => 'epi' } });
    expect(next).not.toHaveBeenCalled();
  });
});
