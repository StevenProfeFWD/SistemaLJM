import apiClient from '../config/api';

const api = apiClient;

export async function getPersonal() {
  const { data } = await api.get('/admin/personal');
  return data;
}

export async function actualizarPersonal(id, body) {
  const { data } = await api.put(`/admin/personal/${id}`, body);
  return data;
}

export async function cambiarEstadoPersonal(id, activo) {
  const { data } = await api.patch(`/admin/personal/${id}/estado`, { activo });
  return data;
}

export async function registrarSustitucion(body) {
  const { data } = await api.post('/admin/personal/sustitucion', body);
  return data;
}

export async function getCandidatosSustituto(idTitular) {
  const { data } = await api.get(`/admin/personal/${idTitular}/candidatos-sustituto`);
  return data;
}

export async function getSustituciones(idPersona) {
  const params = idPersona ? { id_persona: idPersona } : {};
  const { data } = await api.get('/admin/personal/sustituciones', { params });
  return data;
}

export async function descargarSustitucionesPdf(idPersona) {
  const params = idPersona ? { id_persona: idPersona } : {};
  const response = await api.get('/admin/personal/sustituciones/pdf', {
    params,
    responseType: 'blob',
  });
  return response.data;
}

export async function cancelarSustitucion(idSustitucion) {
  const { data } = await api.patch(`/personal/sustitucion/${idSustitucion}/cancelar`);
  return data;
}

export async function getMiSustitucionVigente() {
  const { data } = await api.get('/personal/mi-sustitucion-vigente');
  return data;
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

const personalServicio = {
  getPersonal,
  actualizarPersonal,
  cambiarEstadoPersonal,
  registrarSustitucion,
  getCandidatosSustituto,
  getSustituciones,
  descargarSustitucionesPdf,
  cancelarSustitucion,
  getMiSustitucionVigente,
  guardarBlob,
};

export default personalServicio;
