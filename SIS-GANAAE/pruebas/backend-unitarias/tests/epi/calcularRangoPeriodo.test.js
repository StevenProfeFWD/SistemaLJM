import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calcularRangoPeriodo,
  PERIODOS_EPI,
} from '../../../../backend-node/src/services/epiReportesService.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';

const atrapar = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

describe('calcularRangoPeriodo — semanal (lunes a domingo)', () => {
  it.each([
    ['2026-11-11', '2026-11-09', '2026-11-15'], // miércoles
    ['2026-11-09', '2026-11-09', '2026-11-15'], // lunes (borde inicio)
    ['2026-11-15', '2026-11-09', '2026-11-15'], // domingo (borde fin)
    ['2026-11-14', '2026-11-09', '2026-11-15'], // sábado
    ['2026-12-01', '2026-11-30', '2026-12-06'], // semana cruza de mes (hacia atrás)
    ['2026-04-30', '2026-04-27', '2026-05-03'], // semana cruza de mes (hacia adelante)
    ['2026-01-01', '2025-12-29', '2026-01-04'], // cruza de año (jueves 1 ene)
    ['2025-12-31', '2025-12-29', '2026-01-04'], // cruza de año (miércoles 31 dic)
    ['2027-01-03', '2026-12-28', '2027-01-03'], // domingo 3 ene: semana empieza en año anterior
    ['2024-02-29', '2024-02-26', '2024-03-03'], // año bisiesto
    ['2023-02-28', '2023-02-27', '2023-03-05'], // no bisiesto
    ['2000-02-29', '2000-02-28', '2000-03-05'], // bisiesto secular
  ])('ref %s → %s .. %s', (ref, ini, fin) => {
    expect(calcularRangoPeriodo({ periodo: 'semanal', fecha_referencia: ref })).toEqual({
      periodo: 'semanal',
      fecha_inicio: ini,
      fecha_fin: fin,
    });
  });

  it('el rango semanal siempre dura 7 días y empieza en lunes (barrido de 3 años)', () => {
    const inicio = Date.UTC(2024, 0, 1);
    for (let i = 0; i < 365 * 3; i += 1) {
      const d = new Date(inicio + i * 86400000);
      const ref = d.toISOString().slice(0, 10);
      const r = calcularRangoPeriodo({ periodo: 'semanal', fecha_referencia: ref });
      const lunes = new Date(`${r.fecha_inicio}T00:00:00Z`);
      const domingo = new Date(`${r.fecha_fin}T00:00:00Z`);
      expect(lunes.getUTCDay()).toBe(1);
      expect(domingo.getUTCDay()).toBe(0);
      expect((domingo - lunes) / 86400000).toBe(6);
      expect(r.fecha_inicio <= ref && ref <= r.fecha_fin).toBe(true);
    }
  });
});

describe('calcularRangoPeriodo — mensual', () => {
  it.each([
    ['2026-11-14', '2026-11-01', '2026-11-30'],
    ['2026-01-31', '2026-01-01', '2026-01-31'],
    ['2024-02-10', '2024-02-01', '2024-02-29'], // bisiesto
    ['2023-02-10', '2023-02-01', '2023-02-28'],
    ['1900-02-10', '1900-02-01', '1900-02-28'], // 1900 no es bisiesto
    ['2000-02-10', '2000-02-01', '2000-02-29'],
    ['2026-12-31', '2026-12-01', '2026-12-31'], // diciembre (m+1 = 12 → desborde a enero)
    ['2026-04-15', '2026-04-01', '2026-04-30'],
  ])('ref %s → %s .. %s', (ref, ini, fin) => {
    expect(calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: ref })).toEqual({
      periodo: 'mensual',
      fecha_inicio: ini,
      fecha_fin: fin,
    });
  });

  it.each([undefined, null, ''])(
    'periodo ausente (%s) usa mensual por defecto',
    (periodo) => {
      expect(calcularRangoPeriodo({ periodo, fecha_referencia: '2026-03-10' })).toEqual({
        periodo: 'mensual',
        fecha_inicio: '2026-03-01',
        fecha_fin: '2026-03-31',
      });
    }
  );

  it('CORREGIDO (DEF-09 API): periodo en mayúsculas/espacios se normaliza (" SEMANAL " → semanal)', () => {
    expect(calcularRangoPeriodo({ periodo: ' SEMANAL ', fecha_referencia: '2026-03-10' })).toEqual({
      periodo: 'semanal',
      fecha_inicio: '2026-03-09',
      fecha_fin: '2026-03-15',
    });
  });

  it.each(['diario', 123, "mensual' OR 1=1 --"])(
    'CORREGIDO (DEF-09 API): periodo desconocido (%s) → AppError 400 (antes caía en mensual en silencio)',
    (periodo) => {
      const e = atrapar(() => calcularRangoPeriodo({ periodo, fecha_referencia: '2026-03-10' }));
      expect(e).toBeInstanceOf(AppError);
      expect(e.statusCode).toBe(400);
    }
  );
});

describe('calcularRangoPeriodo — anual', () => {
  it('año calendario completo', () => {
    expect(calcularRangoPeriodo({ periodo: 'anual', fecha_referencia: '2024-07-04' })).toEqual({
      periodo: 'anual',
      fecha_inicio: '2024-01-01',
      fecha_fin: '2024-12-31',
    });
  });
  it('31 de diciembre pertenece a su propio año', () => {
    expect(calcularRangoPeriodo({ periodo: 'anual', fecha_referencia: '2025-12-31' }).fecha_inicio).toBe(
      '2025-01-01'
    );
  });
});

describe('calcularRangoPeriodo — fecha de referencia ausente usa "hoy" (hora de Costa Rica)', () => {
  afterEach(() => vi.useRealTimers());

  it.each(['14/11/2026', '2026-1-5', 'abc', "2026-11-14'; DROP TABLE asistencia;--", 20261114])(
    'CORREGIDO (DEF-09 API): ref mal formada %s → AppError 400 (antes usaba hoy en silencio)',
    (ref) => {
      const e = atrapar(() => calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: ref }));
      expect(e).toBeInstanceOf(AppError);
      expect(e.statusCode).toBe(400);
    }
  );

  it.each([undefined, ''])(
    'ref=%s → usa la fecha del sistema',
    (ref) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0)); // 14-nov-2026 local (sábado)
      expect(calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: ref })).toEqual({
        periodo: 'mensual',
        fecha_inicio: '2026-11-01',
        fecha_fin: '2026-11-30',
      });
      expect(calcularRangoPeriodo({ periodo: 'semanal', fecha_referencia: ref })).toEqual({
        periodo: 'semanal',
        fecha_inicio: '2026-11-09',
        fecha_fin: '2026-11-15',
      });
    }
  );

  it('justo antes de medianoche local sigue tomando el día local (no UTC)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
    expect(calcularRangoPeriodo({ periodo: 'anual' }).fecha_inicio).toBe('2026-01-01');
  });

  it('sin argumentos usa los valores por defecto (mensual del mes actual) en lugar de lanzar TypeError', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0));
    expect(calcularRangoPeriodo()).toEqual({ periodo: 'mensual', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
  });
});

describe('calcularRangoPeriodo — fechas con formato correcto pero inexistentes', () => {
  // CORREGIDO D-01: ahora se valida que la fecha exista en el calendario (antes Date.UTC normalizaba el desborde).
  it.each([
    ['semanal', '2026-02-30'],
    ['mensual', '2026-13-01'],
    ['anual', '2026-00-15'],
    ['mensual', '2025-02-29'], // 2025 no es bisiesto
    ['anual', '2026-04-31'],
  ])('CORREGIDO D-01: %s con fecha_referencia inexistente %s → AppError 400', (periodo, ref) => {
    const e = atrapar(() => calcularRangoPeriodo({ periodo, fecha_referencia: ref }));
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it('29 de febrero de un año bisiesto sigue siendo válido', () => {
    expect(calcularRangoPeriodo({ periodo: 'mensual', fecha_referencia: '2024-02-29' })).toEqual({
      periodo: 'mensual',
      fecha_inicio: '2024-02-01',
      fecha_fin: '2024-02-29',
    });
  });
});

describe('calcularRangoPeriodo — personalizado', () => {
  it('devuelve las fechas tal cual', () => {
    expect(
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31' })
    ).toEqual({ periodo: 'personalizado', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31' });
  });

  it('inicio == fin (un solo día) es válido', () => {
    const r = calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2026-05-05', fecha_fin: '2026-05-05' });
    expect(r.fecha_inicio).toBe(r.fecha_fin);
  });

  it('ignora fecha_referencia', () => {
    const r = calcularRangoPeriodo({
      periodo: 'personalizado',
      fecha_referencia: '1999-01-01',
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-01-02',
    });
    expect(r.fecha_inicio).toBe('2026-01-01');
  });

  it.each([
    [undefined, '2026-01-31'],
    ['2026-01-01', undefined],
    ['', ''],
    [null, null],
    ['2026/01/01', '2026-01-31'],
    ['2026-01-01', '31-01-2026'],
    ["2026-01-01' OR '1'='1", '2026-01-31'],
    ['2026-01-01T00:00:00', '2026-01-31'],
    [' 2026-01-01', '2026-01-31'],
    ['2026-1-1', '2026-01-31'],
  ])('rechaza con AppError 400 inicio=%s fin=%s', (ini, fin) => {
    const e = atrapar(() => calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: ini, fecha_fin: fin }));
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
    expect(e.message).toMatch(/AAAA-MM-DD/);
  });

  it('rechaza inicio posterior a fin con mensaje específico', () => {
    const e = atrapar(() =>
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2026-02-01', fecha_fin: '2026-01-31' })
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
    expect(e.message).toMatch(/posterior/);
  });

  it('CORREGIDO D-02: fechas inexistentes (2026-02-31, 2026-13-45) se rechazan con 400 y no llegan a la BD', () => {
    const e = atrapar(() =>
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2026-02-31', fecha_fin: '2026-13-45' })
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it('CORREGIDO D-02 (expectativa correcta): 2026-02-31 debería rechazarse con AppError 400', () => {
    const e = atrapar(() =>
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2026-02-31', fecha_fin: '2026-03-10' })
    );
    expect(e).toBeInstanceOf(AppError);
  });

  it('CORREGIDO (DEF-07 API): el rango personalizado se limita a 366 días (0001-01-01 a 9999-12-31 → 400)', () => {
    const e = atrapar(() =>
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '0001-01-01', fecha_fin: '9999-12-31' })
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
    expect(e.message).toMatch(/366/);
  });

  it('un año completo bisiesto (366 días) sigue permitido; 367 días no', () => {
    expect(
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' }).fecha_fin
    ).toBe('2024-12-31');
    const e = atrapar(() =>
      calcularRangoPeriodo({ periodo: 'personalizado', fecha_inicio: '2024-01-01', fecha_fin: '2025-01-01' })
    );
    expect(e).toBeInstanceOf(AppError);
  });
});

describe('PERIODOS_EPI', () => {
  it('expone los 4 periodos soportados', () => {
    expect(PERIODOS_EPI).toEqual(['semanal', 'mensual', 'anual', 'personalizado']);
  });
});

describe('zona horaria del servidor (fecha de referencia por defecto)', () => {
  const TZ0 = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    if (TZ0 === undefined) delete process.env.TZ;
    else process.env.TZ = TZ0;
  });

  it('CORREGIDO O-16: aunque el servidor corra en UTC, el domingo 15-nov-2026 a las 19:00 de Costa Rica sigue en la semana del 9 al 15', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T01:00:00Z')); // = domingo 15-nov 19:00 en Costa Rica
    process.env.TZ = 'America/Costa_Rica';
    expect(calcularRangoPeriodo({ periodo: 'semanal' }).fecha_inicio).toBe('2026-11-09');
    process.env.TZ = 'UTC';
    expect(calcularRangoPeriodo({ periodo: 'semanal' }).fecha_inicio).toBe('2026-11-09');
  });

  it('con fecha_referencia explícita el resultado no depende de la zona horaria', () => {
    for (const tz of ['UTC', 'America/Costa_Rica', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz;
      expect(calcularRangoPeriodo({ periodo: 'semanal', fecha_referencia: '2026-11-15' })).toEqual({
        periodo: 'semanal',
        fecha_inicio: '2026-11-09',
        fecha_fin: '2026-11-15',
      });
    }
  });
});
