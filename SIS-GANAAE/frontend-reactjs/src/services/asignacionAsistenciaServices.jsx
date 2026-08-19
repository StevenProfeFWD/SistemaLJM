import apiClient from '../config/api';

const api = apiClient;

/**
 * @param {string} [fecha] YYYY-MM-DD — filtra asignaciones con horario ese día (ISO 1–7).
 * Sin fecha devuelve el arreglo completo (pantalla de administración).
 * Con fecha devuelve { asignaciones, dia_semana_label, es_fin_de_semana, ... }.
 */
export async function getAsignaciones(fecha) {
  const params = fecha ? { fecha } : {};
  const { data } = await api.get('/asignaciones', { params });
  if (fecha && data && Array.isArray(data.asignaciones)) {
    return data;
  }
  return data;
}

export async function getCatalogos() {
  const { data } = await api.get('/asignaciones/catalogos');
  return data;
}

export async function crearAsignacion(body) {
  const { data } = await api.post('/asignaciones', body);
  return data;
}

export async function actualizarAsignacion(id, body) {
  const { data } = await api.put(`/asignaciones/${id}`, body);
  return data;
}

export async function eliminarAsignacion(id) {
  const { data } = await api.delete(`/asignaciones/${id}`);
  return data;
}

export async function getLecciones() {
  const { data } = await api.get('/lecciones');
  return data;
}

export async function getEstudiantesParaAsistencia(idAsignacion, fecha) {
  const { data } = await api.get('/asistencia/estudiantes', {
    params: { id_asignacion: idAsignacion, fecha },
  });
  return data;
}

export async function registrarAsistencia(body) {
  const { data } = await api.post('/asistencia', body);
  return data;
}

export async function getMisEstudiantes() {
  const { data } = await api.get('/personas/mis-estudiantes');
  return data;
}

export async function getSesion() {
  const { data } = await api.get('/personas/sesion');
  return data;
}

export async function descargarComprobanteMatricula(idMatricula) {
  const response = await api.get(`/matriculas/comprobante/${idMatricula}`, {
    responseType: 'blob',
  });
  return response.data;
}

// ... al final de asignacionAsistenciaServices.jsx

const servicio = {
  getAsignaciones,
  getCatalogos,
  getLecciones,
  crearAsignacion,
  actualizarAsignacion,
  eliminarAsignacion,
  getEstudiantesParaAsistencia,
  registrarAsistencia,
  getMisEstudiantes,
  getSesion,
  descargarComprobanteMatricula
};

export default servicio;