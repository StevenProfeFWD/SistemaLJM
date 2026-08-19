import {
  obtenerMiSeccionGuia,
  obtenerAsistenciaSeccionGuia,
  obtenerReportesOrientacionSeccionGuia,
  crearComentarioSeguimientoGuia,
} from '../services/profesorGuiaService.js';
import AppError from '../utils/AppError.js';

function assertProfesor(req) {
  if (req.user?.rol !== 'profesor') {
    throw new AppError('Acceso exclusivo para docentes', 403);
  }
}

export async function getMiSeccionGuia(req, res) {
  assertProfesor(req);
  const datos = await obtenerMiSeccionGuia(req.user.id);
  return res.json(datos);
}

export async function getAsistenciaSeccionGuia(req, res) {
  assertProfesor(req);
  const datos = await obtenerAsistenciaSeccionGuia(req.user.id, req.query);
  return res.json(datos);
}

export async function getReportesOrientacionSeccionGuia(req, res) {
  assertProfesor(req);
  const datos = await obtenerReportesOrientacionSeccionGuia(req.user.id, req.query);
  return res.json(datos);
}

export async function postComentarioSeguimientoGuia(req, res) {
  assertProfesor(req);
  const resultado = await crearComentarioSeguimientoGuia(req.user.id, req.body);
  return res.status(201).json(resultado);
}
