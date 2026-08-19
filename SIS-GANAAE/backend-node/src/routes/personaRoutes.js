import express from 'express';
import { verificarTokenInterno, verificarTokenCambioContrasena } from "../middlewares/verificarToken.js";
import { verificarAdminMatricula, verificarConsultaCatalogoPersonas } from '../middlewares/verificarRoles.js';
import { loginRateLimiter, haciendaRateLimiter } from '../middlewares/rateLimitAuth.js';
import { assertPuedeEditarEstudiante } from '../middlewares/autorizacionRecurso.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  getPersonas,
  postPersona,
  loginPersona,
  logoutPersona,
  patchPersonaPassword,
  getSesion,
  getMisEstudiantes,
  getEstudiantes,
  getEstudianteDetalle,
  actualizarEstudiante,
  archivarEstudiante,
  getMateriasHabilitadasProfesor,
  putMateriasHabilitadasProfesor
} from '../controllers/personaController.js';
import { getBuscarEncargadosEstudiante, patchReactivarEstudiante } from '../controllers/estudianteController.js';
import { getConsultarCedula } from '../controllers/encargadoController.js';


const router = express.Router();


router.get(
  '/personas',
  verificarTokenInterno,
  verificarConsultaCatalogoPersonas,
  asyncHandler(getPersonas)
);

router.get(
  '/personas/consultar-cedula/:cedula',
  verificarTokenInterno,
  haciendaRateLimiter,
  asyncHandler(getConsultarCedula)
);

// Gestión de estudiantes (con tutor y sección actual)
router.get(
  '/estudiantes/encargados/buscar',
  verificarTokenInterno,
  asyncHandler(getBuscarEncargadosEstudiante)
);

router.get('/estudiantes', verificarTokenInterno, asyncHandler(getEstudiantes));

router.get('/estudiantes/:id', verificarTokenInterno, asyncHandler(getEstudianteDetalle));

router.patch('/estudiantes/:id', verificarTokenInterno, assertPuedeEditarEstudiante, asyncHandler(actualizarEstudiante));
router.put('/estudiantes/:id', verificarTokenInterno, assertPuedeEditarEstudiante, asyncHandler(actualizarEstudiante));

router.patch('/estudiantes/:id/archivar', verificarTokenInterno, assertPuedeEditarEstudiante, asyncHandler(archivarEstudiante));

router.patch(
  '/estudiantes/:id/reactivar',
  verificarTokenInterno,
  assertPuedeEditarEstudiante,
  asyncHandler(patchReactivarEstudiante)
);

router.post('/personas', verificarTokenInterno, verificarAdminMatricula, asyncHandler(postPersona));

router.post('/personas/login', loginRateLimiter, asyncHandler(loginPersona));

router.post('/personas/logout', logoutPersona);

router.patch('/personas/:id', verificarTokenCambioContrasena, asyncHandler(patchPersonaPassword));

router.get('/protegido', verificarTokenInterno, (req, res) => {
  const usuario = req.user;
  res.json({ dato: 'protegido', username: `Hola ${usuario.correo}` });
});

// Sesión actual (para que el frontend sepa rol y nombre)
router.get('/personas/sesion', verificarTokenInterno, asyncHandler(getSesion));

// Materias habilitadas por docente (solo administrador; alinea regla 1 + mantenimiento)
router.get(
  '/personas/:id/materias-habilitadas',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(getMateriasHabilitadasProfesor)
);
router.put(
  '/personas/:id/materias-habilitadas',
  verificarTokenInterno,
  verificarAdminMatricula,
  asyncHandler(putMateriasHabilitadasProfesor)
);

// Tutores: listar estudiantes a su cargo
router.get('/personas/mis-estudiantes', verificarTokenInterno, asyncHandler(getMisEstudiantes));

// FUNCIÓN A IMPLEMENTAR
/* import { verificarTokenInterno } from "../middlewares/verificarTokenInterno.js";

const router = express.Router();

router.get("/compras", verificarTokenInterno, (req, res) => {
  res.json({ mensaje: "Compras del usuario", data: [] });
}); */

export default router;

