import apiClient from '../config/api';

/** Usuarios cuya contraseña puede restablecer quien consulta (el backend filtra según su rol). */
export async function buscarUsuariosRestablecibles(q = '') {
  const { data } = await apiClient.get('/usuarios/restablecer-contrasena', {
    params: q ? { q } : {},
  });
  return data.usuarios || [];
}

/** Restablece la contraseña a la temporal del sistema; el usuario deberá cambiarla al ingresar. */
export async function restablecerContrasena(idPersona) {
  const { data } = await apiClient.post(`/usuarios/${idPersona}/restablecer-contrasena`);
  return data;
}

const restablecimientoServicio = {
  buscarUsuariosRestablecibles,
  restablecerContrasena,
};

export default restablecimientoServicio;
