/**
 * Ruta de inicio según rol tras login o cambio de contraseña.
 */
export function rutaInicioPorRol(rol) {
  if (rol === 'orientador') return '/panel-orientador';
  if (rol === 'super_administrador') return '/panel-super-admin';
  return '/inicio';
}
