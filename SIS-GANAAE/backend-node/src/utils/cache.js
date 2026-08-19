import NodeCache from 'node-cache';

/** Claves de catálogos semiestáticos en memoria. */
export const CACHE_KEYS = {
  SECCIONES: 'catalog:seccion',
  MATERIAS: 'catalog:materia',
  LECCIONES: 'catalog:leccion',
  CURSOS_LECTIVOS: 'catalog:curso_lectivo',
};

const DEFAULT_TTL_SECONDS = 600;

const store = new NodeCache({
  stdTTL: DEFAULT_TTL_SECONDS,
  checkperiod: 120,
});

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetchFn
 * @returns {Promise<T>}
 */
export async function getCached(key, fetchFn) {
  if (store.has(key)) {
    return store.get(key);
  }
  const value = await fetchFn();
  store.set(key, value);
  return value;
}

export function invalidate(key) {
  store.del(key);
}

export function invalidateAllCatalogs() {
  Object.values(CACHE_KEYS).forEach((key) => store.del(key));
}
