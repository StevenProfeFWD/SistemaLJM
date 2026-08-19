import apiClient from '../config/api';

const api = apiClient;

function handleError(error) {
  if (error.response) throw error.response.data;
  if (error.request) throw { message: 'No se obtuvo respuesta del servidor' };
  throw { message: 'Error en la petición' };
}

export async function getAdministradores() {
  try {
    const { data } = await api.get('/superadmin/administradores');
    return data;
  } catch (error) {
    handleError(error);
  }
}

export async function crearAdministrador(body) {
  try {
    const { data } = await api.post('/superadmin/administradores', body);
    return data;
  } catch (error) {
    handleError(error);
  }
}

export async function actualizarAdministrador(id, body) {
  try {
    const { data } = await api.put(`/superadmin/administradores/${id}`, body);
    return data;
  } catch (error) {
    handleError(error);
  }
}

export async function setAdministradorActivo(id, activo) {
  try {
    const { data } = await api.patch(`/superadmin/administradores/${id}/activo`, { activo });
    return data;
  } catch (error) {
    handleError(error);
  }
}

export default {
  getAdministradores,
  crearAdministrador,
  actualizarAdministrador,
  setAdministradorActivo,
};
