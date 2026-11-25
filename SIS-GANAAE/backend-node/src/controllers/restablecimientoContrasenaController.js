import {
  buscarUsuariosRestablecibles,
  restablecerContrasena,
} from '../services/restablecimientoContrasenaService.js';

export async function getUsuariosRestablecibles(req, res) {
  const usuarios = await buscarUsuariosRestablecibles(req.user.rol, req.user.id, req.query.q);
  return res.json({ usuarios });
}

export async function postRestablecerContrasena(req, res) {
  const resultado = await restablecerContrasena({
    idSolicitante: req.user.id,
    rolSolicitante: req.user.rol,
    idObjetivo: req.params.id,
  });
  return res.json(resultado);
}
