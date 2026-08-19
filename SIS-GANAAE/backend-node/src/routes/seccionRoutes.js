import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarAdminMatricula } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getSeccionesGuias,
  putAsignarGuia,
  patchRevocarGuia,
} from '../controllers/seccionController.js';

const router = express.Router();

router.get(
  '/admin/secciones-guias',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getSeccionesGuias)
);

router.put(
  '/admin/secciones/:id/asignar-guia',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(putAsignarGuia)
);

router.patch(
  '/admin/secciones/:id/revocar-guia',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(patchRevocarGuia)
);

export default router;
