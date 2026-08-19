/**
 * Orígenes CORS permitidos (FRONTEND_ORIGIN, lista separada por comas).
 * En desarrollo, si no hay variable, permite Vite local.
 */
export function obtenerOrigenesCorsPermitidos() {
  const raw = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || '';
  const fromEnv = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (fromEnv.length > 0) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    return [];
  }

  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

export function corsOriginCallback(origin, callback) {
  const allowed = obtenerOrigenesCorsPermitidos();

  // Peticiones same-origin / herramientas sin Origin (curl, health checks)
  if (!origin) {
    return callback(null, true);
  }

  if (allowed.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`Origen CORS no permitido: ${origin}`));
}
