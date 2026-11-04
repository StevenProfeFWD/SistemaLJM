import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarPersonalAcademico } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getJustificaciones,
  getJustificacionPorAsistencia,
  getJustificacionPorId,
  postJustificacion,
} from '../controllers/justificacionController.js';

const router = express.Router();

// IMPORTANTE: el orden importa. "/justificaciones/asistencia/:id_asistencia" debe
// declararse antes de "/justificaciones/:id"; de lo contrario Express captura
// "asistencia" como :id.

// 1. Historial global (filtros + paginación)
router.get(
  '/justificaciones',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(getJustificaciones)
);

// 2. Justificación de un registro de asistencia
router.get(
  '/justificaciones/asistencia/:id_asistencia',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(getJustificacionPorAsistencia)
);

// 3. Detalle por ID
router.get(
  '/justificaciones/:id',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(getJustificacionPorId)
);

// 4. Registrar justificación
router.post(
  '/justificaciones',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(postJustificacion)
);

export default router;
