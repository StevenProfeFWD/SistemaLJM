/**
 * Módulos puros de src/lib y src/utils.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import { mapApiError } from '@/lib/errors';
import { formatHoraCorta, etiquetaLeccion, resumenHorariosLeccion } from '@/lib/formatLeccion';
import { badgeTipoJustificacion, formatFechaJustificacion } from '@/lib/justificacionFormato';
import { MATERIAS_CATALOGO_EVENT, emitMateriasCatalogoUpdated } from '@/lib/materiasCatalogEvents';
import { cn } from '@/lib/utils';
import {
  esFalloServicioHacienda, mensajeFalloHacienda, notificarHaciendaIndisponible, MENSAJE_HACIENDA_DEFAULT,
} from '@/utils/haciendaConsulta';
import {
  fechaHoyLocal, normalizarFechaIso, optionsConfirmacionExpulsion, esExpulsionDefinitiva,
  esRegistroVigente, esRegistroEditable, enriquecerRegistroHistorial, MENSAJE_EXPULSION_DEFINITIVA,
} from '@/utils/vigenciaEstadoOrientacion';

afterEach(() => vi.useRealTimers());

describe('mapApiError (lib/errors.js)', () => {
  test.each([
    [null, 'X', 'X'],
    [undefined, 'X', 'X'],
    [{ response: { data: 'texto plano ' } }, 'X', 'texto plano'],
    [{ response: { data: { message: 'Cupo lleno', error: 'legacy' } } }, 'X', 'Cupo lleno'],
    [{ response: { data: { error: 'Solo error' } } }, 'X', 'Solo error'],
    [{ message: 'Network Error' }, 'X', 'Network Error'],
    [{ response: { data: { message: '   ' } } }, 'X', 'X'],
    [{ error: 'desde servicio' }, 'X', 'desde servicio'],
  ])('mapApiError(%j, fallback %s) → %s', (err, fb, esperado) => {
    expect(mapApiError(err, fb)).toBe(esperado);
  });
  test('mensaje genérico de axios con response.data vacío → fallback', () => {
    expect(mapApiError({ message: 'Request failed with status code 500', response: { status: 500, data: '' } }, 'X')).toBe('X');
  });
  test('[CORREGIDO D-09] error axios sin response.data: el mensaje genérico en inglés debería filtrarse', () => {
    // response.data undefined ⇒ data = err ⇒ se devuelve err.message antes del filtro /Request failed/
    expect(mapApiError({ message: 'Request failed with status code 500', response: { status: 500 } }, 'X')).toBe('X');
  });
  test('fallback por defecto en español', () => {
    expect(mapApiError(null)).toBe('Error inesperado');
  });
});

describe('formatLeccion.js', () => {
  test.each([
    [null, '--:--'], ['', '--:--'], ['7:00:00', '07:00'], ['13:45', '13:45'], ['abcdefg', 'abcde'],
  ])('formatHoraCorta(%j) → %s', (e, s) => expect(formatHoraCorta(e)).toBe(s));

  test('etiquetaLeccion con y sin almuerzo', () => {
    expect(etiquetaLeccion({ id_leccion: 3, hora_inicio: '8:20:00', hora_fin: '9:00:00' })).toBe('Lección 3 (08:20 - 09:00)');
    expect(etiquetaLeccion({ id_leccion: 6, hora_inicio: '12:00', hora_fin: '12:40', es_recreo_almuerzo: true })).toBe('Lección 6 (12:00 - 12:40) — Almuerzo');
  });

  test('resumenHorariosLeccion', () => {
    expect(resumenHorariosLeccion([])).toBe('Sin horarios');
    expect(resumenHorariosLeccion(null)).toBe('Sin horarios');
    expect(resumenHorariosLeccion([
      { dia_semana: 1, id_leccion: 1, hora_inicio: '7:00', hora_fin: '7:40' },
      { dia_semana: 3, etiqueta: 'L2-L3' },
      { dia_semana: 9, id_leccion: 4, hora_inicio: '9:00', hora_fin: '9:40' },
    ])).toBe('Lun L1 (07:00-07:40), Mié L2-L3, D9 L4 (09:00-09:40)');
  });
});

describe('justificacionFormato.js', () => {
  test.each([
    ['medica', 'sky'], ['personal', 'amber'], ['institucional', 'violet'], ['otro', 'slate'], [undefined, 'slate'],
  ])('badgeTipoJustificacion(%s) usa paleta %s', (t, color) => expect(badgeTipoJustificacion(t)).toContain(`bg-${color}-100`));
  test('formatFechaJustificacion', () => {
    expect(formatFechaJustificacion('2026-03-05T00:00:00Z')).toBe('05/03/2026');
    expect(formatFechaJustificacion('')).toBe('—');
  });
});

describe('materiasCatalogEvents.js', () => {
  test('emite un CustomEvent en window', () => {
    const h = vi.fn();
    window.addEventListener(MATERIAS_CATALOGO_EVENT, h);
    emitMateriasCatalogoUpdated();
    window.removeEventListener(MATERIAS_CATALOGO_EVENT, h);
    expect(h).toHaveBeenCalledTimes(1);
    expect(MATERIAS_CATALOGO_EVENT).toBe('sis-ganaae:materias-catalogo-updated');
  });
});

describe('cn (lib/utils.js)', () => {
  test('combina y resuelve conflictos Tailwind', () => {
    expect(cn('px-2', false && 'x', 'px-4', { 'font-bold': true })).toBe('px-4 font-bold');
  });
});

describe('haciendaConsulta.js', () => {
  test.each([
    [null, false],
    [{ encontrado: true, codigo: 'HACIENDA_RATE_LIMIT' }, false],
    [{ existeInterno: true }, false],
    [{ fuente: 'hacienda' }, false],
    [{ codigo: 'HACIENDA_RATE_LIMIT' }, true],
    [{ codigo: 'HACIENDA_NO_DISPONIBLE' }, true],
    [{ mensaje: 'Tiempo de espera agotado' }, true],
    [{ error: 'Se alcanzó el límite de consultas' }, true],
    [{ message: 'servicio saturado' }, true],
    [{ mensaje: 'Hacienda no disponible' }, true],
    [{ mensaje: 'No fue posible consultar' }, true],
    [{ mensaje: 'Cédula no encontrada' }, false],
    [{ mensaje: 'Hacienda: cédula inexistente' }, false],
  ])('esFalloServicioHacienda(%j) → %s', (d, e) => expect(esFalloServicioHacienda(d)).toBe(e));

  test('mensajeFalloHacienda prioriza mensaje > error > message > fallback', () => {
    expect(mensajeFalloHacienda({ mensaje: 'a', error: 'b' })).toBe('a');
    expect(mensajeFalloHacienda({ error: 'b', message: 'c' })).toBe('b');
    expect(mensajeFalloHacienda({})).toBe(MENSAJE_HACIENDA_DEFAULT);
  });

  test('notificarHaciendaIndisponible: 504 → toast warning con texto de timeout', () => {
    const toast = vi.fn();
    expect(notificarHaciendaIndisponible(toast, null, { status: 504 })).toBe(true);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Tiempo de espera agotado/), 'warning');
  });
  test('notificarHaciendaIndisponible: status vía err.response.status', () => {
    const toast = vi.fn();
    expect(notificarHaciendaIndisponible(toast, null, { response: { status: 504 } })).toBe(true);
  });
  test('notificarHaciendaIndisponible: data normal → no notifica', () => {
    const toast = vi.fn();
    expect(notificarHaciendaIndisponible(toast, { encontrado: true }, null)).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
  test('notificarHaciendaIndisponible: rate limit en data', () => {
    const toast = vi.fn();
    expect(notificarHaciendaIndisponible(toast, { codigo: 'HACIENDA_RATE_LIMIT', mensaje: 'Límite' }, null)).toBe(true);
    expect(toast).toHaveBeenCalledWith('Límite', 'warning');
  });
});

describe('vigenciaEstadoOrientacion.js', () => {
  const fijar = (iso) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

  test('fechaHoyLocal usa la fecha local (no UTC) — 23:30 local', () => {
    fijar('2026-11-14T23:30:00');
    expect(fechaHoyLocal()).toBe('2026-11-14');
  });
  test('normalizarFechaIso', () => {
    expect(normalizarFechaIso('2026-01-02T05:00:00Z')).toBe('2026-01-02');
    expect(normalizarFechaIso(null)).toBeNull();
  });
  test('optionsConfirmacionExpulsion con y sin nombre', () => {
    expect(optionsConfirmacionExpulsion('  Ana ').message).toMatch(/expulsar definitivamente a Ana\?/);
    expect(optionsConfirmacionExpulsion('').message).toMatch(/a este estudiante\?/);
    expect(optionsConfirmacionExpulsion('x').variant).toBe('destructive');
  });
  test('esExpulsionDefinitiva', () => {
    expect(esExpulsionDefinitiva({ tipo_estado: 'expulsion' })).toBe(true);
    expect(esExpulsionDefinitiva(null)).toBe(false);
  });
  test('esRegistroVigente / esRegistroEditable según fecha_fin', () => {
    fijar('2026-11-14T10:00:00');
    expect(esRegistroVigente({ fecha_fin: '2026-11-15' })).toBe(true);
    expect(esRegistroVigente({ fecha_fin: '2026-11-14' })).toBe(false); // vence el mismo día
    expect(esRegistroVigente({ fecha_fin: null })).toBe(false);
    expect(esRegistroVigente({ tipo_estado: 'expulsion' })).toBe(true);
    expect(esRegistroEditable({ tipo_estado: 'expulsion', fecha_fin: '2099-01-01' })).toBe(false);
    expect(esRegistroEditable({ fecha_fin: '2026-12-01' })).toBe(true);
    expect(esRegistroVigente(null)).toBe(false);
  });
  test('enriquecerRegistroHistorial respeta valores del backend y calcula los faltantes', () => {
    fijar('2026-11-14T10:00:00');
    expect(enriquecerRegistroHistorial({ fecha_fin: '2026-12-01' })).toMatchObject({ esExpulsion: false, isVigente: true, isEditable: true });
    expect(enriquecerRegistroHistorial({ fecha_fin: '2026-12-01', es_vigente: false, es_editable: false }))
      .toMatchObject({ isVigente: false, isEditable: false });
    expect(MENSAJE_EXPULSION_DEFINITIVA).toBe('Sanción definitiva - No editable');
  });
});
