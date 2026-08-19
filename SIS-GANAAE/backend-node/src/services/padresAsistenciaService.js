import db from '../db/knex.js';
import { tutorTieneVisibilidadSobreEstudiante } from '../utils/tutorVisibilidad.js';
import { etiquetaEstadoOficial, calcularResumenAsistencia } from '../utils/estadoAsistencia.js';
import { fechaToIsoDiaSemana, formatHoraCorta, DIA_SEMANA_LABEL } from '../utils/leccionHelper.js';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRangoFechas(fechaInicio, fechaFin) {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();

  const inicioDefault = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  const finDefault = `${y}-${String(m + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  const inicio = fechaInicio && FECHA_RE.test(String(fechaInicio).trim())
    ? String(fechaInicio).trim()
    : inicioDefault;
  const fin = fechaFin && FECHA_RE.test(String(fechaFin).trim())
    ? String(fechaFin).trim()
    : finDefault;

  if (inicio > fin) {
    const err = new Error('fecha_inicio no puede ser posterior a fecha_fin');
    err.status = 400;
    throw err;
  }

  return { fecha_inicio: inicio, fecha_fin: fin };
}

export async function assertPadrePuedeVerEstudiante(padreId, idEstudiante) {
  const id = parseInt(idEstudiante, 10);
  if (!Number.isInteger(id) || id < 1) {
    const err = new Error('id_estudiante inválido');
    err.status = 400;
    throw err;
  }

  const autorizado = await tutorTieneVisibilidadSobreEstudiante(padreId, id);
  if (!autorizado) {
    const err = new Error('No tiene permiso para consultar la asistencia de este estudiante');
    err.status = 403;
    throw err;
  }

  return id;
}

function fechaToIsoString(fecha) {
  if (!fecha) return null;
  if (typeof fecha === 'string') return fecha.slice(0, 10);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function horarioTextoParaAsignacionYDia(idPms, fechaStr) {
  const dia = fechaToIsoDiaSemana(fechaStr);
  if (!dia) return '—';

  const bloques = await db('horarioasignacion as ha')
    .join('leccion as l', 'ha.id_leccion', 'l.id_leccion')
    .where('ha.id_profesor_materia_seccion', idPms)
    .where('ha.dia_semana', dia)
    .orderBy('ha.id_leccion')
    .select('l.id_leccion', 'l.hora_inicio', 'l.hora_fin');

  if (bloques.length === 0) {
    return `${DIA_SEMANA_LABEL[dia] || `Día ${dia}`} — sin bloque programado`;
  }

  return bloques
    .map((b) => {
      const ini = formatHoraCorta(b.hora_inicio);
      const fin = formatHoraCorta(b.hora_fin);
      return `Lección ${b.id_leccion} (${ini} - ${fin})`;
    })
    .join(', ');
}

export async function obtenerDatosEstudianteParaReporte(idEstudiante) {
  const estudiante = await db('persona as p')
    .where('p.id_persona', idEstudiante)
    .select('p.id_persona', 'p.nombre_completo', 'p.cedula')
    .first();

  if (!estudiante) {
    const err = new Error('Estudiante no encontrado');
    err.status = 404;
    throw err;
  }

  const anio = new Date().getFullYear();
  const matricula = await db('matricula as m')
    .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('m.id_persona_estudiante', idEstudiante)
    .where('cl.anio_curso_lectivo', anio)
    .orderBy('m.fecha_matricula', 'desc')
    .select('s.nombre_seccion', 'm.ano_a_cursar', 'cl.anio_curso_lectivo')
    .first();

  return {
    ...estudiante,
    nombre_seccion: matricula?.nombre_seccion || 'Sin sección',
    ano_a_cursar: matricula?.ano_a_cursar || '—',
    anio_curso_lectivo: matricula?.anio_curso_lectivo || anio,
  };
}

export async function consultarHistorialAsistenciaHijo(idEstudiante, fechaInicio, fechaFin) {
  const rango = parseRangoFechas(fechaInicio, fechaFin);

  const filas = await db('asistencia as a')
    .join('profesor_materia_seccion as pms', 'a.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .join('materia as mat', 'pms.id_materia', 'mat.id_materia')
    .join('seccion as sec', 'pms.id_seccion', 'sec.id_seccion')
    .where('a.id_persona_estudiante', idEstudiante)
    .whereBetween('a.fecha', [rango.fecha_inicio, rango.fecha_fin])
    .orderBy('a.fecha', 'desc')
    .orderBy('mat.nombre_materia', 'asc')
    .select(
      'a.id_asistencia',
      'a.fecha',
      'a.estado',
      'a.observacion',
      'a.fecha_hora',
      'pms.id_profesor_materia_seccion',
      'mat.nombre_materia',
      'sec.nombre_seccion'
    );

  const registros = await Promise.all(
    filas.map(async (f) => {
      const fechaStr = fechaToIsoString(f.fecha);
      const horario = await horarioTextoParaAsignacionYDia(
        f.id_profesor_materia_seccion,
        fechaStr
      );
      return {
        id_asistencia: f.id_asistencia,
        fecha: fechaStr,
        estado: f.estado,
        condicion: etiquetaEstadoOficial(f.estado),
        observacion: f.observacion,
        nombre_materia: f.nombre_materia,
        nombre_seccion: f.nombre_seccion,
        horario_leccion: horario,
        fecha_hora: f.fecha_hora,
      };
    })
  );

  const estudiante = await obtenerDatosEstudianteParaReporte(idEstudiante);
  const resumen = calcularResumenAsistencia(registros);

  return {
    estudiante,
    rango,
    registros,
    resumen,
  };
}

export async function obtenerReporteAsistenciaPadre(padreId, idEstudiante, fechaInicio, fechaFin) {
  const id = await assertPadrePuedeVerEstudiante(padreId, idEstudiante);
  const datos = await consultarHistorialAsistenciaHijo(id, fechaInicio, fechaFin);

  const tutor = await db('persona')
    .where('id_persona', padreId)
    .select('nombre_completo')
    .first();

  return {
    ...datos,
    tutor_nombre: tutor?.nombre_completo || 'Encargado',
  };
}
