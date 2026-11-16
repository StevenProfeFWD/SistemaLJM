/** Ciclo 15: alta de personas con rol "epi" (personaController.postPersona). BD simulada. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import { postPersona } from '../../../../backend-node/src/controllers/personaController.js';

beforeEach(() => DB.reset());

const body = (extra = {}) => ({
  nombre_completo: 'Equipo EPI Uno',
  cedula: '1-1111-1111',
  correo: 'epi1@liceo.cr',
  telefono: '8888-8888',
  direccion: 'San José',
  fecha_nacimiento: '1990-01-01',
  nombre_rol: 'epi',
  ...extra,
});
const fakeRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};
const correr = async (b) => {
  const res = fakeRes();
  await postPersona({ body: b, user: { rol: 'administrador', id: 1 } }, res);
  return res;
};

describe('postPersona — rol EPI', () => {
  it('registra una persona EPI (201) dentro de una transacción, sin materias habilitadas', async () => {
    DB.setResolver((q) => (q.trx ? [{ id_persona: 77 }] : undefined));
    const res = await correr(body());
    expect(res.status).toHaveBeenCalledWith(201);
    const ins = DB.llamadas.filter((l) => l.trx);
    expect(ins.map((l) => l.tabla)).toEqual(['persona']);
    expect(DB.argsDe(ins[0], 'insert')[0][0]).toMatchObject({ nombre_rol: 'epi', correo: 'epi1@liceo.cr' });
  });

  it('materias_habilitadas enviadas para EPI se ignoran (solo aplican a profesor)', async () => {
    DB.setResolver((q) => (q.trx ? [{ id_persona: 77 }] : undefined));
    await correr(body({ materias_habilitadas: [1, 2] }));
    expect(DB.llamadas.some((l) => l.tabla === 'profesor_materia_habilitacion')).toBe(false);
  });

  it.each([
    [{ nombre_rol: 'administrador' }, 403],
    [{ nombre_rol: 'super_administrador' }, 403],
    [{ nombre_rol: 'estudiante' }, 403],
    [{ nombre_rol: 'EPI' }, 400],
    [{ nombre_rol: 'epi ' }, 400],
    [{ nombre_rol: 'rol_inventado' }, 400],
    [{ correo: '' }, 400],
    [{ nombre_rol: undefined }, 400],
    [{ nombre_rol: 'profesor' }, 400], // profesor sin materias
  ])('%j → %i sin escribir en BD', async (extra, st) => {
    const res = await correr(body(extra));
    expect(res.status).toHaveBeenCalledWith(st);
    expect(DB.llamadas.some((l) => l.trx)).toBe(false);
  });

  it('correo o cédula duplicados → 409', async () => {
    DB.setResolver((q) => (DB.argsDe(q, 'where')[0]?.[0]?.correo ? { id: 1 } : undefined));
    expect((await correr(body())).status).toHaveBeenCalledWith(409);
    DB.setResolver((q) => (DB.argsDe(q, 'where')[0]?.[0]?.cedula ? { id: 1 } : undefined));
    const res = await correr(body());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.lastCall[0].message).toMatch(/ced/);
  });

  it('profesor con materias: inserta habilitaciones (control)', async () => {
    DB.setResolver((q) => (q.trx ? [{ id_persona: 70 }] : undefined));
    await correr(body({ nombre_rol: 'profesor', materias_habilitadas: ['3', 3, 'x', 4] }));
    const hab = DB.llamadas.find((l) => l.tabla === 'profesor_materia_habilitacion');
    expect(DB.argsDe(hab, 'insert')[0][0]).toEqual([
      { id_persona_profesor: 70, id_materia: 3 },
      { id_persona_profesor: 70, id_materia: 4 },
    ]);
  });

  it('OBSERVACIÓN O-15: no se valida formato de correo, cédula ni fecha (p. ej. correo "no-es-correo")', async () => {
    DB.setResolver((q) => (q.trx ? [{ id_persona: 77 }] : undefined));
    const res = await correr(body({ correo: 'no-es-correo', fecha_nacimiento: 'ayer' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
