import apiClient from '../config/api';

const api = apiClient;

export async function getHistorialAsistenciaHijos({ id_estudiante, fecha_inicio, fecha_fin }) {
  const { data } = await api.get('/padres/hijos/asistencia', {
    params: { id_estudiante, fecha_inicio, fecha_fin },
  });
  return data;
}

export async function getDashboardHijo(id_estudiante) {
  const { data } = await api.get('/padres/hijos/dashboard', {
    params: { id_estudiante },
  });
  return data;
}

export async function descargarReporteAsistenciaPdf({ id_estudiante, fecha_inicio, fecha_fin }) {
  const response = await api.get('/padres/hijos/reporte-pdf', {
    params: { id_estudiante, fecha_inicio, fecha_fin },
    responseType: 'blob',
  });
  return response.data;
}

export async function getEstadosEspecialesHijos({ id_estudiante }) {
  const { data } = await api.get('/padres/hijos/estados-especiales', {
    params: { id_estudiante },
  });
  return data;
}

export async function descargarComprobanteEstadoEspecialPdf(idEstadoPeriodo) {
  const response = await api.get(`/orientacion/comprobante-pdf/${idEstadoPeriodo}`, {
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

const padresServicio = {
  getHistorialAsistenciaHijos,
  getDashboardHijo,
  descargarReporteAsistenciaPdf,
  getEstadosEspecialesHijos,
  descargarComprobanteEstadoEspecialPdf,
  guardarBlob,
};

export default padresServicio;
