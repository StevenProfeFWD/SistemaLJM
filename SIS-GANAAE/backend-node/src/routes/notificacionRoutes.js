import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getNotificaciones } from '../controllers/notificacionController.js';
import { puedeVerReportesEstrategicos } from '../utils/roles.js';

const router = express.Router();

/** Admin, orientador y super administrador (auditoría institucional). */
function verificarLecturaNotificaciones(req, res, next) {
  if (!puedeVerReportesEstrategicos(req.user?.rol)) {
    return res.status(403).json({
      error: 'Acceso restringido a administradores y orientadores',
    });
  }
  next();
}

router.get(
  '/notificaciones',
  verificarTokenInterno,
  verificarLecturaNotificaciones,
  asyncHandler(getNotificaciones)
);

export default router;
