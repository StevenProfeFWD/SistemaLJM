import express from 'express';
import { verificarTokenInterno } from '../middlewares/verificarToken.js';
import { verificarAdminMatricula } from '../middlewares/verificarRoles.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getMaterias,
  postMateria,
  putMateria,
  deleteMateria
} from '../controllers/materiaController.js';

const router = express.Router();

const admin = [verificarTokenInterno, verificarAdminMatricula];

router.get('/materias', ...admin, asyncHandler(getMaterias));
router.post('/materias', ...admin, asyncHandler(postMateria));
router.put('/materias/:id', ...admin, asyncHandler(putMateria));
router.delete('/materias/:id', ...admin, asyncHandler(deleteMateria));

export default router;
