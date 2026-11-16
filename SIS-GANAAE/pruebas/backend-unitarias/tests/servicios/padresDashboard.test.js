/** Ciclo 20: padresEstadosService + padresDashboardService (BD simulada, reloj simulado). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import { listEstadosEspecialesHijo } from '../../../../backend-node/src/services/padresEstadosService.js';
import { obtenerDashboardHijo } from '../../../../backend-node/src/services/padresDashboardService.js';

const TZ0 = process.env.TZ;
beforeEach(() => {
  DB.reset();
  process.env.TZ = 'America/Costa_Rica';
});
afterEach(() => {
  vi.useRealTimers();
  if (TZ0 === undefined) delete process.env.TZ;
  else process.env.TZ = TZ0;
});

const estados = [
  { id_estado_periodo: 1, tipo_estado: 'suspension', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-14' }, // termina hoy
  { id_estado_periodo: 2, tipo_estado: 'permiso_institucional', fecha_inicio: '2026-11-15', fecha_fin: '2026-11-16' }, // empieza mañana
  { id_estado_periodo: 3, tipo_estado: 'expulsion', fecha_inicio: '2026-12-01', fecha_fin: null },
  { id_estado_periodo: 4, tipo_estado: 'otro', fecha_inicio: new Date(2026, 0, 1), fecha_fin: null },
];

const resolver = ({ estudiante = { id_persona: 5, nombre_completo: 'Hijo', cedula: '1' } } = {}) => (q) => {
  if (q.tabla === 'matricula as m') return q.ops.some((o) => o.op === 'leftJoin') ? { anio_curso_lectivo: 2026 } : { ok: 1 };
  if (q.tabla === 'persona') return estudiante;
  if (q.tabla === 'persona as p') return { id_persona: 5, nombre_completo: 'Hijo', cedula: '1' };
  if (q.tabla === 'estado_estudiante_periodo') return estados;
  if (q.tabla === 'asistencia as a') return [];
  return undefined;
};

describe('listEstadosEspecialesHijo', () => {
  it('mapea etiquetas y fechas; 404 si el estudiante no existe', async () => {
    DB.setResolver(resolver());
    const r = await listEstadosEspecialesHijo(1, 5);
    expect(r.total).toBe(4);
    expect(r.registros.map((x) => x.tipo_estado_label)).toEqual(['Suspensión', 'Permiso Institucional', 'Expulsión', 'otro']);
    expect(r.registros[3].fecha_inicio).toBe('2026-01-01');
    expect(r.registros[2].es_expulsion).toBe(true);
    DB.setResolver(resolver({ estudiante: null }));
    expect((await listEstadosEspecialesHijo(1, 5).catch((e) => e)).status).toBe(404);
  });
});

describe('obtenerDashboardHijo', () => {
  it('a las 10:00 (hora CR): estados activos = el que termina hoy, el sin fin ya iniciado y la expulsión', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 10, 0));
    DB.setResolver(resolver());
    const r = await obtenerDashboardHijo(1, 5);
    expect(r.estados_activos.map((e) => e.id_estado_periodo)).toEqual([1, 3, 4]);
    expect(r.rango_mes).toEqual({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
    expect(r.anio_lectivo).toBe(2026);
  });

  it('CORREGIDO D-19: a las 20:00 (hora CR) "hoy" sigue siendo el 14: el estado que termina hoy sigue activo y el de mañana no', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 20, 0)); // 2026-11-15 02:00 UTC
    DB.setResolver(resolver());
    const r = await obtenerDashboardHijo(1, 5);
    expect(r.estados_activos.map((e) => e.id_estado_periodo)).toEqual([1, 3, 4]);
    const anual = DB.llamadas.find((l) => l.tabla === 'asistencia as a');
    expect(DB.argsDe(anual, 'whereBetween')[0][1]).toEqual(['2026-01-01', '2026-11-14']);
  });

  it('CORREGIDO D-19 (expectativa correcta): a las 20:00 hora CR el estado que termina hoy sigue activo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 20, 0));
    DB.setResolver(resolver());
    const r = await obtenerDashboardHijo(1, 5);
    expect(r.estados_activos.map((e) => e.id_estado_periodo)).toContain(1);
  });
});

describe('obtenerDashboardHijo — ramas restantes', () => {
  it('sin estados y sin año de matrícula → listas vacías y año del reloj', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 2, 3, 9, 0));
    DB.setResolver((q) => {
      if (q.tabla === 'matricula as m') return q.ops.some((o) => o.op === 'leftJoin') ? undefined : { ok: 1 };
      if (q.tabla === 'persona') return { id_persona: 5 };
      if (q.tabla === 'persona as p') return { id_persona: 5, nombre_completo: 'Hijo' };
      if (q.tabla === 'estado_estudiante_periodo') return [];
      return [];
    });
    const r = await obtenerDashboardHijo(1, 5);
    expect(r.estados_activos).toEqual([]);
    expect(r.estados_orientacion).toEqual([]);
    expect(r.anio_lectivo).toBe(2027);
    expect(r.rango_mes).toEqual({ fecha_inicio: '2027-03-01', fecha_fin: '2027-03-31' });
  });

  it('estado sin fecha_fin que empieza en el futuro no está activo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 9, 0));
    DB.setResolver((q) => {
      if (q.tabla === 'matricula as m') return q.ops.some((o) => o.op === 'leftJoin') ? { anio_curso_lectivo: 2026 } : { ok: 1 };
      if (q.tabla === 'persona') return { id_persona: 5 };
      if (q.tabla === 'persona as p') return { id_persona: 5 };
      if (q.tabla === 'estado_estudiante_periodo') return [{ id_estado_periodo: 8, tipo_estado: 'permiso_institucional', fecha_inicio: '2026-12-01', fecha_fin: null }];
      return [];
    });
    expect((await obtenerDashboardHijo(1, 5)).estados_activos).toEqual([]);
  });
});
