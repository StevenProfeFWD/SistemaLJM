import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarAdminOOrientador, verificarLecturaOrientacion } from '../middlewares/verificarRoles.js';
import { assertPuedeVerEstadoPeriodo } from '../middlewares/autorizacionRecurso.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getEstadosOrientacion,
  postEstadoOrientacion,
  patchEstadoOrientacion,
  putEstadoOrientacion,
  patchAnularEstadoOrientacion,
  deleteEstadoOrientacion,
  getBuscarEstudiantesOrientacion,
  getHistorialOrientacion,
  getComprobanteOrientacionPdf,
  getReporteOrientacionFiltradoPdf,
} from '../controllers/orientacionController.js';

const router = express.Router();

router.get(
  '/orientacion/estudiantes/buscar',
  verificarTokenInterno,
  verificarAdminOOrientador,
  asyncHandler(getBuscarEstudiantesOrientacion)
);

router.get(
  '/orientacion/historial',
  verificarTokenInterno,
  verificarLecturaOrientacion,
  asyncHandler(getHistorialOrientacion)
);

router.get(
  '/orientacion/reporte-filtrado-pdf',
  verificarTokenInterno,
  verificarLecturaOrientacion,
  asyncHandler(getReporteOrientacionFiltradoPdf)
);

router.get(
  '/orientacion/comprobante-pdf/:id',
  verificarTokenInterno,
  assertPuedeVerEstadoPeriodo(),
  asyncHandler(getComprobanteOrientacionPdf)
);

router.get(
  '/orientacion/estados',
  verificarTokenInterno,
  verificarLecturaOrientacion,
  asyncHandler(getEstadosOrientacion)
);

router.post(
  '/orientacion/estados',
  verificarTokenInterno,
  verificarAdminOOrientador,
  asyncHandler(postEstadoOrientacion)
);

router.patch(
  '/orientacion/estados/:id/anular',
  verificarTokenInterno,
  verificarAdminOOrientador,
  asyncHandler(patchAnularEstadoOrientacion)
);

router.put(
  '/orientacion/estados/:id',
  verificarTokenInterno,
  verificarAdminOOrientador,
  asyncHandler(putEstadoOrientacion)
);

router.patch(
  '/orientacion/estados/:id',
  verificarTokenInterno,
  verificarAdminOOrientador,
  asyncHandler(patchEstadoOrientacion)
);

router.delete(
  '/orientacion/estados/:id',
  verificarTokenInterno,
  verificarAdminOOrientador,
  asyncHandler(deleteEstadoOrientacion)
);

export default router;
