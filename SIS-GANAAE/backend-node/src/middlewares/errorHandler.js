import AppError from '../utils/AppError.js';

export function notFound(req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  next(
    new AppError(isProd ? 'Ruta no encontrada' : `Ruta no encontrada: ${req.originalUrl}`, 404)
  );
}

export function errorHandler(err, req, res, next) {
  let statusCode = 500;
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    statusCode = err.statusCode;
  } else if (typeof err?.code === 'number' && err.code >= 400 && err.code < 600) {
    statusCode = err.code;
  }

  // Rechazo de CORS (cors package)
  const isCors =
    typeof err?.message === 'string' && err.message.startsWith('Origen CORS no permitido');
  if (isCors) {
    statusCode = 403;
  }

  const isProd = process.env.NODE_ENV === 'production';
  let message = err?.message || 'Error interno del servidor';
  if (isProd && statusCode >= 500 && !(err?.statusCode >= 400 && err?.statusCode < 500)) {
    message = 'Error interno del servidor';
  }
  if (isCors) {
    message = 'Origen no permitido';
  }

  if (res.headersSent) return next(err);

  if (err?.legacyJson != null && typeof err.legacyJson === 'object') {
    return res.status(statusCode).json(err.legacyJson);
  }

  const payload = {
    status: 'error',
    message,
    code: statusCode,
    error: message,
  };

  if (!isProd && err?.details) payload.details = err.details;

  return res.status(statusCode).json(payload);
}

