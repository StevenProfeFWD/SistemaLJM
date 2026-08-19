import {
  listarSeccionesConGuia,
  asignarProfesorGuia,
  revocarProfesorGuia,
} from '../services/seccionService.js';
import AppError from '../utils/AppError.js';
import { esAdministradorOperativo } from '../utils/roles.js';

function assertAdmin(req) {
  if (!esAdministradorOperativo(req.user?.rol)) {
    throw new AppError('Solo los administradores pueden gestionar profesores guía', 403);
  }
}

export async function getSeccionesGuias(req, res) {
  assertAdmin(req);
  const datos = await listarSeccionesConGuia();
  return res.json(datos);
}

export async function putAsignarGuia(req, res) {
  assertAdmin(req);
  const resultado = await asignarProfesorGuia(
    req.params.id,
    req.body?.id_persona_profesor
  );
  return res.json(resultado);
}

export async function patchRevocarGuia(req, res) {
  assertAdmin(req);
  const resultado = await revocarProfesorGuia(req.params.id);
  return res.json(resultado);
}
