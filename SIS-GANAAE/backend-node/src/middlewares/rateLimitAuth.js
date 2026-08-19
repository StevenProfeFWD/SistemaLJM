import rateLimit from 'express-rate-limit';

const MENSAJE_LOGIN_BLOQUEADO =
  'Demasiados intentos de inicio de sesión. Por favor, intente de nuevo en 15 minutos.';

const MENSAJE_RATE_LIMIT =
  'Demasiadas solicitudes. Por favor, intente de nuevo más tarde.';

/**
 * Límite de fuerza bruta en POST /api/personas/login: 5 intentos / IP / 15 min.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler(req, res) {
    res.status(429).json({
      status: 'error',
      code: 429,
      error: MENSAJE_LOGIN_BLOQUEADO,
      message: MENSAJE_LOGIN_BLOQUEADO,
    });
  },
});

/** Límite general de API autenticada: 300 req / IP / 15 min. */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      status: 'error',
      code: 429,
      error: MENSAJE_RATE_LIMIT,
      message: MENSAJE_RATE_LIMIT,
    });
  },
});

/** Consultas a proxy Hacienda / cédula: 30 / IP / 15 min. */
export const haciendaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      status: 'error',
      code: 429,
      error: 'Demasiadas consultas de identificación. Intente más tarde.',
      message: 'Demasiadas consultas de identificación. Intente más tarde.',
    });
  },
});

/** Precarga CSV y operaciones pesadas: 10 / IP / hora. */
export const operacionPesadaRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      status: 'error',
      code: 429,
      error: 'Límite de operaciones masivas alcanzado. Intente más tarde.',
      message: 'Límite de operaciones masivas alcanzado. Intente más tarde.',
    });
  },
});
