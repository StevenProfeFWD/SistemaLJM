import apiClient from '../config/api';

const api = apiClient;

export async function buscarEstudiantesOrientacion(params = {}) {
  const { q, id_estudiante } = params;
  const queryParams = {};
  if (id_estudiante) queryParams.id_estudiante = id_estudiante;
  else if (q) queryParams.q = q;
  const { data } = await api.get('/orientacion/estudiantes/buscar', { params: queryParams });
  return data;
}

export async function getHistorialOrientacion(params = {}) {
  const { data } = await api.get('/orientacion/historial', { params });
  return data;
}

export async function getEstadosOrientacion(idEstudiante) {
  const params = idEstudiante ? { id_estudiante: idEstudiante } : {};
  const { data } = await api.get('/orientacion/estados', { params });
  return data;
}

export async function crearEstadoOrientacion(body) {
  const { data } = await api.post('/orientacion/estados', body);
  return data;
}

export async function actualizarEstadoOrientacion(id, body) {
  const { data } = await api.put(`/orientacion/estados/${id}`, body);
  return data;
}

export async function anularEstadoOrientacion(id) {
  const { data } = await api.patch(`/orientacion/estados/${id}/anular`);
  return data;
}

export async function eliminarEstadoOrientacion(id) {
  const { data } = await api.delete(`/orientacion/estados/${id}`);
  return data;
}

export async function descargarComprobanteOrientacionPdf(id) {
  const response = await api.get(`/orientacion/comprobante-pdf/${id}`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function descargarReporteOrientacionFiltradoPdf(params = {}) {
  const response = await api.get('/orientacion/reporte-filtrado-pdf', {
    params,
    responseType: 'blob',
  });
  return response.data;
}

function guardarBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const orientacionServicio = {
  buscarEstudiantesOrientacion,
  getHistorialOrientacion,
  getEstadosOrientacion,
  crearEstadoOrientacion,
  actualizarEstadoOrientacion,
  anularEstadoOrientacion,
  eliminarEstadoOrientacion,
  descargarComprobanteOrientacionPdf,
  descargarReporteOrientacionFiltradoPdf,
  guardarBlob,
};

export default orientacionServicio;
