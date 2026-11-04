import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import {
  ROL_PROFESOR,
  etiquetaRolPersona,
  puedeListarJustificacionesGlobales,
  tieneAlcanceGlobalJustificaciones,
} from '../utils/roles.js';
import { obtenerIdsSeccionesVisiblesParaProfesor } from '../utils/profesorGuiaVisibilidad.js';
import { profesorPuedeAccederAsignacion } from '../utils/sustitucionHelper.js';

export const TIPOS_JUSTIFICACION = ['medica', 'personal', 'institucional'];

const TIPO_LABEL = {
  medica: 'Médica',
  personal: 'Personal',
  institucional: 'Institucional',
};

/** Estados de asistencia que admiten justificación. */
const ESTADOS_JUSTIFICABLES = ['ausente', 'tardanza', 'justificado'];

const LIMIT_MAX = 100;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function fechaIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(valor).slice(0, 10);
}

function hoyIso() {
  return fechaIso(new Date());
}

function enteroPositivo(valor) {
  const n = parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Consulta base con todos los joins necesarios para listado y detalle. */
function consultaBase() {
  return db('justificacion as j')
    .join('asistencia as a', 'j.id_asistencia', 'a.id_asistencia')
    .join('profesor_materia_seccion as pms', 'a.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .join('seccion as s', 'pms.id_seccion', 's.id_seccion')
    .leftJoin('materia as mat', 'pms.id_materia', 'mat.id_materia')
    .join('persona as est', 'a.id_persona_estudiante', 'est.id_persona')
    .leftJoin('persona as reg', 'j.created_by', 'reg.id_persona');
}

const COLUMNAS = [
  'j.id_justificacion',
  'j.tipo_justificacion',
  'j.descripcion',
  'j.fecha_ingreso',
  'j.documento_adjunto',
  'j.created_at',
  'j.created_by',
  'j.id_asistencia',
  'a.fecha as fecha_ausencia',
  'a.estado as estado_asistencia',
  's.id_seccion',
  's.nombre_seccion',
  'mat.nombre_materia',
  'est.id_persona as id_estudiante',
  'est.nombre_completo as nombre_estudiante',
  'est.cedula as cedula_estudiante',
  'reg.nombre_completo as registrado_por_nombre',
  'reg.nombre_rol as registrado_por_rol',
];

function mapearRegistro(r) {
  return {
    id_justificacion: r.id_justificacion,
    id_asistencia: r.id_asistencia,
    tipo_justificacion: r.tipo_justificacion,
    tipo_justificacion_label: TIPO_LABEL[r.tipo_justificacion] || r.tipo_justificacion,
    descripcion: r.descripcion,
    motivo: r.descripcion,
    fecha_ingreso: fechaIso(r.fecha_ingreso),
    fecha_ausencia: fechaIso(r.fecha_ausencia),
    documento_adjunto: r.documento_adjunto || null,
    created_at: r.created_at,
    estado_asistencia: r.estado_asistencia,
    id_seccion: r.id_seccion,
    nombre_seccion: r.nombre_seccion,
    nombre_materia: r.nombre_materia || null,
    estudiante: {
      id_persona: r.id_estudiante,
      nombre_completo: r.nombre_estudiante,
      cedula: r.cedula_estudiante,
    },
    registrado_por: r.created_by
      ? {
          id_persona: r.created_by,
          nombre_completo: r.registrado_por_nombre,
          rol: r.registrado_por_rol,
          rol_label: etiquetaRolPersona(r.registrado_por_rol),
        }
      : null,
  };
}

/**
 * Alcance por rol. Devuelve null cuando el rol ve todo; un arreglo de id_seccion
 * cuando el usuario es profesor (carga académica o grupo guía).
 */
async function resolverAlcanceSecciones(user) {
  if (!user || !puedeListarJustificacionesGlobales(user.rol)) {
    throw new AppError('No tiene permiso para consultar justificaciones', 403);
  }
  if (tieneAlcanceGlobalJustificaciones(user.rol)) return null;
  if (user.rol === ROL_PROFESOR) {
    return obtenerIdsSeccionesVisiblesParaProfesor(user.id);
  }
  throw new AppError('No tiene permiso para consultar justificaciones', 403);
}

async function catalogoSecciones(seccionesPermitidas) {
  const q = db('seccion').select('id_seccion', 'nombre_seccion').orderBy('nombre_seccion');
  if (seccionesPermitidas) {
    if (seccionesPermitidas.length === 0) return [];
    q.whereIn('id_seccion', seccionesPermitidas);
  }
  return q;
}

/**
 * Historial global de justificaciones con filtros y paginación.
 * La restricción por rol se aplica en la consulta SQL.
 */
export async function listarJustificaciones(user, filtros = {}) {
  const seccionesPermitidas = await resolverAlcanceSecciones(user);

  const page = enteroPositivo(filtros.page) || 1;
  const limit = Math.min(enteroPositivo(filtros.limit) || 15, LIMIT_MAX);

  const fechaInicio = filtros.fecha_inicio ? String(filtros.fecha_inicio).slice(0, 10) : null;
  const fechaFin = filtros.fecha_fin ? String(filtros.fecha_fin).slice(0, 10) : null;
  if ((fechaInicio && !FECHA_RE.test(fechaInicio)) || (fechaFin && !FECHA_RE.test(fechaFin))) {
    throw new AppError('Las fechas deben tener el formato YYYY-MM-DD', 400);
  }
  if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
    throw new AppError('La fecha de inicio no puede ser posterior a la fecha final', 400);
  }

  let idSeccion = null;
  if (filtros.id_seccion !== undefined && filtros.id_seccion !== '') {
    idSeccion = enteroPositivo(filtros.id_seccion);
    if (!idSeccion) throw new AppError('id_seccion inválido', 400);
    if (seccionesPermitidas && !seccionesPermitidas.includes(idSeccion)) {
      throw new AppError('No tiene acceso a las justificaciones de esta sección', 403);
    }
  }

  const tipo = filtros.tipo_justificacion ? String(filtros.tipo_justificacion).trim() : '';
  if (tipo && !TIPOS_JUSTIFICACION.includes(tipo)) {
    throw new AppError('tipo_justificacion inválido (medica | personal | institucional)', 400);
  }

  const busqueda = filtros.busqueda ? String(filtros.busqueda).trim().slice(0, 100) : '';

  const secciones = await catalogoSecciones(seccionesPermitidas);

  if (seccionesPermitidas && seccionesPermitidas.length === 0) {
    return {
      registros: [],
      total: 0,
      page,
      limit,
      total_pages: 0,
      catalogos: { secciones, tipos: TIPOS_JUSTIFICACION.map((t) => ({ value: t, label: TIPO_LABEL[t] })) },
    };
  }

  const filtrar = (q) => {
    if (seccionesPermitidas) q.whereIn('pms.id_seccion', seccionesPermitidas);
    if (idSeccion) q.where('pms.id_seccion', idSeccion);
    if (tipo) q.where('j.tipo_justificacion', tipo);
    if (fechaInicio) q.where('a.fecha', '>=', fechaInicio);
    if (fechaFin) q.where('a.fecha', '<=', fechaFin);
    if (busqueda) {
      const patron = `%${busqueda.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      q.where(function porNombreOCedula() {
        this.whereILike('est.nombre_completo', patron).orWhereILike('est.cedula', patron);
      });
    }
    return q;
  };

  const [{ total }] = await filtrar(consultaBase()).count({ total: 'j.id_justificacion' });
  const totalNum = parseInt(total, 10) || 0;

  const filas = await filtrar(consultaBase())
    .select(COLUMNAS)
    .orderBy([
      { column: 'a.fecha', order: 'desc' },
      { column: 'j.id_justificacion', order: 'desc' },
    ])
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    registros: filas.map(mapearRegistro),
    total: totalNum,
    page,
    limit,
    total_pages: Math.ceil(totalNum / limit),
    catalogos: {
      secciones,
      tipos: TIPOS_JUSTIFICACION.map((t) => ({ value: t, label: TIPO_LABEL[t] })),
    },
  };
}

/** Detalle de una justificación, respetando el alcance del rol. */
export async function obtenerJustificacionPorId(user, idJustificacion) {
  const id = enteroPositivo(idJustificacion);
  if (!id) throw new AppError('ID de justificación inválido', 400);

  const seccionesPermitidas = await resolverAlcanceSecciones(user);

  const fila = await consultaBase().select(COLUMNAS).where('j.id_justificacion', id).first();
  if (!fila) throw new AppError('Justificación no encontrada', 404);

  if (seccionesPermitidas && !seccionesPermitidas.includes(parseInt(fila.id_seccion, 10))) {
    throw new AppError('No tiene acceso a esta justificación', 403);
  }

  return mapearRegistro(fila);
}

/** Valida que el usuario pueda operar sobre el registro de asistencia indicado. */
async function obtenerAsistenciaAutorizada(user, idAsistencia) {
  const id = enteroPositivo(idAsistencia);
  if (!id) throw new AppError('id_asistencia inválido', 400);

  const asistencia = await db('asistencia').where('id_asistencia', id).first();
  if (!asistencia) throw new AppError('Registro de asistencia no encontrado', 404);

  if (user.rol === ROL_PROFESOR) {
    const puede = await profesorPuedeAccederAsignacion(
      user.id,
      asistencia.id_profesor_materia_seccion,
      fechaIso(asistencia.fecha)
    );
    if (!puede) throw new AppError('No tiene acceso a este registro de asistencia', 403);
  } else if (!tieneAlcanceGlobalJustificaciones(user.rol)) {
    throw new AppError('No tiene permiso para gestionar justificaciones', 403);
  }

  return asistencia;
}

/** Justificación asociada a un registro de asistencia (null si no existe). */
export async function obtenerJustificacionPorAsistencia(user, idAsistencia) {
  const asistencia = await obtenerAsistenciaAutorizada(user, idAsistencia);
  const fila = await consultaBase()
    .select(COLUMNAS)
    .where('j.id_asistencia', asistencia.id_asistencia)
    .first();
  return fila ? mapearRegistro(fila) : null;
}

function validarDocumentoAdjunto(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  if (texto.length > 500) {
    throw new AppError('El enlace del documento adjunto no puede superar 500 caracteres', 400);
  }
  if (!/^https?:\/\//i.test(texto) && !texto.startsWith('/uploads/')) {
    throw new AppError('El documento adjunto debe ser un enlace http(s) válido', 400);
  }
  return texto;
}

/**
 * Registra la justificación de una ausencia/tardanza. Marca la asistencia como
 * "justificado" y guarda la auditoría de quién la registró (created_by).
 */
export async function crearJustificacion(user, body = {}) {
  const asistencia = await obtenerAsistenciaAutorizada(user, body.id_asistencia);

  if (!ESTADOS_JUSTIFICABLES.includes(asistencia.estado)) {
    throw new AppError('Solo se pueden justificar ausencias o tardanzas', 400);
  }

  const tipo = String(body.tipo_justificacion || '').trim();
  if (!TIPOS_JUSTIFICACION.includes(tipo)) {
    throw new AppError('tipo_justificacion inválido (medica | personal | institucional)', 400);
  }

  const descripcion = String(body.descripcion ?? body.motivo ?? '').trim();
  if (descripcion.length < 5) {
    throw new AppError('El motivo de la justificación debe tener al menos 5 caracteres', 400);
  }
  if (descripcion.length > 2000) {
    throw new AppError('El motivo no puede superar 2000 caracteres', 400);
  }

  const documentoAdjunto = validarDocumentoAdjunto(body.documento_adjunto);
  const fechaIngreso = hoyIso();

  try {
    const idCreado = await db.transaction(async (trx) => {
      const [creado] = await trx('justificacion')
        .insert({
          id_asistencia: asistencia.id_asistencia,
          tipo_justificacion: tipo,
          descripcion,
          fecha_ingreso: fechaIngreso,
          documento_adjunto: documentoAdjunto,
          created_by: user.id,
          created_at: new Date(),
        })
        .returning('id_justificacion');

      await trx('asistencia')
        .where('id_asistencia', asistencia.id_asistencia)
        .update({ estado: 'justificado' });

      return creado.id_justificacion ?? creado;
    });

    const fila = await consultaBase().select(COLUMNAS).where('j.id_justificacion', idCreado).first();
    return mapearRegistro(fila);
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Este registro de asistencia ya tiene una justificación', 409);
    }
    throw error;
  }
}
