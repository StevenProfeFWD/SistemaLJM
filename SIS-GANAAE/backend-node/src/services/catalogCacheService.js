import db from '../db/knex.js';
import { CACHE_KEYS, getCached, invalidate } from '../utils/cache.js';
import { etiquetaLeccion } from '../utils/leccionHelper.js';

export function invalidateSeccionesCache() {
  invalidate(CACHE_KEYS.SECCIONES);
}

export function invalidateMateriasCache() {
  invalidate(CACHE_KEYS.MATERIAS);
}

export function invalidateLeccionesCache() {
  invalidate(CACHE_KEYS.LECCIONES);
}

export function invalidateCursosLectivosCache() {
  invalidate(CACHE_KEYS.CURSOS_LECTIVOS);
}

export async function getSeccionesCatalog() {
  return getCached(CACHE_KEYS.SECCIONES, () =>
    db('seccion').select('*').orderBy('nombre_seccion', 'asc')
  );
}

export async function getMateriasCatalog() {
  return getCached(CACHE_KEYS.MATERIAS, () =>
    db('materia').select('*').orderBy('nombre_materia', 'asc')
  );
}

export async function getLeccionesCatalog() {
  return getCached(CACHE_KEYS.LECCIONES, async () => {
    const rows = await db('leccion').select('*').orderBy('id_leccion', 'asc');
    return rows.map((row) => ({
      ...row,
      etiqueta: etiquetaLeccion(row),
    }));
  });
}

export async function getCursosLectivosCatalog() {
  return getCached(CACHE_KEYS.CURSOS_LECTIVOS, () =>
    db('curso_lectivo')
      .select('id_curso_lectivo', 'anio_curso_lectivo')
      .orderBy('anio_curso_lectivo', 'desc')
  );
}

export async function getSeccionMapByNombre() {
  const secciones = await getSeccionesCatalog();
  return new Map(secciones.map((s) => [s.nombre_seccion, s]));
}
