import { tieneOp, argsDe } from './dbMock.js';

/**
 * Crea un resolver para el doble de BD que responde a las 5 consultas de
 * obtenerReporteAsistenciaEpi y a las 2 de listarEstudiantesSeccionEpi.
 */
export function resolverEpi({
  agregadas = [],
  secciones = [],
  materias = [],
  detalle = [],
  persona = undefined,
  matriculados = [],
  conAsistencia = [],
} = {}) {
  return (reg) => {
    if (reg.tabla === 'asistencia as a') {
      if (tieneOp(reg, 'groupBy')) return agregadas;
      if (tieneOp(reg, 'distinct')) return conAsistencia;
      return detalle; // consultaDetalle (select + orderBy)
    }
    if (reg.tabla === 'seccion') return secciones;
    if (reg.tabla === 'materia') return materias;
    if (reg.tabla === 'persona') return persona;
    if (reg.tabla === 'matricula as m') return matriculados;
    throw new Error(`Consulta inesperada a ${reg.tabla}`);
  };
}

export const fila = (id_seccion, nombre_seccion, id_materia, nombre_materia, estado, cantidad) => ({
  id_seccion,
  nombre_seccion,
  id_materia,
  nombre_materia,
  estado,
  cantidad,
});

export const filaDet = (fecha, id_seccion, nombre_seccion, nombre_materia, id_estudiante, nombre_completo, estado, cedula = `1-${id_estudiante}`) => ({
  fecha,
  estado,
  id_seccion,
  nombre_seccion,
  nombre_materia,
  id_estudiante,
  nombre_completo,
  cedula,
});

export { tieneOp, argsDe };
