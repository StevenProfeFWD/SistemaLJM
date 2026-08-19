import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarAdminMatricula, verificarProfesorOAdmin } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getPersonal,
  putPersonal,
  patchEstadoPersonal,
  postSustitucionPersonal,
  getCandidatosSustituto,
  getSustituciones,
  getSustitucionesPdf,
  patchCancelarSustitucion,
  getMiSustitucionVigente,
} from '../controllers/personalController.js';

const router = express.Router();

router.get(
  '/admin/personal',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getPersonal)
);

router.put(
  '/admin/personal/:id',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(putPersonal)
);

router.patch(
  '/admin/personal/:id/estado',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(patchEstadoPersonal)
);

router.post(
  '/admin/personal/sustitucion',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(postSustitucionPersonal)
);

router.get(
  '/admin/personal/sustituciones/pdf',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getSustitucionesPdf)
);

router.get(
  '/admin/personal/sustituciones',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getSustituciones)
);

router.get(
  '/admin/personal/:id/candidatos-sustituto',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getCandidatosSustituto)
);

router.patch(
  '/personal/sustitucion/:id/cancelar',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(patchCancelarSustitucion)
);

router.get(
  '/personal/mi-sustitucion-vigente',
  verificarTokenInterno,
  verificarProfesorOAdmin,
  asyncHandler(getMiSustitucionVigente)
);

export default router;
