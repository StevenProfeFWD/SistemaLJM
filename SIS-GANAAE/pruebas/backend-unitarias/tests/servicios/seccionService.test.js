/** Ciclo 22: seccionService (cupos y profesor guía). BD simulada. */
import { describe, it, expect, beforeEach } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import * as S from '../../../../backend-node/src/services/seccionService.js';

beforeEach(() => DB.reset());

const err = async (p, st, msg) => {
  const e = await p.catch((x) => x);
  expect(e.statusCode).toBe(st);
  if (msg) expect(e.message).toMatch(msg);
};

describe('listarSeccionesConGuia', () => {
  it('cupos disponibles nunca negativos; sin curso lectivo → 0 estudiantes', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'seccion as s') return [{ id_seccion: 1, nombre_seccion: '7-1' }, { id_seccion: 2, nombre_seccion: '7-2', nombre_profesor_guia: 'P' }];
      if (q.tabla === 'curso_lectivo') return { id_curso_lectivo: 3 };
      if (q.tabla === 'matricula as m') return [{ id_seccion: 1, total: '30' }, { id_seccion: 2, total: '10' }];
      if (q.tabla === 'persona') return [{ id_persona: 9 }];
      return undefined;
    });
    const r = await S.listarSeccionesConGuia();
    expect(r.secciones.map((s) => [s.total_estudiantes, s.cupos_disponibles, s.nombre_profesor_guia])).toEqual([[30, 0, null], [10, 15, 'P']]);
    expect(r).toMatchObject({ max_secciones_guia_por_profesor: 2, cupo_maximo_por_seccion: 25 });
    DB.reset();
    DB.setResolver((q) => (q.tabla === 'seccion as s' ? [{ id_seccion: 1 }] : q.tabla === 'persona' ? [] : undefined));
    expect((await S.listarSeccionesConGuia()).secciones[0].total_estudiantes).toBe(0);
  });
});

describe('asignarProfesorGuia / revocarProfesorGuia', () => {
  const base = ({ seccion = { id_seccion: 1, nombre_seccion: '7-1', id_persona_profesor_guia: null }, profesor = { nombre_completo: 'Prof' }, otras = [] } = {}) => (q) => {
    if (q.tabla === 'seccion' && DB.argsDe(q, 'first').length) return seccion;
    if (q.tabla === 'seccion' && DB.argsDe(q, 'whereNot').length) return otras;
    if (q.tabla === 'persona') return profesor;
    return 1;
  };

  it('validaciones', async () => {
    await err(S.asignarProfesorGuia('x', 1), 400, /id_seccion/);
    await err(S.asignarProfesorGuia(1, 'y'), 400, /id_persona_profesor/);
    DB.setResolver(base({ seccion: null }));
    await err(S.asignarProfesorGuia(1, 2), 404, /Sección/);
    DB.setResolver(base({ profesor: null }));
    await err(S.asignarProfesorGuia(1, 2), 404, /Docente/);
  });

  it('ya es guía → mensaje sin actualizar', async () => {
    DB.setResolver(base({ seccion: { id_seccion: 1, nombre_seccion: '7-1', id_persona_profesor_guia: 2 } }));
    const r = await S.asignarProfesorGuia(1, 2);
    expect(r.message).toMatch(/ya es profesor guía/);
    expect(DB.llamadas.some((l) => DB.argsDe(l, 'update').length)).toBe(false);
  });

  it('máximo 2 secciones guía; con 1 se asigna', async () => {
    DB.setResolver(base({ otras: [{ nombre_seccion: '8-1' }, { nombre_seccion: '9-1' }] }));
    await err(S.asignarProfesorGuia(1, 2), 400, /8-1, 9-1/);
    DB.setResolver(base({ otras: [{ nombre_seccion: '8-1' }] }));
    const r = await S.asignarProfesorGuia('1', '2');
    expect(r).toMatchObject({ id_seccion: 1, id_persona_profesor_guia: 2, nombre_profesor_guia: 'Prof' });
  });

  it('revocar', async () => {
    await err(S.revocarProfesorGuia('x'), 400);
    DB.setResolver(base({ seccion: null }));
    await err(S.revocarProfesorGuia(1), 404);
    DB.setResolver(base());
    expect((await S.revocarProfesorGuia(1)).message).toMatch(/removido/);
  });
});
