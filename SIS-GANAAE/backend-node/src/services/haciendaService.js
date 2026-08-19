import axios from 'axios';
import AppError from '../utils/AppError.js';

const HACIENDA_URL = 'https://api.hacienda.go.cr/fe/ae';

/** Timeout por defecto 10s. Override: HACIENDA_TIMEOUT_MS en .env (5000–120000). */
function getHaciendaTimeoutMs() {
  const raw = process.env.HACIENDA_TIMEOUT_MS;
  const n = raw != null && raw !== '' ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(n)) return 10000;
  return Math.min(Math.max(n, 5000), 120000);
}

/** @param {unknown} err */
function isTimeoutError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = /** @type {{ code?: string }} */ (err).code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return true;
  const msg = String(/** @type {{ message?: string }} */ (err).message || '');
  return /timeout/i.test(msg);
}

/**
 * Normaliza identificación (cédula / DIMEX) para consulta.
 */
export function normalizarIdentificacion(raw) {
  return String(raw || '').replace(/[\s\-]/g, '');
}

/**
 * Consulta API Hacienda por identificación.
 * @returns {Promise<{ encontrado: true, identificacion: string, tipoIdentificacion: string|null, nombreCompleto: string } | { encontrado: false, mensaje: string }>}
 * @throws {AppError} 400 identificación vacía; 504 timeout; 500 otro fallo
 */
export async function consultarIdentificacion(rawIdentificacion) {
  const id = normalizarIdentificacion(rawIdentificacion);
  if (!id) {
    throw new AppError('Identificación requerida', 400, {
      legacyJson: { error: 'Identificación requerida' },
    });
  }

  const timeoutMs = getHaciendaTimeoutMs();

  try {
    const resp = await axios.get(HACIENDA_URL, {
      params: { identificacion: id },
      headers: { Accept: 'application/json' },
      timeout: timeoutMs,
    });

    const nombre = resp?.data?.nombre;
    if (!nombre) {
      return { encontrado: false, mensaje: 'No se encontraron datos' };
    }

    return {
      encontrado: true,
      identificacion: resp.data.identificacion || id,
      tipoIdentificacion: resp.data.tipoIdentificacion || null,
      nombreCompleto: nombre,
    };
  } catch (error) {
    const status = error.response?.status;
    const payload = error.response?.data;
    console.error(
      'Error en consultar-identificacion (Hacienda):',
      payload || error.message
    );

    if (isTimeoutError(error)) {
      const msg =
        'Tiempo de espera agotado al consultar Hacienda. Intente de nuevo, aumente HACIENDA_TIMEOUT_MS en el servidor, o complete el nombre manualmente si aplica.';
      throw new AppError(msg, 504, {
        legacyJson: { error: msg },
      });
    }

    if (status === 404) {
      return {
        encontrado: false,
        mensaje: 'No se encontraron datos en Hacienda para esta identificación',
      };
    }

    if (status === 429) {
      return {
        encontrado: false,
        mensaje:
          'El servicio de Hacienda está temporalmente saturado (límite de consultas). Puede ingresar el nombre manualmente.',
        codigo: 'HACIENDA_RATE_LIMIT',
      };
    }

    if (status != null && status >= 400 && status < 500) {
      return {
        encontrado: false,
        mensaje:
          payload?.status ||
          payload?.message ||
          'No se encontraron datos en Hacienda para esta identificación',
      };
    }

    return {
      encontrado: false,
      mensaje:
        'No fue posible consultar Hacienda en este momento. Puede ingresar el nombre manualmente.',
      codigo: 'HACIENDA_NO_DISPONIBLE',
    };
  }
}
