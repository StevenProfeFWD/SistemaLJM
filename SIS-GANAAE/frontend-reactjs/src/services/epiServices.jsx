import apiClient from '../config/api';

export async function getReporteAsistenciaEpi(params = {}) {
  const { data } = await apiClient.get('/epi/reporte-asistencia', { params });
  return data;
}

export async function getEstudiantesSeccionEpi(idSeccion, params = {}) {
  const { data } = await apiClient.get(`/epi/secciones/${idSeccion}/estudiantes`, { params });
  return data;
}

export async function descargarReporteAsistenciaEpiPdf(params = {}) {
  const response = await apiClient.get('/epi/reporte-asistencia/pdf', {
    params,
    responseType: 'blob',
  });
  return response.data;
}

export function guardarBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const epiServicio = {
  getReporteAsistenciaEpi,
  getEstudiantesSeccionEpi,
  descargarReporteAsistenciaEpiPdf,
  guardarBlob,
};

export default epiServicio;
