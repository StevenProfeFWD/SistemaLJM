import apiClient from '../config/api';

const api = apiClient;

export async function getSeccionesGuias() {
  const { data } = await api.get('/admin/secciones-guias');
  return data;
}

export async function asignarProfesorGuia(idSeccion, idPersonaProfesor) {
  const { data } = await api.put(`/admin/secciones/${idSeccion}/asignar-guia`, {
    id_persona_profesor: idPersonaProfesor,
  });
  return data;
}

export async function revocarProfesorGuia(idSeccion) {
  const { data } = await api.patch(`/admin/secciones/${idSeccion}/revocar-guia`);
  return data;
}

const seccionServicio = {
  getSeccionesGuias,
  asignarProfesorGuia,
  revocarProfesorGuia,
};

export default seccionServicio;
