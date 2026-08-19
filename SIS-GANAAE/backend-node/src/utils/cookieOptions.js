/**
 * Opciones compartidas para Set-Cookie / clearCookie.
 * En producción (HTTPS) exige Secure; en desarrollo local permite HTTP.
 */
export function esProduccion() {
  return process.env.NODE_ENV === 'production';
}

export function cookieAuthOptions({ maxAgeMs } = {}) {
  const opts = {
    httpOnly: true,
    secure: esProduccion(),
    sameSite: 'lax',
    path: '/',
  };
  if (typeof maxAgeMs === 'number' && maxAgeMs > 0) {
    opts.maxAge = maxAgeMs;
  }
  return opts;
}

/** Misma firma que cookieAuthOptions para que el navegador borre la cookie correctamente. */
export function cookieClearOptions() {
  return {
    httpOnly: true,
    secure: esProduccion(),
    sameSite: 'lax',
    path: '/',
  };
}
