import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarPadreDeFamilia } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getAsistenciaHijos,
  getReporteAsistenciaPdf,
  getEstadosEspecialesHijos,
  getDashboardHijo,
} from '../controllers/padresAsistenciaController.js';

const router = express.Router();

router.get(
  '/padres/hijos/asistencia',
  verificarTokenInterno,
  verificarPadreDeFamilia,
  asyncHandler(getAsistenciaHijos)
);

router.get(
  '/padres/hijos/reporte-pdf',
  verificarTokenInterno,
  verificarPadreDeFamilia,
  asyncHandler(getReporteAsistenciaPdf)
);

router.get(
  '/padres/hijos/estados-especiales',
  verificarTokenInterno,
  verificarPadreDeFamilia,
  asyncHandler(getEstadosEspecialesHijos)
);

router.get(
  '/padres/hijos/dashboard',
  verificarTokenInterno,
  verificarPadreDeFamilia,
  asyncHandler(getDashboardHijo)
);

export default router;
