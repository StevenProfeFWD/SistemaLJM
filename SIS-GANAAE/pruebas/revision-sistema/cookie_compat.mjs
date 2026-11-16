// Compara la derivación de clave antigua vs. nueva (no toca .env real).
const KEY_LENGTH = 32;
const vieja = (k) => Buffer.from(k.slice(0, KEY_LENGTH), 'utf8');
const nueva = (k) => Buffer.from(k, 'utf8').subarray(0, KEY_LENGTH);
for (const k of ['a'.repeat(32), 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF', 'ñ'.repeat(40), 'clave-con-tilde-é-xxxxxxxxxxxxxxxxxxxxxxx']) {
  const v = vieja(k), n = nueva(k);
  console.log(JSON.stringify(k.slice(0,12)), 'iguales:', v.equals(n), 'lenVieja:', v.length, 'lenNueva:', n.length);
}
