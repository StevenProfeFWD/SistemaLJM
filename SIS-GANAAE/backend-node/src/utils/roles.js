export const ROL_SUPER_ADMIN = 'super_administrador';
export const ROL_ADMIN = 'administrador';
export const ROL_ORIENTADOR = 'orientador';
export const ROL_PROFESOR = 'profesor';

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

const ETIQUETAS_ROL = {
  [ROL_SUPER_ADMIN]: 'Super administrador',
  [ROL_ADMIN]: 'Administrador',
  [ROL_ORIENTADOR]: 'Orientador',
  [ROL_PROFESOR]: 'Profesor',
  padre_de_familia: 'Encargado',
};

/** Etiqueta legible del rol de una persona (p. ej. "registrado por"). */
export function etiquetaRolPersona(rol) {
  if (!rol) return '';
  return ETIQUETAS_ROL[rol] || String(rol).replace(/_/g, ' ');
}
