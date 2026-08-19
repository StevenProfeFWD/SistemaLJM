import db from '../db/knex.js';
import { fechaToStr } from '../utils/estadoEstudiantePeriodo.js';
import { TIPO_ESTADO_LABEL } from './orientacionService.js';
import { assertPadrePuedeVerEstudiante } from './padresAsistenciaService.js';

export async function listEstadosEspecialesHijo(padreId, idEstudiante) {
  const id = await assertPadrePuedeVerEstudiante(padreId, idEstudiante);

  const estudiante = await db('persona').where('id_persona', id).first();
  if (!estudiante) {
    const err = new Error('Estudiante no encontrado');
    err.status = 404;
    throw err;
  }

  const rows = await db('estado_estudiante_periodo')
    .where('id_persona_estudiante', id)
    .orderBy('fecha_inicio', 'desc');

  const registros = rows.map((row) => ({
    id_estado_periodo: row.id_estado_periodo,
    tipo_estado: row.tipo_estado,
    tipo_estado_label: TIPO_ESTADO_LABEL[row.tipo_estado] || row.tipo_estado,
    fecha_inicio: fechaToStr(row.fecha_inicio),
    fecha_fin: fechaToStr(row.fecha_fin),
    es_expulsion: row.tipo_estado === 'expulsion',
    motivo: row.motivo,
    created_at: row.created_at,
  }));

  return {
    estudiante: {
      id_persona: estudiante.id_persona,
      nombre_completo: estudiante.nombre_completo,
      cedula: estudiante.cedula,
    },
    total: registros.length,
    registros,
  };
}
