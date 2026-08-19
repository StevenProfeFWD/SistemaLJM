import { invalidateSeccionesCache } from '../services/catalogCacheService.js';

export const MAX_ESTUDIANTES_POR_SECCION = 25;
/**
 * Cuenta matrículas activas en una sección (aforo real del aula).
 */
export async function contarMatriculasActivasPorSeccion(trx, idCursoLectivo, idSeccion) {
  const count = await trx('matricula')
    .where({
      id_curso_lectivo: idCursoLectivo,
      id_seccion: idSeccion,
      estado: 'activa',
    })
    .count('* as total')
    .first();
  return parseInt(count?.total || 0, 10);
}

/**
 * Asigna id_seccion a una matrícula: máximo 25 activas por sección por curso.
 * Convención: nombre_seccion "7-1", "8-1" (prefijo = grado: septimo->7, octavo->8, etc).
 * Si hay sección con hueco se usa; si no, se crea una nueva.
 */
const PREFIJO_POR_ANO = {
  septimo: '7',
  octavo: '8',
  noveno: '9',
  decimo: '10',
  undecimo: '11'
};

export async function obtenerOAsignarSeccion(trx, idCursoLectivo, anoACursar) {
  const prefijo = PREFIJO_POR_ANO[anoACursar];
  if (!prefijo) return null;

  const patron = `${prefijo}-%`;

  const seccionesDelGrado = await trx('seccion')
    .where('nombre_seccion', 'like', patron)
    .orderBy('id_seccion', 'asc');

  for (const seccion of seccionesDelGrado) {
    const totalActivas = await contarMatriculasActivasPorSeccion(
      trx,
      idCursoLectivo,
      seccion.id_seccion
    );

    if (totalActivas < MAX_ESTUDIANTES_POR_SECCION) {
      return seccion.id_seccion;
    }
  }

  const siguienteNumero = seccionesDelGrado.length + 1;
  const [nueva] = await trx('seccion')
    .insert({
      numero_seccion: siguienteNumero,
      nombre_seccion: `${prefijo}-${siguienteNumero}`
    })
    .returning('id_seccion');

  invalidateSeccionesCache();

  return nueva.id_seccion;
}
