/**
 * Extrae mensaje legible de errores Axios o de objetos lanzados por servicios (response.data).
 * Prioriza message (p. ej. 409 cupo) sobre error legacy.
 */
export function mapApiError(err, fallback = 'Error inesperado') {
  if (err == null) return fallback;

  const data = err.response?.data ?? err;

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }

  const msg = err?.message;
  if (
    typeof msg === 'string' &&
    msg.trim() &&
    !/^Request failed with status code \d+$/i.test(msg.trim())
  ) {
    return msg.trim();
  }

  return fallback;
}
