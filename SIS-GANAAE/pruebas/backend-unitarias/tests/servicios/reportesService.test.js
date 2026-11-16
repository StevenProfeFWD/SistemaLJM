/** Ciclo 10: reportes estratégicos (comparación de fórmulas con el reporte EPI). BD simulada. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setResolver, reset, llamadas, argsDe } from '../helpers/dbMock.js';
import { obtenerEstadisticasReportes, obtenerAlertasPermanencia } from '../../../../backend-node/src/services/reportesService.js';
import { parseRangoFechas } from '../../../../backend-node/src/services/padresAsistenciaService.js';
import { getEstadisticasReportes, getPermanenciaAlertas } from '../../../../backend-node/src/controllers/reportesController.js';
import { obtenerReporteAsistenciaEpi } from '../../../../backend-node/src/services/epiReportesService.js';
import { resolverEpi, fila } from '../helpers/epiFixtures.js';

beforeEach(() => reset());
afterEach(() => vi.useRealTimers());

const r = (id_estudiante, nombre, id_seccion, nombre_seccion, id_materia, nombre_materia, estado, fecha = '2026-03-02') => ({
  id_estudiante, nombre_completo: nombre, id_seccion, nombre_seccion, id_materia, nombre_materia, estado, fecha,
});

describe('parseRangoFechas', () => {
  it('por defecto: mes actual (local)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 1, 10));
    expect(parseRangoFechas()).toEqual({ fecha_inicio: '2024-02-01', fecha_fin: '2024-02-29' });
  });
  it('fechas válidas con espacios; inválidas → por defecto', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14));
    expect(parseRangoFechas(' 2026-01-01 ', '2026-01-31')).toEqual({ fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31' });
    expect(parseRangoFechas('01/01/2026', 'x')).toEqual({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
  });
  it('inicio > fin → error con status 400 (propiedad status, no statusCode)', () => {
    try {
      parseRangoFechas('2026-02-01', '2026-01-01');
      expect.unreachable();
    } catch (e) {
      expect(e.status).toBe(400);
      expect(e.statusCode).toBeUndefined();
    }
  });
  it('solo fin válido anterior al inicio por defecto → error (inicio por defecto > fin)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14));
    expect(() => parseRangoFechas(undefined, '2026-01-01')).toThrow(/posterior/);
  });
});

describe('obtenerEstadisticasReportes', () => {
  const filas = [
    r(1, 'Ana', 1, '7-1', 10, 'Mate', 'presente'),
    r(1, 'Ana', 1, '7-1', 11, 'Español', 'tardanza'),
    r(2, 'Beto', 1, '7-1', 10, 'Mate', 'ausente'),
    r(3, 'Caro', 2, '7-2', 10, 'Mate', 'justificado', new Date(2026, 2, 3)),
  ];

  it('KPIs, agrupación por sección/materia y matriz de exportación', async () => {
    setResolver((q) => (q.tabla === 'asistencia as a' ? filas : []));
    const res = await obtenerEstadisticasReportes({ fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31', id_seccion: '1', id_materia: '' });
    expect(res.kpis).toMatchObject({ total_registros: 4, presentes: 1, tardias: 1, nivel_asistencia_pct: 75, puntualidad_pct: 25 });
    expect(res.por_seccion.map((s) => [s.nombre_seccion, s.nivel_asistencia_pct])).toEqual([['7-1', 67], ['7-2', 100]]);
    expect(res.kpis.nivel_asistencia_promedio).toBe(84); // promedio simple de secciones (67+100)/2 = 83.5 → 84
    expect(res.por_materia.map((m) => m.nombre_materia)).toEqual(['Español', 'Mate']);
    expect(res.matriz_exportacion[3]).toEqual({ nombre: 'Caro', fecha: '2026-03-03', seccion: '7-2', materia: 'Mate', condicion: 'Ausencia Justificada', estado: 'justificado' });
    expect(argsDe(llamadas[0], 'where')).toEqual([['pms.id_seccion', 1]]);
  });

  it('sin filas: nivel promedio = nivel global (100)', async () => {
    setResolver(() => []);
    const res = await obtenerEstadisticasReportes({});
    expect(res.kpis.nivel_asistencia_promedio).toBe(100);
    expect(res.por_seccion).toEqual([]);
  });

  it.each([['abc', 'id_seccion inválido'], ['x1', 'id_seccion inválido']])('id_seccion=%s → status 400', async (v, msg) => {
    const e = await obtenerEstadisticasReportes({ id_seccion: v }).catch((x) => x);
    expect(e.status).toBe(400);
    expect(e.message).toBe(msg);
  });

  it('id_materia inválido → 400', async () => {
    const e = await obtenerEstadisticasReportes({ id_materia: 'zz' }).catch((x) => x);
    expect(e.message).toBe('id_materia inválido');
  });

  it('OBSERVACIÓN: ids 0 y negativos NO se rechazan aquí (a diferencia de EPI)', async () => {
    setResolver(() => []);
    const res = await obtenerEstadisticasReportes({ id_seccion: '-4', id_materia: 0 });
    expect(res.filtros.id_seccion).toBe(-4);
    expect(res.filtros.id_materia).toBe(0);
  });

  it('OBSERVACIÓN O-08: el mismo conjunto de marcas da % distinto en reportes estratégicos y en EPI', async () => {
    // 1 presente, 1 tardanza, 1 justificado, 1 ausente
    const marcas = ['presente', 'tardanza', 'justificado', 'ausente'];
    setResolver((q) => (q.tabla === 'asistencia as a' ? marcas.map((e) => r(1, 'A', 1, 'S', 1, 'M', e)) : []));
    const estr = await obtenerEstadisticasReportes({});
    reset();
    setResolver(resolverEpi({ agregadas: marcas.map((e) => fila(1, 'S', 1, 'M', e, '1')) }));
    const epi = await obtenerReporteAsistenciaEpi({ periodo: 'mensual', fecha_referencia: '2026-03-01' });
    expect(estr.kpis.nivel_asistencia_pct).toBe(75); // (total - injustificadas)/total
    expect(epi.resumen_general.porcentaje_asistencia).toBe(50); // (presentes + tardías)/total
  });
});

describe('obtenerAlertasPermanencia', () => {
  it('umbral 3: motivo según tipo y orden por puntaje (ausencias×2 + tardías)', async () => {
    const filas = [
      ...Array(3).fill(r(1, 'Tardón', 1, '7-1', 1, 'M', 'tardanza')),
      ...Array(3).fill(r(2, 'Ausente', 1, '7-1', 1, 'M', 'ausente')),
      ...Array(3).fill(r(3, 'Ambos', 2, '7-2', 1, 'M', 'TARDANZA')),
      ...Array(3).fill(r(3, 'Ambos', 2, '7-2', 1, 'M', 'justificado')),
      ...Array(2).fill(r(4, 'Bajo umbral', 1, '7-1', 1, 'M', 'ausente')),
      r(5, 'Sin estado', null, null, 1, 'M', null),
    ];
    setResolver((q) => {
      if (q.tabla === 'asistencia as a') return filas;
      if (q.tabla === 'matricula as m') return [{ id_persona_estudiante: 2, nombre_seccion: '8-1', id_seccion: 9 }];
      return [];
    });
    const res = await obtenerAlertasPermanencia({});
    expect(res.total_alertas).toBe(3);
    expect(res.alertas.map((a) => [a.nombre_completo, a.motivo])).toEqual([
      ['Ambos', 'Tardías y ausencias acumuladas'],
      ['Ausente', 'Ausencias acumuladas'],
      ['Tardón', 'Tardías acumuladas'],
    ]);
    expect(res.alertas[1]).toMatchObject({ id_seccion: 9, nombre_seccion: '8-1' }); // sección de matrícula vigente
    expect(res.umbrales).toEqual({ tardias: 3, ausencias: 3 });
  });

  it('justificadas cuentan como ausencias para la alerta', async () => {
    setResolver((q) => (q.tabla === 'asistencia as a' ? Array(3).fill(r(1, 'J', 1, 'S', 1, 'M', 'justificado')) : []));
    expect((await obtenerAlertasPermanencia({})).alertas[0].motivo).toBe('Ausencias acumuladas');
  });

  it('sección desconocida → "—"', async () => {
    setResolver((q) => (q.tabla === 'asistencia as a' ? Array(3).fill(r(1, 'J', null, null, 1, 'M', 'ausente')) : []));
    expect((await obtenerAlertasPermanencia({})).alertas[0].nombre_seccion).toBe('—');
  });
});

describe('reportesController', () => {
  const fakeRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  };

  it('éxito → json', async () => {
    setResolver(() => []);
    const res = fakeRes();
    await getEstadisticasReportes({ query: {} }, res);
    expect(res.status).not.toHaveBeenCalled();
    await getPermanenciaAlertas({ query: {} }, res);
    expect(res.json).toHaveBeenCalledTimes(2);
  });

  it('error de validación → 400 con mensaje', async () => {
    const res = fakeRes();
    await getEstadisticasReportes({ query: { id_seccion: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    await getPermanenciaAlertas({ query: { id_materia: 'x' } }, res);
    expect(res.status).toHaveBeenLastCalledWith(400);
  });

  it('OBSERVACIÓN O-09 (seguridad): un error interno de BD devuelve 500 con el mensaje técnico al cliente', async () => {
    setResolver(() => {
      throw new Error('relation "asistencia" does not exist');
    });
    const res = fakeRes();
    await getEstadisticasReportes({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'relation "asistencia" does not exist' });
    await getPermanenciaAlertas({ query: {} }, res);
    expect(res.json).toHaveBeenLastCalledWith({ error: 'relation "asistencia" does not exist' });
  });

  it('error sin mensaje → texto por defecto', async () => {
    setResolver(() => {
      throw new Error('');
    });
    const res = fakeRes();
    await getEstadisticasReportes({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error al generar estadísticas' });
    await getPermanenciaAlertas({ query: {} }, res);
    expect(res.json).toHaveBeenLastCalledWith({ error: 'Error al consultar alertas' });
  });
});
