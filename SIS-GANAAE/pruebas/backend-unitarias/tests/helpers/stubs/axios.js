// Stub de axios: por defecto toda petición HTTP falla (no hay red en pruebas unitarias).
// Un test puede instalar un manejador con setManejador() para simular respuestas.
export const peticiones = [];
let manejador = null;
export function setManejador(fn) {
  manejador = fn;
}
const get = (url, opts) => {
  peticiones.push(url);
  if (manejador) return manejador(url, opts);
  return Promise.reject(new Error(`red deshabilitada en pruebas: ${url}`));
};
export default { get };
export { get };
