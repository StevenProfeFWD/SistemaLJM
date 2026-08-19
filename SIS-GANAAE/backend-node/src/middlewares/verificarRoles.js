/**
 * Middlewares de autorización por rol (reutilizables en rutas).
 */
import {
  esAdministradorOperativo,
  esSuperAdministrador,
  puedeConsultarEstudiantes,
  puedeLeerOrientacion,
  puedeVerReportesEstrategicos,
} from '../utils/roles.js';

/** Lectura del catálogo global de personas (PII): roles administrativos superiores. */
export const verificarConsultaCatalogoPersonas = (req, res, next) => {
  const roles = ['super_administrador', 'administrador', 'orientador'];
  if (!roles.includes(req.user?.rol)) {
    return res.status(403).json({ error: 'Acceso restringido a personal administrativo autorizado' });
  }
  next();
};

/** Catálogos estructurales: personal académico y gestión (excluye padres). */
export const verificarPersonalAcademico = (req, res, next) => {
  const roles = ['super_administrador', 'administrador', 'orientador', 'profesor'];
  if (!roles.includes(req.user?.rol)) {
    return res.status(403).json({ error: 'Acceso restringido al personal académico autorizado' });
  }
  next();
};

export const verificarSuperAdministrador = (req, res, next) => {
  if (!esSuperAdministrador(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso exclusivo del Super Administrador' });
  }
  next();
};

export const verificarAdminMatricula = (req, res, next) => {
  if (!esAdministradorOperativo(req.user.rol)) {
    return res.status(403).json({ error: 'Solo los administradores pueden realizar esta acción' });
  }
  next();
};

export const verificarAdminAsignacion = (req, res, next) => {
  if (!esAdministradorOperativo(req.user.rol)) {
    return res.status(403).json({ error: 'Solo administradores pueden realizar esta acción' });
  }
  next();
};

export const verificarProfesorOAdmin = (req, res, next) => {
  if (!puedeConsultarEstudiantes(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
};

export const verificarConsultaEstudiantes = (req, res, next) => {
  if (!puedeConsultarEstudiantes(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
};

export const verificarPadreDeFamilia = (req, res, next) => {
  if (req.user.rol !== 'padre_de_familia') {
    return res.status(403).json({ error: 'Solo encargados pueden acceder a esta información' });
  }
  next();
};

/** Gestión operativa de orientación (registrar, editar, anular). */
export const verificarAdminOOrientador = (req, res, next) => {
  if (req.user.rol !== 'administrador' && req.user.rol !== 'orientador') {
    return res.status(403).json({ error: 'Acceso restringido a administradores y orientadores' });
  }
  next();
};

/** Lectura de historial y reportes de orientación (incluye super administrador). */
export const verificarLecturaOrientacion = (req, res, next) => {
  if (!puedeLeerOrientacion(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso restringido a consulta de orientación' });
  }
  next();
};

export const verificarAdminOReportes = (req, res, next) => {
  if (!puedeVerReportesEstrategicos(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso restringido a reportes estratégicos' });
  }
  next();
};

/** Comprobante PDF de orientación: lectura estratégica + encargado vinculado. */
export const verificarComprobanteOrientacionLectura = (req, res, next) => {
  const roles = ['administrador', 'orientador', 'padre_de_familia', 'super_administrador'];
  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No autorizado para descargar este comprobante' });
  }
  next();
};
