import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarRestablecerContrasenas } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getUsuariosRestablecibles,
  postRestablecerContrasena,
} from '../controllers/restablecimientoContrasenaController.js';

const router = express.Router();

// Lista de usuarios cuya contraseña puede restablecer quien consulta (filtrada por su rol).
router.get(
  '/usuarios/restablecer-contrasena',
  verificarTokenInterno,
  verificarRestablecerContrasenas,
  asyncHandler(getUsuariosRestablecibles)
);

// Restablece la contraseña a la temporal "liceomarti" y obliga a cambiarla al ingresar.
router.post(
  '/usuarios/:id/restablecer-contrasena',
  verificarTokenInterno,
  verificarRestablecerContrasenas,
  asyncHandler(postRestablecerContrasena)
);

export default router;
