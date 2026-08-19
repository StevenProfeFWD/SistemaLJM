import apiClient from '../config/api';

const api = apiClient;

export async function getMaterias() {
  const { data } = await api.get('/materias');
  return data;
}

export async function postMateria(body) {
  const { data } = await api.post('/materias', body);
  return data;
}

export async function putMateria(id, body) {
  const { data } = await api.put(`/materias/${id}`, body);
  return data;
}

export async function deleteMateria(id) {
  await api.delete(`/materias/${id}`);
}
