import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  const key = process.env.COOKIE_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('COOKIE_ENCRYPTION_KEY debe estar definida en .env');
  }
  if (key.length >= KEY_LENGTH) {
    return Buffer.from(key.slice(0, KEY_LENGTH), 'utf8');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Cifra un valor (p.ej. JWT) antes de almacenarlo en una cookie.
 * @param {string} valor - Texto a cifrar
 * @returns {string} - Valor cifrado en base64 (iv + authTag + ciphertext)
 */
export function cifrarCookie(valor) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(valor, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Descifra un valor previamente cifrado con cifrarCookie.
 * @param {string} valorCifrado - Valor en base64
 * @returns {string|null} - Texto descifrado o null si falla
 */
export function descifrarCookie(valorCifrado) {
  if (!valorCifrado || typeof valorCifrado !== 'string') {
    return null;
  }

  try {
    const key = getEncryptionKey();
    const buffer = Buffer.from(valorCifrado, 'base64');

    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      return null;
    }

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch {
    return null;
  }
}
