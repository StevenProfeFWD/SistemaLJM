import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarSuperAdministrador } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getAdministradores,
  postAdministrador,
  putAdministrador,
  patchAdministradorActivo,
} from '../controllers/superadminController.js';

const router = express.Router();

router.get(
  '/superadmin/administradores',
  verificarTokenInterno,
  verificarSuperAdministrador,
  asyncHandler(getAdministradores)
);

router.post(
  '/superadmin/administradores',
  verificarTokenInterno,
  verificarSuperAdministrador,
  asyncHandler(postAdministrador)
);

router.put(
  '/superadmin/administradores/:id',
  verificarTokenInterno,
  verificarSuperAdministrador,
  asyncHandler(putAdministrador)
);

router.patch(
  '/superadmin/administradores/:id/activo',
  verificarTokenInterno,
  verificarSuperAdministrador,
  asyncHandler(patchAdministradorActivo)
);

export default router;
