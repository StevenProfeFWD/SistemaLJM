export const ROL_SUPER_ADMIN = 'super_administrador';
export const ROL_ADMIN = 'administrador';
export const ROL_ORIENTADOR = 'orientador';
export const ROL_PROFESOR = 'profesor';
export const ROL_EPI = 'epi';

export function esSuperAdministrador(rol) {
  return rol === ROL_SUPER_ADMIN;
}

export function esAdministradorPlataforma(rol) {
  return rol === ROL_ADMIN || rol === ROL_SUPER_ADMIN;
}

/** Administrador operativo del liceo (matrícula, asignaciones, etc.). */
export function esAdministradorOperativo(rol) {
  return rol === ROL_ADMIN;
}

export function puedeConsultarEstudiantes(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_PROFESOR;
}

/** Listado del catálogo GET /estudiantes (admin/orientador global; profesor con scope). */
export function puedeListarCatalogoEstudiantes(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_ORIENTADOR || rol === ROL_PROFESOR;
}

export function tieneListadoGlobalEstudiantes(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_ORIENTADOR;
}

export function puedeVerReportesEstrategicos(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_ORIENTADOR;
}

export function puedeLeerOrientacion(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_ORIENTADOR;
}

/** Historial global de justificaciones (profesor con alcance acotado a sus secciones). */
export function puedeListarJustificacionesGlobales(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_ORIENTADOR || rol === ROL_PROFESOR;
}

/** Acceso sin restricción de sección al historial de justificaciones. */
export function tieneAlcanceGlobalJustificaciones(rol) {
  return esAdministradorPlataforma(rol) || rol === ROL_ORIENTADOR;
}

/** Reportes de asistencia del Equipo de Permanencia Estudiantil (EPI). */
export function puedeVerReportesEpi(rol) {
  return rol === ROL_EPI || esAdministradorPlataforma(rol);
}

/**
 * Roles cuya contraseña puede restablecer cada rol administrativo.
 * - Super administrador: solo administradores.
 * - Administrador: profesores, orientadores, EPI y encargados (no otros administradores).
 */
const ROLES_RESTABLECIBLES = {
  [ROL_SUPER_ADMIN]: [ROL_ADMIN],
  [ROL_ADMIN]: [ROL_PROFESOR, ROL_ORIENTADOR, ROL_EPI, 'padre_de_familia'],
};

export function rolesRestableciblesPor(rol) {
  return Object.hasOwn(ROLES_RESTABLECIBLES, rol) ? [...ROLES_RESTABLECIBLES[rol]] : [];
}

export function puedeRestablecerContrasenas(rol) {
  return rolesRestableciblesPor(rol).length > 0;
}

const ETIQUETAS_ROL = {
  [ROL_SUPER_ADMIN]: 'Super administrador',
  [ROL_ADMIN]: 'Administrador',
  [ROL_ORIENTADOR]: 'Orientador',
  [ROL_PROFESOR]: 'Profesor',
  [ROL_EPI]: 'Equipo de Permanencia Estudiantil',
  padre_de_familia: 'Encargado',
};

/** Etiqueta legible del rol de una persona (p. ej. "registrado por"). */
export function etiquetaRolPersona(rol) {
  if (!rol) return '';
  // hasOwn evita devolver propiedades heredadas de Object.prototype ('toString', 'constructor').
  if (Object.hasOwn(ETIQUETAS_ROL, rol)) return ETIQUETAS_ROL[rol];
  return String(rol).replace(/_/g, ' ');
}
