import { describe, it, expect } from 'vitest';
import * as R from '../../../../backend-node/src/utils/roles.js';

const ROLES = ['super_administrador', 'administrador', 'orientador', 'profesor', 'epi', 'padre_de_familia'];
const RAROS = [undefined, null, '', 'EPI', ' epi', 'Administrador', 'admin', 0, {}, ['epi']];

// Matriz de permisos esperada (caja negra por rol).
const MATRIZ = {
  esSuperAdministrador: ['super_administrador'],
  esAdministradorPlataforma: ['super_administrador', 'administrador'],
  esAdministradorOperativo: ['administrador'],
  puedeConsultarEstudiantes: ['super_administrador', 'administrador', 'profesor'],
  puedeListarCatalogoEstudiantes: ['super_administrador', 'administrador', 'orientador', 'profesor'],
  tieneListadoGlobalEstudiantes: ['super_administrador', 'administrador', 'orientador'],
  puedeVerReportesEstrategicos: ['super_administrador', 'administrador', 'orientador'],
  puedeLeerOrientacion: ['super_administrador', 'administrador', 'orientador'],
  puedeListarJustificacionesGlobales: ['super_administrador', 'administrador', 'orientador', 'profesor'],
  tieneAlcanceGlobalJustificaciones: ['super_administrador', 'administrador', 'orientador'],
  puedeVerReportesEpi: ['super_administrador', 'administrador', 'epi'],
};

describe('roles.js — constantes', () => {
  it('ROL_EPI es "epi" y el resto de constantes coinciden', () => {
    expect(R.ROL_EPI).toBe('epi');
    expect(R.ROL_SUPER_ADMIN).toBe('super_administrador');
    expect(R.ROL_ADMIN).toBe('administrador');
    expect(R.ROL_ORIENTADOR).toBe('orientador');
    expect(R.ROL_PROFESOR).toBe('profesor');
  });
});

describe('roles.js — matriz de permisos', () => {
  for (const [fn, permitidos] of Object.entries(MATRIZ)) {
    describe(fn, () => {
      it.each(ROLES)(`rol %s`, (rol) => {
        expect(R[fn](rol)).toBe(permitidos.includes(rol));
      });
      it.each(RAROS)('valor no válido %j → false', (rol) => {
        expect(R[fn](rol)).toBe(false);
      });
    });
  }

  it('el rol epi NO tiene acceso a funciones fuera de reportes EPI (mínimo privilegio)', () => {
    const conAcceso = Object.keys(MATRIZ).filter((fn) => R[fn]('epi'));
    expect(conAcceso).toEqual(['puedeVerReportesEpi']);
  });

  it('orientador y profesor NO ven reportes EPI', () => {
    expect(R.puedeVerReportesEpi('orientador')).toBe(false);
    expect(R.puedeVerReportesEpi('profesor')).toBe(false);
  });
});

describe('etiquetaRolPersona', () => {
  it.each([
    ['super_administrador', 'Super administrador'],
    ['administrador', 'Administrador'],
    ['orientador', 'Orientador'],
    ['profesor', 'Profesor'],
    ['epi', 'Equipo de Permanencia Estudiantil'],
    ['padre_de_familia', 'Encargado'],
    ['rol_nuevo_desconocido', 'rol nuevo desconocido'],
    ['sin_guiones', 'sin guiones'],
    ['EPI', 'EPI'],
    [42, '42'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    [0, ''],
  ])('%j → %j', (rol, esperado) => {
    expect(R.etiquetaRolPersona(rol)).toBe(esperado);
  });

  it('claves heredadas de Object.prototype ("constructor", "toString") devuelven texto, no una función', () => {
    // Caja blanca: ETIQUETAS_ROL es un literal de objeto → hereda de Object.prototype.
    const v = R.etiquetaRolPersona('constructor');
    expect(v).toBe('constructor'); // CORREGIDO D-05: antes devolvía la función Object
  });

  it('CORREGIDO D-05 (expectativa correcta): etiquetaRolPersona("toString") debería devolver un string', () => {
    expect(typeof R.etiquetaRolPersona('toString')).toBe('string');
  });
});
