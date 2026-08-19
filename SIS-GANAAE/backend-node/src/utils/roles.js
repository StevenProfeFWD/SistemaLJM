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
