import apiClient from '../config/api';

const api = apiClient;

/**
 * Historial global de justificaciones.
 * @param {object} params fecha_inicio, fecha_fin, id_seccion, tipo_justificacion, busqueda, page, limit
 */
export async function listarJustificaciones(params = {}) {
  const limpio = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const { data } = await api.get('/justificaciones', { params: limpio });
  return data;
}

export async function getJustificacionPorId(id) {
  const { data } = await api.get(`/justificaciones/${id}`);
  return data;
}

/** Devuelve la justificación del registro de asistencia o null. */
export async function getJustificacionPorAsistencia(idAsistencia) {
  const { data } = await api.get(`/justificaciones/asistencia/${idAsistencia}`);
  return data?.justificacion ?? null;
}

/**
 * @param {{ id_asistencia: number, tipo_justificacion: string, descripcion: string, documento_adjunto?: string }} body
 */
export async function registrarJustificacion(body) {
  const { data } = await api.post('/justificaciones', body);
  return data;
}

const servicio = {
  listarJustificaciones,
  getJustificacionPorId,
  getJustificacionPorAsistencia,
  registrarJustificacion,
};

export default servicio;
