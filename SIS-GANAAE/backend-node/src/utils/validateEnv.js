import dotenv from 'dotenv';

dotenv.config();

const DEFAULTS_INSEGUROS = new Set([
  'clave-jwt',
  'clave-cifrado-cookies-32-chars-minimo',
  'your-secret-key',
  'changeme',
]);

function esProduccion() {
  return process.env.NODE_ENV === 'production';
}

function esValorInseguro(valor) {
  if (!valor || String(valor).trim().length < 16) return true;
  const normalizado = String(valor).trim().toLowerCase();
  if (DEFAULTS_INSEGUROS.has(String(valor).trim())) return true;
  if (DEFAULTS_INSEGUROS.has(normalizado)) return true;
  return false;
}

/**
 * En producción exige secretos fuertes y origen CORS configurado.
 * En desarrollo solo advierte.
 */
export function validarSeguridadEntorno() {
  const advertencias = [];
  const errores = [];

  const jwtSecret = process.env.JWT_SECRET;
  const cookieKey = process.env.COOKIE_ENCRYPTION_KEY;
  const frontendOrigin = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN;

  if (esValorInseguro(jwtSecret)) {
    const msg =
      'JWT_SECRET debe ser una cadena aleatoria de al menos 16 caracteres (no use valores por defecto).';
    if (esProduccion()) errores.push(msg);
    else advertencias.push(msg);
  }

  if (esValorInseguro(cookieKey)) {
    const msg =
      'COOKIE_ENCRYPTION_KEY debe ser una cadena aleatoria de al menos 16 caracteres (no use valores por defecto).';
    if (esProduccion()) errores.push(msg);
    else advertencias.push(msg);
  }

  if (esProduccion() && !String(frontendOrigin || '').trim()) {
    errores.push(
      'FRONTEND_ORIGIN (o CORS_ORIGIN) es obligatorio en producción. Defina la URL del frontend, p. ej. https://app.ejemplo.com'
    );
  }

  for (const w of advertencias) {
    console.warn(`[validateEnv] ADVERTENCIA: ${w}`);
  }

  if (errores.length > 0) {
    console.error('[validateEnv] Configuración insegura en producción:');
    errores.forEach((e) => console.error(`  - ${e}`));
    throw new Error(
      'Variables de entorno inseguras. Configure JWT_SECRET, COOKIE_ENCRYPTION_KEY y FRONTEND_ORIGIN antes de desplegar.'
    );
  }
}
