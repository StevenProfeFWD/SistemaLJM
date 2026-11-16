import apiClient from '../config/api';

const api = apiClient;

export async function listarNotificaciones(params = {}) {
  const { data } = await api.get('/notificaciones', { params });
  return data;
}

const notificacionServicio = {
  listarNotificaciones,
};

export default notificacionServicio;
