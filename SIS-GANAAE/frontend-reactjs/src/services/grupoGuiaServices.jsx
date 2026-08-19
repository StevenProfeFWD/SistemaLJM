import apiClient from '../config/api';

const api = apiClient;

export async function getMiSeccionGuia() {
  const { data } = await api.get('/profesor/mi-seccion-guia');
  return data;
}

export async function getAsistenciaSeccionGuia(params = {}) {
  const { data } = await api.get('/profesor/mi-seccion-guia/asistencia', { params });
  return data;
}

export async function getReportesOrientacionSeccionGuia(params = {}) {
  const { data } = await api.get('/profesor/mi-seccion-guia/reportes-orientacion', { params });
  return data;
}

export async function postComentarioSeguimiento(body) {
  const { data } = await api.post('/profesor/mi-seccion-guia/comentarios', body);
  return data;
}

const grupoGuiaServicio = {
  getMiSeccionGuia,
  getAsistenciaSeccionGuia,
  getReportesOrientacionSeccionGuia,
  postComentarioSeguimiento,
};

export default grupoGuiaServicio;
