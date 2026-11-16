import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listarEstudiantesSeccionEpi } from '../../../../backend-node/src/services/epiReportesService.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import { setResolver, reset, llamadas } from '../helpers/dbMock.js';
import { resolverEpi, argsDe } from '../helpers/epiFixtures.js';

beforeEach(() => reset());
afterEach(() => vi.useRealTimers());

const est = (id, nombre, cedula = `c${id}`) => ({ id_estudiante: id, nombre_completo: nombre, cedula });

describe('listarEstudiantesSeccionEpi', () => {
  it('une matriculados + con asistencia sin duplicar y ordena por nombre', async () => {
    setResolver(
      resolverEpi({
        matriculados: [est(1, 'Zoe'), est(2, 'Ángel'), est(3, 'beto')],
        conAsistencia: [est(2, 'Ángel'), est(4, 'Carla')],
      })
    );
    const r = await listarEstudiantesSeccionEpi('7', { anio: '2026' });
    expect(r.id_seccion).toBe(7);
    expect(r.anio).toBe(2026);
    expect(r.estudiantes.map((e) => e.id_estudiante)).toEqual([2, 3, 4, 1]); // Ángel, beto, Carla, Zoe (collation es)
  });

  it('si el mismo id aparece en ambas fuentes, prevalece el registro de asistencia (último set)', async () => {
    setResolver(
      resolverEpi({ matriculados: [est(1, 'Nombre viejo')], conAsistencia: [est(1, 'Nombre nuevo')] })
    );
    const r = await listarEstudiantesSeccionEpi(1, { anio: 2026 });
    expect(r.estudiantes).toEqual([est(1, 'Nombre nuevo')]);
  });

  it('aplica filtros correctos: sección, año, excluye matrícula cancelada, rango de fechas del año', async () => {
    setResolver(resolverEpi());
    await listarEstudiantesSeccionEpi(5, { anio: 2024 });
    const mat = llamadas.find((r) => r.tabla === 'matricula as m');
    const asi = llamadas.find((r) => r.tabla === 'asistencia as a');
    expect(argsDe(mat, 'where')).toEqual([
      ['m.id_seccion', 5],
      ['cl.anio_curso_lectivo', 2024],
    ]);
    expect(argsDe(mat, 'whereNot')).toEqual([['m.estado', 'cancelada']]);
    expect(argsDe(asi, 'where')).toEqual([['pms.id_seccion', 5]]);
    expect(argsDe(asi, 'whereBetween')).toEqual([['a.fecha', ['2024-01-01', '2024-12-31']]]);
  });

  it('año ausente usa el año actual; no numérico → 400 (CORREGIDO D-04)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2031, 5, 1));
    setResolver(resolverEpi());
    expect((await listarEstudiantesSeccionEpi(1)).anio).toBe(2031);
    expect((await listarEstudiantesSeccionEpi(1, { anio: '' })).anio).toBe(2031);
    const e = await listarEstudiantesSeccionEpi(1, { anio: 'abc' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it.each([
    ['-5', -5, '-5-01-01'],
    ['0', 0, '0-01-01'],
    ['20261', 20261, '20261-01-01'],
    ['2026abc', 2026, '2026-01-01'],
  ])(
    'CORREGIDO D-04: anio=%s se rechaza con 400 (antes anio %i y rango "%s" llegaba a la BD)',
    async (anioRaw) => {
      setResolver(resolverEpi());
      const e = await listarEstudiantesSeccionEpi(1, { anio: anioRaw }).catch((x) => x);
      expect(e).toBeInstanceOf(AppError);
      expect(e.statusCode).toBe(400);
      expect(llamadas.find((x) => x.tabla === 'asistencia as a')).toBeUndefined();
    }
  );

  it.each([undefined, null, '', '  '])('id_seccion vacío (%s) → AppError 400 "id_seccion requerido"', async (v) => {
    const e = await listarEstudiantesSeccionEpi(v).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe('id_seccion requerido');
    expect(llamadas).toHaveLength(0);
  });

  it.each(['0', '-3', 'abc', "1'; DROP TABLE persona;--x"])(
    'id_seccion inválido (%s) → AppError 400 "id_seccion inválido" (CORREGIDO D-03: ya no acepta prefijo numérico)',
    async (v) => {
      setResolver(resolverEpi());
      const res = await listarEstudiantesSeccionEpi(v).catch((x) => x);
      expect(res).toBeInstanceOf(AppError);
      expect(res.message).toBe('id_seccion inválido');
    }
  );

  it('sección sin estudiantes → lista vacía', async () => {
    setResolver(resolverEpi());
    const r = await listarEstudiantesSeccionEpi(3, { anio: 2026 });
    expect(r.estudiantes).toEqual([]);
  });

  it('propaga errores de BD', async () => {
    setResolver((reg) => {
      if (reg.tabla === 'matricula as m') throw new Error('timeout');
      return [];
    });
    await expect(listarEstudiantesSeccionEpi(3)).rejects.toThrow('timeout');
  });
});
