import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import {
  fechaToIsoDiaSemana,
  DIA_SEMANA_LABEL,
  formatHoraCorta,
  etiquetaLeccion,
  resumenHorariosLeccion,
} from '../../../../backend-node/src/utils/leccionHelper.js';
import {
  fechaHoyIso,
  fechaDiaAnterior,
  fechaAIsoDia,
  profesorPuedeAccederAsignacion,
  aplicarFiltroAsignacionesProfesor,
} from '../../../../backend-node/src/utils/sustitucionHelper.js';
import { setResolver, reset, llamadas } from '../helpers/dbMock.js';

const TZ_ORIGINAL = process.env.TZ;
afterEach(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
  vi.useRealTimers();
});
beforeEach(() => reset());

describe('leccionHelper.fechaToIsoDiaSemana', () => {
  it.each([
    ['2026-11-09', 1],
    ['2026-11-14', 6],
    ['2026-11-15', 7],
    ['2024-02-29', 4],
    ['2000-01-01', 6],
    [' 2026-11-11 ', 3],
  ])('%s → %i', (f, d) => expect(fechaToIsoDiaSemana(f)).toBe(d));

  it.each([null, undefined, '', '2026/11/09', '09-11-2026', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32', 'x'])(
    'inválida %j → null',
    (f) => expect(fechaToIsoDiaSemana(f)).toBeNull()
  );

  it('DEFECTO D-08: 2026-02-31 (inexistente) no se rechaza; se desborda a 3-mar (martes = 2)', () => {
    expect(fechaToIsoDiaSemana('2026-02-31')).toBe(2);
  });

  it('DEFECTO D-08b: años < 100 se mapean a 19xx por new Date(y, m, d) (0050-01-01 → día de 1950)', () => {
    // 1 ene 0050 fue sábado (6) en calendario gregoriano proléptico; 1 ene 1950 fue domingo (7)
    expect(fechaToIsoDiaSemana('0050-01-01')).toBe(7);
  });

  it('DIA_SEMANA_LABEL cubre 1..7', () => {
    expect(Object.keys(DIA_SEMANA_LABEL)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(DIA_SEMANA_LABEL[fechaToIsoDiaSemana('2026-11-11')]).toBe('Miércoles');
  });
});

describe('leccionHelper.formatHoraCorta / etiquetaLeccion / resumenHorariosLeccion', () => {
  it.each([
    [null, '--:--'],
    [undefined, '--:--'],
    ['', '--:--'],
    ['07:00:00', '07:00'],
    ['7:05', '07:05'],
    ['13:45:59.123', '13:45'],
    ['abcdefg', 'abcde'],
    [0, '0'],
  ])('%j → %j', (v, e) => expect(formatHoraCorta(v)).toBe(e));

  it('etiqueta con y sin almuerzo', () => {
    expect(etiquetaLeccion({ id_leccion: 3, hora_inicio: '8:20:00', hora_fin: '9:00:00' })).toBe('Lección 3 (08:20 - 09:00)');
    expect(etiquetaLeccion({ id_leccion: 6, hora_inicio: null, hora_fin: '12:40', es_recreo_almuerzo: true })).toBe(
      'Lección 6 (--:-- - 12:40) — Almuerzo'
    );
  });

  it('resumen de horarios', () => {
    expect(resumenHorariosLeccion([])).toBe('Sin horarios');
    expect(resumenHorariosLeccion(null)).toBe('Sin horarios');
    expect(resumenHorariosLeccion('x')).toBe('Sin horarios');
    expect(
      resumenHorariosLeccion([
        { dia_semana: 1, id_leccion: 1, hora_inicio: '7:00', hora_fin: '7:40' },
        { dia_semana: 7, id_leccion: 2, hora_inicio: '7:40', hora_fin: '8:20' },
        { dia_semana: 9, id_leccion: 3, hora_inicio: null, hora_fin: null },
        { dia_semana: 0, id_leccion: 4, hora_inicio: '1:00', hora_fin: '2:00' },
      ])
    ).toBe('Lun L1 (07:00-07:40), Dom L2 (07:40-08:20), D9 L3 (--:-----:--), D0 L4 (01:00-02:00)');
  });
});

describe('sustitucionHelper — fechas', () => {
  it('fechaHoyIso usa la fecha local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 30));
    expect(fechaHoyIso()).toBe('2026-01-05');
  });

  it.each([
    ['2026-03-01', '2026-02-28'],
    ['2024-03-01', '2024-02-29'],
    ['2026-01-01', '2025-12-31'],
    ['2026-11-14', '2026-11-13'],
    ['2026-11-14T08:00:00Z', '2026-11-13'],
  ])('fechaDiaAnterior(%s) = %s', (a, b) => expect(fechaDiaAnterior(a)).toBe(b));

  it.each([null, '', 'basura'])('fechaDiaAnterior(%j) = ""', (v) => expect(fechaDiaAnterior(v)).toBe(''));

  it('CORREGIDO D-10: fechaDiaAnterior ya no depende de la zona horaria (UTC+14 y UTC-11)', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz;
      expect(fechaDiaAnterior('2026-03-10')).toBe('2026-03-09');
      expect(fechaDiaAnterior('2026-03-01')).toBe('2026-02-28');
      expect(fechaDiaAnterior('2024-03-01')).toBe('2024-02-29');
      expect(fechaDiaAnterior('2026-01-01')).toBe('2025-12-31');
    }
  });

  it('fechaDiaAnterior es correcta en la zona del liceo (America/Costa_Rica) y en UTC', () => {
    for (const tz of ['America/Costa_Rica', 'UTC', 'Europe/Madrid']) {
      process.env.TZ = tz;
      expect(fechaDiaAnterior('2026-03-10')).toBe('2026-03-09');
    }
  });

  it.each([
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['2026-07-30', '2026-07-30'],
    ['2026-07-30T05:00:00.000Z', '2026-07-30'],
    ['no es fecha', ''],
  ])('fechaAIsoDia(%j) = %j', (v, e) => expect(fechaAIsoDia(v)).toBe(e));

  it('fechaAIsoDia con Date usa componentes locales (no String(date).slice)', () => {
    expect(fechaAIsoDia(new Date(2026, 5, 30))).toBe('2026-06-30');
    expect(fechaAIsoDia(new Date(NaN))).toBe('');
    expect(fechaAIsoDia(Date.UTC(2026, 0, 2, 12))).toBe('2026-01-02'); // número (timestamp)
  });
});

describe('sustitucionHelper.profesorPuedeAccederAsignacion (BD simulada)', () => {
  it('ids no numéricos → false sin consultar', async () => {
    expect(await profesorPuedeAccederAsignacion('x', 1)).toBe(false);
    expect(await profesorPuedeAccederAsignacion(1, 'y')).toBe(false);
    expect(llamadas).toHaveLength(0);
  });

  it('asignación inexistente → false', async () => {
    setResolver(() => undefined);
    expect(await profesorPuedeAccederAsignacion(1, 2)).toBe(false);
  });

  it('titular → true sin consultar sustituciones', async () => {
    setResolver((r) => (r.tabla === 'profesor_materia_seccion' ? { id_persona_profesor: 7 } : undefined));
    expect(await profesorPuedeAccederAsignacion('7', '2')).toBe(true);
    expect(llamadas.map((l) => l.tabla)).toEqual(['profesor_materia_seccion']);
  });

  it('sustituto vigente → true; usa fechaRef en los filtros', async () => {
    setResolver((r) => (r.tabla === 'profesor_materia_seccion' ? { id_persona_profesor: 1 } : { id_sustitucion: 9 }));
    expect(await profesorPuedeAccederAsignacion(5, 2, '2026-04-01')).toBe(true);
    const s = llamadas.find((l) => l.tabla === 'sustitucion');
    expect(s.ops.filter((o) => o.op === 'where').map((o) => o.args)).toEqual([
      [{ id_profesor_materia_seccion: 2, id_persona_sustituto: 5 }],
      ['fecha_desde', '<=', '2026-04-01'],
      ['fecha_hasta', '>=', '2026-04-01'],
    ]);
  });

  it('no titular y sin sustitución → false (usa fecha de hoy)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 10));
    setResolver((r) => (r.tabla === 'profesor_materia_seccion' ? { id_persona_profesor: 1 } : undefined));
    expect(await profesorPuedeAccederAsignacion(5, 2)).toBe(false);
    const s = llamadas.find((l) => l.tabla === 'sustitucion');
    expect(s.ops[1].args).toEqual(['fecha_desde', '<=', '2026-11-14']);
  });

  it('aplicarFiltroAsignacionesProfesor construye subconsulta titular OR sustituto vigente', () => {
    const registro = [];
    const sub = new Proxy(
      {},
      {
        get(_t, p) {
          return (...args) => {
            registro.push([p, ...args.map((a) => (typeof a === 'function' ? 'fn' : a))]);
            if (typeof args[0] === 'function') args[0].call(sub);
            return sub;
          };
        },
      }
    );
    const query = { andWhere: (fn) => (fn.call(sub), 'Q') };
    expect(aplicarFiltroAsignacionesProfesor(query, 4, '2026-05-05')).toBe('Q');
    expect(registro).toContainEqual(['where', 'pms.id_persona_profesor', 4]);
    expect(registro).toContainEqual(['from', 'sustitucion as s']);
    expect(registro).toContainEqual(['where', 's.fecha_desde', '<=', '2026-05-05']);
    expect(registro).toContainEqual(['where', 's.fecha_hasta', '>=', '2026-05-05']);
  });
});

describe('expectativas correctas (antes it.fails; defectos corregidos)', () => {
  it('CORREGIDO D-10 (expectativa correcta): fechaDiaAnterior("2026-03-10") = "2026-03-09" en cualquier zona horaria', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    expect(fechaDiaAnterior('2026-03-10')).toBe('2026-03-09');
  });
});
