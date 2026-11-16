/** Ciclo 21: ¿el módulo de gestión de personal contempla al nuevo rol "epi"? (personalService, BD simulada) */
import { describe, it, expect, beforeEach } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import { cambiarEstadoPersonal, actualizarPersonal, listarPersonal } from '../../../../backend-node/src/services/personalService.js';

beforeEach(() => DB.reset());

/** Simula una BD donde la persona 77 es "epi": responde solo si el whereIn de roles incluye 'epi'. */
const resolverEpi77 = (q) => {
  if (q.tabla === 'persona' && DB.argsDe(q, 'first').length) {
    // La columna se pasa como db.raw('nombre_rol::text') (tolera que la migración del enum aún no se haya ejecutado)
    const roles = DB.argsDe(q, 'whereIn').find((a) => Array.isArray(a[1]))?.[1] || [];
    return roles.includes('epi') ? { id_persona: 77, nombre_rol: 'epi', activo: true } : undefined;
  }
  if (q.tabla === 'curso_lectivo') return { id_curso_lectivo: 1 };
  return [];
};

describe('personalService y el rol EPI', () => {
  it('CORREGIDO D-20: cambiarEstadoPersonal encuentra a un usuario EPI (ROLES_PERSONAL incluye epi)', async () => {
    DB.setResolver(resolverEpi77);
    const r = await cambiarEstadoPersonal(77, false);
    expect(r).toMatchObject({ id_persona: 77, activo: false });
    const q = DB.llamadas.find((l) => l.tabla === 'persona');
    const [[columna, roles]] = DB.argsDe(q, 'whereIn');
    expect(JSON.stringify(columna)).toContain('nombre_rol::text');
    expect(roles).toEqual(['profesor', 'orientador', 'epi']);
  });

  it('CORREGIDO D-20: actualizarPersonal ya encuentra al usuario EPI (con datos incompletos responde 400 de validación, no 404)', async () => {
    DB.setResolver(resolverEpi77);
    const e = await actualizarPersonal(77, { telefono: '1' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it('CORREGIDO D-20: listarPersonal incluye el rol epi', async () => {
    DB.setResolver(resolverEpi77);
    await listarPersonal();
    const q = DB.llamadas.find((l) => l.tabla === 'persona' && DB.argsDe(l, 'whereIn').length);
    expect(DB.argsDe(q, 'whereIn')[0][1]).toContain('epi');
  });

  it('listarPersonal etiqueta al usuario EPI como "Equipo de Permanencia Estudiantil (EPI)"', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'persona') return [{ id_persona: 77, nombre_completo: 'E', nombre_rol: 'epi', activo: true }];
      if (q.tabla === 'curso_lectivo') return { id_curso_lectivo: 1 };
      return [];
    });
    const lista = await listarPersonal();
    expect(lista[0]).toMatchObject({ rol_label: 'Equipo de Permanencia Estudiantil (EPI)', total_asignaciones: 0 });
  });

  it('CORREGIDO D-20 (expectativa correcta): un administrador debería poder inactivar una cuenta EPI', async () => {
    DB.setResolver(resolverEpi77);
    const r = await cambiarEstadoPersonal(77, false);
    expect(r.activo).toBe(false);
  });

  it('id inválido → 400', async () => {
    expect((await cambiarEstadoPersonal('x', true).catch((e) => e)).statusCode).toBe(400);
  });
});
