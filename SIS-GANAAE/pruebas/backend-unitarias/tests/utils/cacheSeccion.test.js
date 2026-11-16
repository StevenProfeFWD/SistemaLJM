/** Ciclo 9: cache.js, catalogCacheService y seccionHelper (BD/transacción simuladas). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setResolver, reset, llamadas } from '../helpers/dbMock.js';
import { CACHE_KEYS, getCached, invalidate, invalidateAllCatalogs } from '../../../../backend-node/src/utils/cache.js';
import * as CC from '../../../../backend-node/src/services/catalogCacheService.js';
import {
  MAX_ESTUDIANTES_POR_SECCION,
  contarMatriculasActivasPorSeccion,
  obtenerOAsignarSeccion,
} from '../../../../backend-node/src/utils/seccionHelper.js';

beforeEach(() => {
  reset();
  invalidateAllCatalogs();
});

describe('cache.getCached', () => {
  it('solo llama a fetchFn la primera vez; invalidate fuerza nueva carga', async () => {
    const fetch = vi.fn(async () => ({ v: 1 }));
    expect(await getCached('k-test', fetch)).toEqual({ v: 1 });
    expect(await getCached('k-test', fetch)).toEqual({ v: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    invalidate('k-test');
    await getCached('k-test', fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('OBSERVACIÓN O-06: dos llamadas concurrentes sin caché ejecutan fetchFn dos veces (sin deduplicación)', async () => {
    invalidate('k-conc');
    const fetch = vi.fn(() => new Promise((r) => setTimeout(() => r(1), 5)));
    await Promise.all([getCached('k-conc', fetch), getCached('k-conc', fetch)]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('un error en fetchFn no se cachea', async () => {
    invalidate('k-err');
    await expect(getCached('k-err', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await getCached('k-err', async () => 2)).toBe(2);
  });

  it('valor undefined no se almacena (se vuelve a pedir)', async () => {
    invalidate('k-undef');
    const fetch = vi.fn(async () => undefined);
    await getCached('k-undef', fetch);
    await getCached('k-undef', fetch);
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('catalogCacheService', () => {
  it('secciones/materias/cursos se consultan una vez y luego salen de caché', async () => {
    setResolver((r) => {
      if (r.tabla === 'seccion') return [{ id_seccion: 1, nombre_seccion: '7-1' }];
      if (r.tabla === 'materia') return [{ id_materia: 1 }];
      if (r.tabla === 'curso_lectivo') return [{ anio_curso_lectivo: 2026 }];
      return [];
    });
    await CC.getSeccionesCatalog();
    await CC.getSeccionesCatalog();
    await CC.getMateriasCatalog();
    await CC.getCursosLectivosCatalog();
    expect(llamadas.map((l) => l.tabla)).toEqual(['seccion', 'materia', 'curso_lectivo']);
    const mapa = await CC.getSeccionMapByNombre();
    expect(mapa.get('7-1')).toEqual({ id_seccion: 1, nombre_seccion: '7-1' });
    CC.invalidateSeccionesCache();
    CC.invalidateMateriasCache();
    CC.invalidateCursosLectivosCache();
    await CC.getSeccionesCatalog();
    expect(llamadas.filter((l) => l.tabla === 'seccion')).toHaveLength(2);
  });

  it('lecciones incluyen etiqueta legible', async () => {
    setResolver(() => [{ id_leccion: 1, hora_inicio: '7:00:00', hora_fin: '7:40:00', es_recreo_almuerzo: false }]);
    CC.invalidateLeccionesCache();
    const l = await CC.getLeccionesCatalog();
    expect(l[0].etiqueta).toBe('Lección 1 (07:00 - 07:40)');
  });

  it('CACHE_KEYS', () => {
    expect(Object.keys(CACHE_KEYS)).toEqual(['SECCIONES', 'MATERIAS', 'LECCIONES', 'CURSOS_LECTIVOS']);
  });
});

describe('seccionHelper', () => {
  /** trx simulada: secciones del grado, conteo por sección e insert. */
  function trxSimulada({ secciones = [], conteos = {}, nuevaId = 99 } = {}) {
    const ops = [];
    const trx = (tabla) => {
      const st = { tabla, where: null };
      const b = {
        where: (...a) => ((st.where = a), ops.push(['where', tabla, ...a]), b),
        orderBy: () => b,
        count: () => b,
        first: async () => ({ total: conteos[st.where?.[0]?.id_seccion] }),
        insert: (v) => (ops.push(['insert', tabla, v]), b),
        returning: async () => [{ id_seccion: nuevaId }],
        then: (ok, ko) => Promise.resolve(secciones).then(ok, ko),
      };
      return b;
    };
    return { trx, ops };
  }

  it('MAX = 25', () => expect(MAX_ESTUDIANTES_POR_SECCION).toBe(25));

  it('contarMatriculasActivasPorSeccion: total string/undefined', async () => {
    expect(await contarMatriculasActivasPorSeccion(trxSimulada({ conteos: { 3: '12' } }).trx, 1, 3)).toBe(12);
    expect(await contarMatriculasActivasPorSeccion(trxSimulada().trx, 1, 3)).toBe(0);
  });

  it('año desconocido → null sin consultar', async () => {
    const { trx, ops } = trxSimulada();
    expect(await obtenerOAsignarSeccion(trx, 1, 'duodecimo')).toBeNull();
    expect(ops).toHaveLength(0);
  });

  it('usa la primera sección con cupo (< 25)', async () => {
    const { trx } = trxSimulada({ secciones: [{ id_seccion: 1 }, { id_seccion: 2 }], conteos: { 1: '25', 2: '24' } });
    expect(await obtenerOAsignarSeccion(trx, 1, 'septimo')).toBe(2);
  });

  it('todas llenas → crea "<grado>-<n+1>" e invalida caché de secciones', async () => {
    setResolver(() => [{ nombre_seccion: 'viejo' }]);
    await CC.getSeccionesCatalog();
    const { trx, ops } = trxSimulada({ secciones: [{ id_seccion: 1 }, { id_seccion: 2 }], conteos: { 1: '25', 2: '30' }, nuevaId: 77 });
    expect(await obtenerOAsignarSeccion(trx, 1, 'decimo')).toBe(77);
    expect(ops.find((o) => o[0] === 'insert')[2]).toEqual({ numero_seccion: 3, nombre_seccion: '10-3' });
    expect(ops.find((o) => o[0] === 'where' && o[1] === 'seccion')).toEqual(['where', 'seccion', 'nombre_seccion', 'like', '10-%']);
    await CC.getSeccionesCatalog();
    expect(llamadas.filter((l) => l.tabla === 'seccion')).toHaveLength(2); // caché invalidada
  });

  it('CORREGIDO D-16: con huecos (7-1 y 7-3 existentes) la nueva sección es la siguiente al mayor número (7-4)', async () => {
    const { trx, ops } = trxSimulada({ secciones: [{ id_seccion: 1, nombre_seccion: '7-1' }, { id_seccion: 5, nombre_seccion: '7-3' }], conteos: { 1: '25', 5: '25' } });
    await obtenerOAsignarSeccion(trx, 1, 'septimo');
    expect(ops.find((o) => o[0] === 'insert')[2]).toEqual({ numero_seccion: 4, nombre_seccion: '7-4' });
  });

  it('CORREGIDO D-16 (expectativa correcta): con 7-1 y 7-3 existentes no debería volver a crearse "7-3"', async () => {
    const { trx, ops } = trxSimulada({ secciones: [{ id_seccion: 1, nombre_seccion: '7-1' }, { id_seccion: 5, nombre_seccion: '7-3' }], conteos: { 1: '25', 5: '25' } });
    await obtenerOAsignarSeccion(trx, 1, 'septimo');
    expect(ops.find((o) => o[0] === 'insert')[2].nombre_seccion).not.toBe('7-3');
  });
});
