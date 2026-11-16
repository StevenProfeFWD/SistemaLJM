/**
 * Extrae mensaje legible de errores Axios o de objetos lanzados por servicios (response.data).
 * Prioriza message (p. ej. 409 cupo) sobre error legacy.
 */
const MENSAJE_GENERICO_AXIOS = /^Request failed with status code \d+$/i;

export function mapApiError(err, fallback = 'Error inesperado') {
  if (err == null) return fallback;

  const data = err.response?.data ?? err;

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  // Si la respuesta no trae cuerpo, data es el propio error de axios: su message genérico en inglés no se muestra.
  if (
    typeof data?.message === 'string' &&
    data.message.trim() &&
    !MENSAJE_GENERICO_AXIOS.test(data.message.trim())
  ) {
    return data.message.trim();
  }

  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }

  // Los middlewares de sesión (401/403/503) responden { mensaje }.
  if (typeof data?.mensaje === 'string' && data.mensaje.trim()) {
    return data.mensaje.trim();
  }

  const msg = err?.message;
  if (
    typeof msg === 'string' &&
    msg.trim() &&
    !MENSAJE_GENERICO_AXIOS.test(msg.trim())
  ) {
    return msg.trim();
  }

  return fallback;
}
