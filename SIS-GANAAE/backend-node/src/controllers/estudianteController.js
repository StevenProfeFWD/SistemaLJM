import {
  buscarEncargadosParaEstudiante,
  actualizarEstudianteConEncargado,
  reactivarEstudiante,
} from '../services/estudianteService.js';
import { esAdministradorOperativo } from '../utils/roles.js';
import AppError from '../utils/AppError.js';

function puedeGestionarEstudiantes(rol) {
  return esAdministradorOperativo(rol);
}

export async function getBuscarEncargadosEstudiante(req, res) {
  if (!puedeGestionarEstudiantes(req.user?.rol)) {
    throw new AppError('No autorizado', 403);
  }
  const lista = await buscarEncargadosParaEstudiante(req.query.q);
  return res.json({ total: lista.length, encargados: lista });
}

export async function patchReactivarEstudiante(req, res) {
  if (!puedeGestionarEstudiantes(req.user?.rol)) {
    throw new AppError('No autorizado', 403);
  }
  const result = await reactivarEstudiante(req.params.id);
  return res.json(result);
}
