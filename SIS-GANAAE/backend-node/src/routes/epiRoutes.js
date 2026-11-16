import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarReportesEpi } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getReporteAsistenciaEpi,
  getReporteAsistenciaEpiPdf,
  getEstudiantesSeccionEpi,
} from '../controllers/epiController.js';

const router = express.Router();

router.get(
  '/epi/reporte-asistencia',
  verificarTokenInterno,
  verificarReportesEpi,
  asyncHandler(getReporteAsistenciaEpi)
);

router.get(
  '/epi/secciones/:idSeccion/estudiantes',
  verificarTokenInterno,
  verificarReportesEpi,
  asyncHandler(getEstudiantesSeccionEpi)
);

router.get(
  '/epi/reporte-asistencia/pdf',
  verificarTokenInterno,
  verificarReportesEpi,
  asyncHandler(getReporteAsistenciaEpiPdf)
);

export default router;
