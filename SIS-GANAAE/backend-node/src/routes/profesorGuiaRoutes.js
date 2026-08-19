import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getMiSeccionGuia,
  getAsistenciaSeccionGuia,
  getReportesOrientacionSeccionGuia,
  postComentarioSeguimientoGuia,
} from '../controllers/profesorGuiaController.js';

const router = express.Router();

router.get(
  '/profesor/mi-seccion-guia',
  verificarTokenInterno,
  asyncHandler(getMiSeccionGuia)
);

router.get(
  '/profesor/mi-seccion-guia/asistencia',
  verificarTokenInterno,
  asyncHandler(getAsistenciaSeccionGuia)
);

router.get(
  '/profesor/mi-seccion-guia/reportes-orientacion',
  verificarTokenInterno,
  asyncHandler(getReportesOrientacionSeccionGuia)
);

router.post(
  '/profesor/mi-seccion-guia/comentarios',
  verificarTokenInterno,
  asyncHandler(postComentarioSeguimientoGuia)
);

export default router;
