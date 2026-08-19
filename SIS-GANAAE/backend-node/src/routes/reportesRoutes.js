import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarAdminOReportes } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getEstadisticasReportes,
  getPermanenciaAlertas,
} from '../controllers/reportesController.js';

const router = express.Router();

router.get(
  '/reportes/estadisticas',
  verificarTokenInterno,
  verificarAdminOReportes,
  asyncHandler(getEstadisticasReportes)
);

router.get(
  '/reportes/permanencia-alertas',
  verificarTokenInterno,
  verificarAdminOReportes,
  asyncHandler(getPermanenciaAlertas)
);

export default router;
