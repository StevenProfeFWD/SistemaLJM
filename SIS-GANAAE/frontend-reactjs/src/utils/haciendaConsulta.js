export const MENSAJE_HACIENDA_DEFAULT =
  'El servicio de Hacienda no está disponible en este momento. Puede ingresar los datos manualmente.';

export const MENSAJE_NOMBRE_MANUAL = 'Ingrese el nombre completo manualmente.';
export const MENSAJE_DATOS_MANUAL = 'Complete los datos manualmente.';

/**
 * Indica saturación o indisponibilidad de la API de Hacienda (no un "no encontrado" normal).
 */
export function esFalloServicioHacienda(data) {
  if (!data) return false;

  if (data.encontrado === true || data.encontradoExterno === true) return false;
  if (data.existeInterno === true) return false;
  if (data.fuente === 'registro_local' || data.fuente === 'hacienda') return false;

  const codigo = data.codigo;
  if (codigo === 'HACIENDA_RATE_LIMIT' || codigo === 'HACIENDA_NO_DISPONIBLE') return true;

  const msg = String(data.mensaje || data.error || data.message || '').toLowerCase();
  if (!msg) return false;

  if (msg.includes('tiempo de espera agotado') || msg.includes('timeout')) return true;
  if (msg.includes('límite de consultas') || msg.includes('limite de consultas')) return true;
  if (msg.includes('saturado')) return true;

  if (!msg.includes('hacienda') && !msg.includes('no fue posible consultar')) {
    return false;
  }

  return (
    msg.includes('límite') ||
    msg.includes('limite') ||
    msg.includes('no disponible') ||
    msg.includes('no fue posible') ||
    msg.includes('saturado')
  );
}

export function mensajeFalloHacienda(data, fallback = MENSAJE_HACIENDA_DEFAULT) {
  return data?.mensaje || data?.error || data?.message || fallback;
}

/**
 * Muestra toast warning si Hacienda no respondió por límite/indisponibilidad.
 * @returns {boolean} true si se mostró el aviso
 */
export function notificarHaciendaIndisponible(toast, data, err) {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (status === 504) {
    toast(
      mensajeFalloHacienda(
        err,
        'Tiempo de espera agotado al consultar Hacienda. Puede ingresar los datos manualmente.'
      ),
      'warning'
    );
    return true;
  }

  const payload = data || err;
  if (!esFalloServicioHacienda(payload)) return false;

  toast(mensajeFalloHacienda(payload), 'warning');
  return true;
}
