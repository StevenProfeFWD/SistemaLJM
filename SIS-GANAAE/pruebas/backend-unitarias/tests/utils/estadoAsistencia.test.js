import { describe, it, expect } from 'vitest';
import {
  ESTADO_ASISTENCIA_OFICIAL,
  etiquetaEstadoOficial,
  calcularResumenAsistencia,
  contarEstadosAsistencia,
  calcularMetricasAnaliticas,
} from '../../../../backend-node/src/utils/estadoAsistencia.js';

const regs = (...estados) => estados.map((estado) => ({ estado }));

describe('etiquetaEstadoOficial', () => {
  it.each(Object.entries(ESTADO_ASISTENCIA_OFICIAL))('%s → %s', (k, v) => {
    expect(etiquetaEstadoOficial(k)).toBe(v);
  });
  it.each([
    ['  PRESENTE ', 'Presente'],
    ['Tardanza', 'Tardía'],
    ['desconocido', 'desconocido'],
    ['', 'Sin clasificar'],
    [null, 'Sin clasificar'],
    [undefined, 'Sin clasificar'],
    [0, 'Sin clasificar'],
  ])('%j → %j', (v, e) => {
    expect(etiquetaEstadoOficial(v)).toBe(e);
  });
});

describe('calcularResumenAsistencia', () => {
  it('lista vacía → nivel 100 % y contadores en cero', () => {
    const r = calcularResumenAsistencia([]);
    expect(r.total_registros).toBe(0);
    expect(r.nivel_asistencia_pct).toBe(100);
    expect(r.ausencias_totales).toBe(0);
  });

  it('cuenta todos los estados y calcula ausencias totales', () => {
    const r = calcularResumenAsistencia(
      regs('presente', 'PRESENTE', 'tardanza', 'justificado', 'ausente', 'permiso_especial', 'suspendido', 'expulsado', 'raro', null)
    );
    expect(r).toMatchObject({
      total_registros: 10,
      presentes: 2,
      tardias: 1,
      ausencias_justificadas: 1,
      ausencias_injustificadas: 1,
      permisos_especiales: 1,
      suspendidos: 1,
      expulsados: 1,
      ausencias_totales: 4,
      nivel_asistencia_pct: 20,
    });
  });

  it('nivel_asistencia_pct solo cuenta presentes (tardías NO suman, a diferencia del reporte EPI)', () => {
    const r = calcularResumenAsistencia(regs('presente', 'tardanza'));
    expect(r.nivel_asistencia_pct).toBe(50);
  });

  it('redondeo entero: 2/3 → 67', () => {
    expect(calcularResumenAsistencia(regs('presente', 'presente', 'ausente')).nivel_asistencia_pct).toBe(67);
  });
});

describe('contarEstadosAsistencia', () => {
  it('vacío', () => {
    expect(contarEstadosAsistencia([])).toEqual({
      total: 0,
      presentes: 0,
      tardias: 0,
      ausencias_justificadas: 0,
      ausencias_injustificadas: 0,
    });
  });
  it('estados desconocidos cuentan en total pero en ninguna categoría', () => {
    expect(contarEstadosAsistencia(regs('presente', 'tardanza', 'justificado', 'ausente', 'suspendido', undefined))).toEqual({
      total: 6,
      presentes: 1,
      tardias: 1,
      ausencias_justificadas: 1,
      ausencias_injustificadas: 1,
    });
  });
});

describe('calcularMetricasAnaliticas', () => {
  it('total 0 → puntualidad 100, tardías 0, nivel 100, distribución 0', () => {
    const m = calcularMetricasAnaliticas({});
    expect(m).toMatchObject({
      total_registros: 0,
      puntualidad_pct: 100,
      tardias_pct: 0,
      nivel_asistencia_pct: 100,
      distribucion_ausencias: { justificadas: 0, injustificadas: 0, justificadas_pct: 0, injustificadas_pct: 0 },
    });
  });

  it('fórmula de nivel general ((total - AI) / total)', () => {
    const m = calcularMetricasAnaliticas({ total: 10, presentes: 6, tardias: 1, ausencias_justificadas: 1, ausencias_injustificadas: 2 });
    expect(m).toMatchObject({
      puntualidad_pct: 60,
      tardias_pct: 10,
      nivel_asistencia_pct: 80,
      ausencias_totales: 3,
      distribucion_ausencias: { justificadas_pct: 33, injustificadas_pct: 67 },
    });
  });

  it('valores nulos/undefined se tratan como 0', () => {
    const m = calcularMetricasAnaliticas({ total: 4, presentes: null, tardias: undefined, ausencias_injustificadas: 4 });
    expect(m.puntualidad_pct).toBe(0);
    expect(m.nivel_asistencia_pct).toBe(0);
    expect(m.distribucion_ausencias.injustificadas_pct).toBe(100);
  });

  it('distribución 50/50 con redondeo', () => {
    const m = calcularMetricasAnaliticas({ total: 3, ausencias_justificadas: 1, ausencias_injustificadas: 2 });
    expect(m.distribucion_ausencias.justificadas_pct + m.distribucion_ausencias.injustificadas_pct).toBe(100);
  });

  it('entrada inconsistente (AI > total) produce porcentaje negativo — no se valida', () => {
    const m = calcularMetricasAnaliticas({ total: 2, ausencias_injustificadas: 5 });
    expect(m.nivel_asistencia_pct).toBe(-150);
  });

  it('se integra con contarEstadosAsistencia', () => {
    const m = calcularMetricasAnaliticas(contarEstadosAsistencia(regs('presente', 'ausente', 'ausente', 'tardanza')));
    expect(m.nivel_asistencia_pct).toBe(50);
    expect(m.puntualidad_pct).toBe(25);
  });
});
