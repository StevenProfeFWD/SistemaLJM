/** Ciclo 25: personalService.registrarSustitucion (transacción manual commit/rollback). BD simulada. */
import { describe, it, expect, beforeEach } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import { registrarSustitucion } from '../../../../backend-node/src/services/personalService.js';

beforeEach(() => DB.reset());

const body = (extra = {}) => ({ id_profesor_titular: 1, id_profesor_sustituto: 2, fecha_inicio: '2026-11-16', fecha_fin: '2026-11-20', ...extra });
const err = async (p, st, msg) => {
  const e = await p.catch((x) => x);
  expect(e.statusCode).toBe(st);
  if (msg) expect(e.message).toMatch(msg);
};

const resolver = ({ titular = { nombre_completo: 'Titular' }, sustituto = { nombre_completo: 'Sustituto' }, asignaciones = [{ id_profesor_materia_seccion: 10, id_materia: 5 }, { id_profesor_materia_seccion: 11, id_materia: 5 }], habilitadas = [{ id_materia: 5 }], solapada = undefined } = {}) => (q) => {
  if (q.tabla === 'persona') return DB.argsDe(q, 'where')[0][0].id_persona === 1 ? titular : sustituto;
  if (q.tabla === 'curso_lectivo') return { id_curso_lectivo: 3 };
  if (q.tabla === 'profesor_materia_seccion') return asignaciones;
  if (q.tabla === 'profesor_materia_habilitacion') return habilitadas;
  if (q.tabla === 'materia') return [{ nombre_materia: 'Física' }];
  if (q.tabla === 'sustitucion' && DB.argsDe(q, 'first').length) return solapada;
  if (q.tabla === 'sustitucion') return [{ id_sustitucion: 99 }];
  return undefined;
};

describe('registrarSustitucion', () => {
  it.each([
    [{ id_profesor_titular: 'x' }, 400, /obligatorios/],
    [{ id_profesor_sustituto: 1 }, 400, /distinto/],
    [{ fecha_inicio: '16/11/2026' }, 400, /formato/],
    [{ fecha_inicio: '2026-11-21' }, 400, /posterior/],
  ])('%j → %i', async (extra, st, msg) => {
    await err(registrarSustitucion(body(extra)), st, msg);
    expect(DB.llamadas).toHaveLength(0);
  });

  it('acepta alias fecha_desde/fecha_hasta y crea una sustitución por asignación con commit', async () => {
    DB.setResolver(resolver());
    const r = await registrarSustitucion({ id_profesor_titular: 1, id_profesor_sustituto: 2, fecha_desde: '2026-11-16', fecha_hasta: '2026-11-16' });
    expect(r.total_asignaciones).toBe(2);
    expect(r.message).toBe('Sustitución registrada: Sustituto cubrirá las 2 asignación(es) de Titular del 2026-11-16 al 2026-11-16.');
    expect(DB.transacciones).toEqual(['commit']);
  });

  it('titular/sustituto inexistente → 404; sin asignaciones → 400; sustituto no habilitado → 400 con materias', async () => {
    DB.setResolver(resolver({ titular: null }));
    await err(registrarSustitucion(body()), 404, /titular/);
    DB.setResolver(resolver({ sustituto: null }));
    await err(registrarSustitucion(body()), 404, /sustituto/);
    DB.setResolver(resolver({ asignaciones: [] }));
    await err(registrarSustitucion(body()), 400, /asignaciones/);
    DB.setResolver(resolver({ habilitadas: [] }));
    await err(registrarSustitucion(body()), 400, /Física/);
  });

  it('solapamiento → 409 y rollback (no commit)', async () => {
    DB.setResolver(resolver({ solapada: { id_sustitucion: 1 } }));
    await err(registrarSustitucion(body()), 409, /solapa/);
    expect(DB.transacciones).toEqual(['rollback']);
  });

  it('OBSERVACIÓN: fechas con formato válido pero inexistentes (2026-02-30) no se rechazan', async () => {
    DB.setResolver(resolver());
    const r = await registrarSustitucion(body({ fecha_inicio: '2026-02-30', fecha_fin: '2026-02-31' }));
    expect(r.total_asignaciones).toBe(2);
  });
});
