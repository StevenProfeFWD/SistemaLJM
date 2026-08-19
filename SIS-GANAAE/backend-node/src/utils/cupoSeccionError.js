import AppError from './AppError.js';

export const MSG_CUPO_SECCION =
  'La sección seleccionada ya alcanzó el cupo máximo de 25 estudiantes activos. Por favor, seleccione o cree otra sección.';

/**
 * Detecta el RAISE EXCEPTION del trigger tr_matricula_max_por_seccion (script 28).
 * @param {unknown} error
 */
export function isCupoSeccionDbError(error) {
  if (!error || typeof error !== 'object') return false;
  const msg = String(error.message || error.detail || '').toLowerCase();
  if (msg.includes('máximo de 25') || msg.includes('maximo de 25')) return true;
  if (error.code === 'P0001' && msg.includes('25') && msg.includes('secci')) return true;
  return false;
}

export function throwCupoSeccionConflict() {
  throw new AppError(MSG_CUPO_SECCION, 409, {
    legacyJson: {
      status: 'error',
      message: MSG_CUPO_SECCION,
    },
  });
}

/**
 * Convierte error de trigger de cupo en HTTP 409; relanza el resto.
 * @param {unknown} error
 */
export function rethrowIfCupoSeccion(error) {
  if (isCupoSeccionDbError(error)) {
    throwCupoSeccionConflict();
  }
  throw error;
}

/**
 * Manejo estándar de errores en transacciones de matrícula.
 * @param {unknown} error
 * @param {string} fallbackMessage
 */
export function handleMatriculaWriteError(error, fallbackMessage = 'Error al procesar la matrícula') {
  if (error instanceof AppError) {
    throw error;
  }
  if (isCupoSeccionDbError(error)) {
    throwCupoSeccionConflict();
  }
  console.error(fallbackMessage, error);
  throw new AppError(fallbackMessage, 500, {
    legacyJson: { status: 'error', error: fallbackMessage, message: fallbackMessage },
  });
}
