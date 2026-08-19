import AppError from '../utils/AppError.js';
import { tutorTieneVisibilidadSobreEstudiante } from '../utils/tutorVisibilidad.js';
import { profesorEsGuiaDeEstudiante } from '../utils/profesorGuiaVisibilidad.js';
import { obtenerRegistroHistorialPorId } from '../services/orientacionService.js';
import {
  esAdministradorOperativo,
  ROL_ORIENTADOR,
  ROL_PROFESOR,
} from '../utils/roles.js';

const ROLES_ACCESO_GLOBAL_ESTADO = new Set([
  'super_administrador',
  'administrador',
  ROL_ORIENTADOR,
]);

/**
 * Valida si el usuario puede acceder a datos de un estudiante en contexto
 * de estados de orientación / comprobantes PDF.
 */
export async function validarAccesoEstadoPeriodoPorEstudiante(usuario, idEstudiante) {
  const idEst = parseInt(idEstudiante, 10);
  if (!usuario?.id || !Number.isInteger(idEst)) {
    throw new AppError('No autorizado para consultar este registro', 403);
  }

  const rol = usuario.rol;

  if (ROLES_ACCESO_GLOBAL_ESTADO.has(rol)) {
    return;
  }

  if (rol === 'padre_de_familia') {
    const autorizado = await tutorTieneVisibilidadSobreEstudiante(usuario.id, idEst);
    if (!autorizado) {
      throw new AppError('No tiene permiso para consultar el expediente de este estudiante', 403);
    }
    return;
  }

  if (rol === ROL_PROFESOR) {
    const esGuia = await profesorEsGuiaDeEstudiante(usuario.id, idEst);
    if (!esGuia) {
      throw new AppError(
        'Solo el profesor guía de la sección del estudiante puede acceder a este comprobante',
        403
      );
    }
    return;
  }

  throw new AppError('No autorizado para consultar este comprobante', 403);
}

/**
 * Middleware: protege rutas con :id de estado_estudiante_periodo.
 * Adjunta req.estadoPeriodo con el registro cargado.
 */
export function assertPuedeVerEstadoPeriodo() {
  return async (req, res, next) => {
    try {
      const idEstado = parseInt(req.params.id, 10);
      if (!Number.isInteger(idEstado)) {
        throw new AppError('Identificador de estado inválido', 400);
      }

      const registro = await obtenerRegistroHistorialPorId(idEstado);
      await validarAccesoEstadoPeriodoPorEstudiante(req.user, registro.id_persona_estudiante);

      req.estadoPeriodo = registro;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      const status = error.status || 500;
      return res.status(status).json({ error: error.message || 'Error de autorización' });
    }
  };
}

/**
 * Valida edición de ficha de estudiante (PUT/PATCH /estudiantes/:id).
 * Solo el rol administrador del liceo puede modificar expedientes.
 */
export async function assertPuedeEditarEstudiante(req, res, next) {
  try {
    const idEstudiante = parseInt(req.params.id, 10);
    if (!Number.isInteger(idEstudiante)) {
      throw new AppError('Identificador de estudiante inválido', 400);
    }

    if (!esAdministradorOperativo(req.user?.rol)) {
      throw new AppError('Solo los administradores pueden modificar fichas de estudiantes', 403);
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Error de autorización' });
  }
}
