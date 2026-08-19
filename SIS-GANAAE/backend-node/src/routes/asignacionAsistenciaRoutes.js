import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import {
  verificarAdminAsignacion,
  verificarProfesorOAdmin,
  verificarPersonalAcademico,
} from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getAsignaciones,
  postAsignacion,
  putAsignacion,
  deleteAsignacion,
  getAsignacionesCatalogos,
  getAsistenciaEstudiantes,
  postAsistencia,
  getHorariosSeccion,
  postHorariosSeccion
} from '../controllers/asignacionAsistenciaController.js';
import { getLecciones } from '../controllers/leccionController.js';

const router = express.Router();

router.get(
  '/lecciones',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(getLecciones)
);

router.get(
  '/asignaciones',
  verificarTokenInterno,
  verificarProfesorOAdmin,
  asyncHandler(getAsignaciones)
);

router.post(
  '/asignaciones',
  verificarTokenInterno,
  verificarAdminAsignacion,
  asyncHandler(postAsignacion)
);

router.put(
  '/asignaciones/:id',
  verificarTokenInterno,
  verificarAdminAsignacion,
  asyncHandler(putAsignacion)
);

router.delete(
  '/asignaciones/:id',
  verificarTokenInterno,
  verificarAdminAsignacion,
  asyncHandler(deleteAsignacion)
);

router.get(
  '/asignaciones/catalogos',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(getAsignacionesCatalogos)
);

router.get(
  '/asistencia/estudiantes',
  verificarTokenInterno,
  verificarProfesorOAdmin,
  asyncHandler(getAsistenciaEstudiantes)
);

router.post(
  '/asistencia',
  verificarTokenInterno,
  verificarProfesorOAdmin,
  asyncHandler(postAsistencia)
);

router.get(
  '/horarios-seccion',
  verificarTokenInterno,
  verificarPersonalAcademico,
  asyncHandler(getHorariosSeccion)
);

router.post(
  '/horarios-seccion',
  verificarTokenInterno,
  verificarAdminAsignacion,
  asyncHandler(postHorariosSeccion)
);

export default router;
