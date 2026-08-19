import { consultarCedulaEncargado } from '../services/encargadoService.js';
import { esAdministradorOperativo } from '../utils/roles.js';
import AppError from '../utils/AppError.js';

function puedeConsultarCedula(rol) {
  return esAdministradorOperativo(rol) || rol === 'profesor';
}

export async function getConsultarCedula(req, res) {
  if (!puedeConsultarCedula(req.user?.rol)) {
    throw new AppError('No autorizado', 403);
  }

  const result = await consultarCedulaEncargado(req.params.cedula);
  return res.json(result);
}
