import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import { TIPO_ESTADO_LABEL } from './orientacionService.js';

/**
 * Historial auditado de notificaciones enviadas a encargados.
 * La tabla `notificacion` no guarda asunto ni mensaje de error dedicados:
 * el asunto/tipo se reconstruyen por joins y el error vive en `observacion`.
 */

export const ESTADOS_ENVIO_FILTRABLES = ['enviado', 'fallido'];

const LIMIT_DEFAULT = 15;
const LIMIT_MAX = 100;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function enteroPositivo(valor) {
  const n = parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizarFecha(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  const texto = String(valor).slice(0, 10);
  if (!FECHA_RE.test(texto)) {
    throw new AppError(`${campo} debe tener el formato YYYY-MM-DD`, 400);
  }
  return texto;
}

function normalizarFiltros(query = {}) {
  const fechaInicio = normalizarFecha(query.fecha_inicio, 'fecha_inicio');
  const fechaFin = normalizarFecha(query.fecha_fin, 'fecha_fin');
  if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
    throw new AppError('La fecha de inicio no puede ser posterior a la fecha final', 400);
  }

  let idProfesor = null;
  if (query.id_profesor !== undefined && query.id_profesor !== '') {
    idProfesor = enteroPositivo(query.id_profesor);
    if (!idProfesor) throw new AppError('id_profesor inválido', 400);
  }

  let idEstudiante = null;
  if (query.id_estudiante !== undefined && query.id_estudiante !== '') {
    idEstudiante = enteroPositivo(query.id_estudiante);
    if (!idEstudiante) throw new AppError('id_estudiante inválido', 400);
  }

  let estadoEnvio = null;
  if (query.estado_envio !== undefined && query.estado_envio !== '') {
    estadoEnvio = String(query.estado_envio).trim().toLowerCase();
    if (!ESTADOS_ENVIO_FILTRABLES.includes(estadoEnvio)) {
      throw new AppError('estado_envio inválido (enviado | fallido)', 400);
    }
  }

  const busqueda = query.busqueda ? String(query.busqueda).trim().slice(0, 100) : null;
  const page = enteroPositivo(query.page) || 1;
  const limit = Math.min(enteroPositivo(query.limit) || LIMIT_DEFAULT, LIMIT_MAX);

  return {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    id_profesor: idProfesor,
    id_estudiante: idEstudiante,
    estado_envio: estadoEnvio,
    busqueda: busqueda || null,
    page,
    limit,
  };
}

/** Joins comunes: encargado/estudiante, asistencia → clase → sección/profesor, estado de orientación. */
function consultaBase() {
  return db('notificacion as n')
    .join('encargado_estudiante as ee', 'n.id_encargado_estudiante', 'ee.id_encargado_estudiante')
    .join('persona as est', 'ee.id_persona_estudiante', 'est.id_persona')
    .leftJoin('persona as enc', 'ee.id_persona_encargado', 'enc.id_persona')
    .leftJoin('asistencia as a', 'n.id_asistencia', 'a.id_asistencia')
    .leftJoin(
      'profesor_materia_seccion as pms',
      'a.id_profesor_materia_seccion',
      'pms.id_profesor_materia_seccion'
    )
    .leftJoin('seccion as s', 'pms.id_seccion', 's.id_seccion')
    .leftJoin('persona as prof', 'pms.id_persona_profesor', 'prof.id_persona')
    .leftJoin('estado_estudiante_periodo as eep', 'n.id_estado_periodo', 'eep.id_estado_periodo');
}

function aplicarFiltros(q, f) {
  if (f.fecha_inicio) q.where('n.fecha_envio', '>=', f.fecha_inicio);
  if (f.fecha_fin) q.whereRaw("n.fecha_envio < (?::date + INTERVAL '1 day')", [f.fecha_fin]);
  if (f.id_profesor) q.where('pms.id_persona_profesor', f.id_profesor);
  if (f.id_estudiante) q.where('ee.id_persona_estudiante', f.id_estudiante);
  if (f.estado_envio) q.where('n.estado_envio', f.estado_envio);
  if (f.busqueda) {
    const patron = `%${f.busqueda.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    q.where(function porNombreOCedula() {
      this.whereILike('est.nombre_completo', patron).orWhereILike('est.cedula', patron);
    });
  }
  return q;
}

const COLUMNAS = [
  'n.id_notificacion',
  'n.fecha_envio',
  'n.estado_envio',
  'n.observacion',
  'n.medio_comunicacion',
  'n.id_asistencia',
  'n.id_estado_periodo',
  'est.id_persona as id_estudiante',
  'est.cedula as estudiante_cedula',
  'est.nombre_completo as estudiante_nombre',
  'enc.correo as destinatario_email',
  's.nombre_seccion',
  'prof.id_persona as id_profesor',
  'prof.nombre_completo as profesor_nombre',
  'eep.tipo_estado',
];

/** Reconstruye tipo de evento y asunto a partir del origen de la fila. */
function describirEvento(row) {
  const nombre = row.estudiante_nombre || 'Estudiante';

  if (row.id_asistencia != null) {
    return {
      tipo_evento: 'Ausencia Injustificada',
      asunto: `Control de Asistencia: Reporte de ausencia injustificada de ${nombre}`,
    };
  }

  if (row.id_estado_periodo != null) {
    if (row.tipo_estado === 'expulsion') {
      return {
        tipo_evento: 'Expulsión',
        asunto: `Orientación: Expulsión definitiva de ${nombre}`,
      };
    }
    const tipoLabel = TIPO_ESTADO_LABEL[row.tipo_estado] || row.tipo_estado || 'Estado especial';
    return {
      tipo_evento: tipoLabel,
      asunto: `Orientación: ${tipoLabel} registrado para ${nombre}`,
    };
  }

  return {
    tipo_evento: 'Notificación del sistema',
    asunto: row.observacion || 'Notificación del sistema',
  };
}

function mapearFila(row) {
  const { tipo_evento, asunto } = describirEvento(row);
  return {
    id_notificacion: row.id_notificacion,
    fecha_envio: row.fecha_envio,
    destinatario_email: row.destinatario_email || null,
    asunto,
    estado_envio: row.estado_envio,
    mensaje_error: row.estado_envio === 'fallido' ? row.observacion || 'Error de envío' : null,
    estudiante: {
      cedula: row.estudiante_cedula,
      nombre_completo: row.estudiante_nombre,
      seccion: row.nombre_seccion || 'Sin sección',
    },
    profesor_emisor: row.id_profesor
      ? { nombre_completo: row.profesor_nombre }
      : null,
    tipo_evento,
  };
}

/** Docentes que tienen al menos una notificación de asistencia asociada (select del filtro). */
async function catalogoProfesores() {
  return db('notificacion as n')
    .join('asistencia as a', 'n.id_asistencia', 'a.id_asistencia')
    .join(
      'profesor_materia_seccion as pms',
      'a.id_profesor_materia_seccion',
      'pms.id_profesor_materia_seccion'
    )
    .join('persona as prof', 'pms.id_persona_profesor', 'prof.id_persona')
    .distinct('prof.id_persona', 'prof.nombre_completo')
    .orderBy('prof.nombre_completo');
}

export async function listarNotificaciones(query = {}) {
  const filtros = normalizarFiltros(query);
  const { page, limit } = filtros;

  const [[{ total }], filas, profesores] = await Promise.all([
    aplicarFiltros(consultaBase(), filtros).count({ total: 'n.id_notificacion' }),
    aplicarFiltros(consultaBase(), filtros)
      .select(COLUMNAS)
      .orderBy([
        { column: 'n.fecha_envio', order: 'desc' },
        { column: 'n.id_notificacion', order: 'desc' },
      ])
      .limit(limit)
      .offset((page - 1) * limit),
    catalogoProfesores(),
  ]);

  const totalRegistros = parseInt(total, 10) || 0;

  return {
    pagination: {
      total_registros: totalRegistros,
      pagina_actual: page,
      total_paginas: Math.ceil(totalRegistros / limit),
      limit,
    },
    data: filas.map(mapearFila),
    catalogos: { profesores },
    filtros,
  };
}
