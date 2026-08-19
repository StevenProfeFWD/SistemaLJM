import express from 'express';
import multer from 'multer';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarAdminMatricula } from '../middlewares/verificarRoles.js';
import { haciendaRateLimiter, operacionPesadaRateLimiter } from '../middlewares/rateLimitAuth.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  consultarIdentificacion,
  getMatriculas,
  getMatriculaById,
  getMatriculasPorEstudiante,
  buscarEstudiantePorCedula,
  buscarTutorParaMatriculaRegular,
  crearMatriculaNuevoIngreso,
  crearMatriculaRegular,
  crearMatriculaTraslado,
  patchMatriculaEstado,
  getComprobanteMatriculaPdf,
  getCursosLectivos,
  postPrecargaMasiva,
} from '../controllers/matriculaController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.csv')) {
      cb(new Error('Solo se permiten archivos .csv'));
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

router.get(
  '/matriculas/consultar-identificacion/:identificacion',
  verificarTokenInterno,
  haciendaRateLimiter,
  asyncHandler(consultarIdentificacion)
);

router.get('/matriculas', verificarTokenInterno, asyncHandler(getMatriculas));

router.get(
  '/matriculas/estudiante/:idEstudiante',
  verificarTokenInterno,
  asyncHandler(getMatriculasPorEstudiante)
);

router.get(
  '/matriculas/buscar-estudiante/:cedula',
  verificarTokenInterno,
  asyncHandler(buscarEstudiantePorCedula)
);

router.get(
  '/matriculas/cursos-lectivos',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getCursosLectivos)
);

router.post(
  '/matriculas/precarga-masiva',
  verificarTokenInterno,
  verificarAdminMatricula,
  operacionPesadaRateLimiter,
  (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Error al subir el archivo' });
      }
      next();
    });
  },
  asyncHandler(postPrecargaMasiva)
);

router.get(
  '/matriculas/buscar-tutor-matricula/:cedula',
  verificarTokenInterno,
  verificarAdminMatricula,
  haciendaRateLimiter,
  asyncHandler(buscarTutorParaMatriculaRegular)
);

router.post(
  '/matriculas/nuevo-ingreso',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(crearMatriculaNuevoIngreso)
);

router.post(
  '/matriculas/regular',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(crearMatriculaRegular)
);

router.post(
  '/matriculas/traslado',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(crearMatriculaTraslado)
);

router.get(
  '/matriculas/comprobante/:id',
  verificarTokenInterno,
  asyncHandler(getComprobanteMatriculaPdf)
);

router.patch(
  '/matriculas/:id/estado',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(patchMatriculaEstado)
);

router.get('/matriculas/:id', verificarTokenInterno, asyncHandler(getMatriculaById));

export default router;
