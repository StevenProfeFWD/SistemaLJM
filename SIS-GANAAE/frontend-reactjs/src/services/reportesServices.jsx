import apiClient from '../config/api';

const api = apiClient;

export async function getEstadisticasReportes(params = {}) {
  const { data } = await api.get('/reportes/estadisticas', { params });
  return data;
}

export async function getPermanenciaAlertas(params = {}) {
  const { data } = await api.get('/reportes/permanencia-alertas', { params });
  return data;
}

const reportesServicio = {
  getEstadisticasReportes,
  getPermanenciaAlertas,
};

export default reportesServicio;
