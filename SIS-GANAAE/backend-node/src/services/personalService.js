import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import { fechaHoyIso, fechaAIsoDia, fechaDiaAnterior } from '../utils/sustitucionHelper.js';
import { normalizarIdentificacion } from './haciendaService.js';
import { invalidateCursosLectivosCache } from './catalogCacheService.js';

async function obtenerCursoLectivoActual() {
  const anio = new Date().getFullYear();
  let curso = await db('curso_lectivo').where({ anio_curso_lectivo: anio }).first();
  if (!curso) {
    const [c] = await db('curso_lectivo')
      .insert({ anio_curso_lectivo: anio })
      .returning('id_curso_lectivo');
    curso = c;
    invalidateCursosLectivosCache();
  }
  return curso.id_curso_lectivo;
}

const ROLES_PERSONAL = ['profesor', 'orientador'];

export async function listarPersonal() {
  const hoy = fechaHoyIso();
  const cursoLectivo = await obtenerCursoLectivoActual();

  const personas = await db('persona')
    .whereIn('nombre_rol', ROLES_PERSONAL)
    .select(
      'id_persona',
      'nombre_completo',
      'cedula',
      'correo',
      'telefono',
      'direccion',
      'fecha_nacimiento',
      'nombre_rol',
      'activo'
    )
    .orderBy('nombre_completo', 'asc');

  const asignacionesPorProf = await db('profesor_materia_seccion')
    .where('curso_lectivo', cursoLectivo)
    .groupBy('id_persona_profesor')
    .select('id_persona_profesor')
    .count('* as total');

  const mapAsign = new Map(
    asignacionesPorProf.map((r) => [r.id_persona_profesor, parseInt(r.total, 10)])
  );

  const sustitucionesVigentes = await db('sustitucion as s')
    .join('profesor_materia_seccion as pms', 's.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .where('s.fecha_desde', '<=', hoy)
    .where('s.fecha_hasta', '>=', hoy)
    .select('s.id_persona_sustituto', 'pms.id_persona_profesor');

  const sustituyendo = new Map();
  const siendoSustituido = new Map();
  for (const row of sustitucionesVigentes) {
    sustituyendo.set(row.id_persona_sustituto, (sustituyendo.get(row.id_persona_sustituto) || 0) + 1);
    siendoSustituido.set(row.id_persona_profesor, (siendoSustituido.get(row.id_persona_profesor) || 0) + 1);
  }

  return personas.map((p) => ({
    ...p,
    fecha_nacimiento: p.fecha_nacimiento ? String(p.fecha_nacimiento).slice(0, 10) : '',
    rol_label: p.nombre_rol === 'profesor' ? 'Docente' : 'Orientador',
    total_asignaciones: p.nombre_rol === 'profesor' ? mapAsign.get(p.id_persona) || 0 : 0,
    sustituciones_activas_como_sustituto: sustituyendo.get(p.id_persona) || 0,
    sustituciones_activas_como_titular: siendoSustituido.get(p.id_persona) || 0,
  }));
}

export async function actualizarPersonal(id, body) {
  const idPersona = parseInt(id, 10);
  if (!Number.isInteger(idPersona)) {
    throw new AppError('Identificador inválido', 400);
  }

  const persona = await db('persona')
    .where('id_persona', idPersona)
    .whereIn('nombre_rol', ROLES_PERSONAL)
    .first();

  if (!persona) {
    throw new AppError('Personal no encontrado', 404);
  }

  const nombre_completo = body.nombre_completo != null
    ? String(body.nombre_completo).trim()
    : persona.nombre_completo;
  const cedula = body.cedula != null
    ? normalizarIdentificacion(body.cedula)
    : persona.cedula;
  const correo = body.correo != null ? String(body.correo).trim() : persona.correo;
  const telefono = body.telefono != null ? String(body.telefono).trim() : persona.telefono;
  const direccion = body.direccion != null ? String(body.direccion).trim() : persona.direccion;
  const fecha_nacimiento = body.fecha_nacimiento != null
    ? String(body.fecha_nacimiento).trim().slice(0, 10)
    : (persona.fecha_nacimiento ? String(persona.fecha_nacimiento).slice(0, 10) : '');

  if (!nombre_completo || !cedula || !correo || !telefono || !direccion || !fecha_nacimiento) {
    throw new AppError('Nombre, cédula, correo, teléfono, dirección y fecha de nacimiento son obligatorios', 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
    throw new AppError('fecha_nacimiento debe tener formato YYYY-MM-DD', 400);
  }

  const correoDuplicado = await db('persona')
    .where('correo', correo)
    .whereNot('id_persona', idPersona)
    .first();

  if (correoDuplicado) {
    throw new AppError('El correo ya está registrado para otra persona', 409);
  }

  const cedulaDuplicada = await db('persona')
    .where('cedula', cedula)
    .whereNot('id_persona', idPersona)
    .first();

  if (cedulaDuplicada) {
    throw new AppError('La cédula ya está registrada para otra persona', 409);
  }

  await db('persona')
    .where('id_persona', idPersona)
    .update({ nombre_completo, cedula, correo, telefono, direccion, fecha_nacimiento });

  return {
    message: 'Datos del personal actualizados correctamente.',
    persona: {
      id_persona: idPersona,
      nombre_completo,
      cedula,
      correo,
      telefono,
      direccion,
      fecha_nacimiento,
    },
  };
}

export async function cambiarEstadoPersonal(id, activo) {
  const idPersona = parseInt(id, 10);
  if (!Number.isInteger(idPersona)) {
    throw new AppError('Identificador inválido', 400);
  }

  const persona = await db('persona')
    .where('id_persona', idPersona)
    .whereIn('nombre_rol', ROLES_PERSONAL)
    .first();

  if (!persona) {
    throw new AppError('Personal no encontrado', 404);
  }

  const nuevoActivo = Boolean(activo);

  await db('persona')
    .where('id_persona', idPersona)
    .update({ activo: nuevoActivo });

  if (!nuevoActivo) {
    await db('usuariosistema')
      .where('persona_id', idPersona)
      .update({ activo: false });
  } else {
    await db('usuariosistema')
      .where('persona_id', idPersona)
      .update({ activo: true });
  }

  return {
    message: nuevoActivo
      ? 'Personal reactivado correctamente.'
      : 'Personal inactivado. No podrá iniciar sesión.',
    id_persona: idPersona,
    activo: nuevoActivo,
  };
}

export async function registrarSustitucion(body) {
  const idTitular = parseInt(body.id_profesor_titular, 10);
  const idSustituto = parseInt(body.id_profesor_sustituto, 10);
  const fechaInicio = String(body.fecha_inicio || body.fecha_desde || '').trim();
  const fechaFin = String(body.fecha_fin || body.fecha_hasta || '').trim();

  if (!Number.isInteger(idTitular) || !Number.isInteger(idSustituto)) {
    throw new AppError('id_profesor_titular e id_profesor_sustituto son obligatorios', 400);
  }

  if (idTitular === idSustituto) {
    throw new AppError('El sustituto debe ser un docente distinto al titular', 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
    throw new AppError('fecha_inicio y fecha_fin deben tener formato YYYY-MM-DD', 400);
  }

  if (fechaInicio > fechaFin) {
    throw new AppError('fecha_inicio no puede ser posterior a fecha_fin', 400);
  }

  const titular = await db('persona')
    .where({ id_persona: idTitular, nombre_rol: 'profesor', activo: true })
    .first();

  const sustituto = await db('persona')
    .where({ id_persona: idSustituto, nombre_rol: 'profesor', activo: true })
    .first();

  if (!titular) {
    throw new AppError('Profesor titular no encontrado o inactivo', 404);
  }

  if (!sustituto) {
    throw new AppError('Profesor sustituto no encontrado o inactivo', 404);
  }

  const cursoLectivo = await obtenerCursoLectivoActual();
  const asignaciones = await db('profesor_materia_seccion')
    .where({ id_persona_profesor: idTitular, curso_lectivo: cursoLectivo });

  if (asignaciones.length === 0) {
    throw new AppError('El titular no tiene asignaciones de materias en el año lectivo actual', 400);
  }

  const materiasTitular = [...new Set(asignaciones.map((a) => a.id_materia))];
  const habilitadasSustituto = await db('profesor_materia_habilitacion')
    .where('id_persona_profesor', idSustituto)
    .whereIn('id_materia', materiasTitular)
    .select('id_materia');

  const habSet = new Set(habilitadasSustituto.map((h) => h.id_materia));
  const faltantes = materiasTitular.filter((m) => !habSet.has(m));
  if (faltantes.length > 0) {
    const nombres = await db('materia').whereIn('id_materia', faltantes).select('nombre_materia');
    const lista = nombres.map((n) => n.nombre_materia).join(', ');
    throw new AppError(
      `El sustituto no está habilitado para impartir: ${lista}. Solo puede sustituir docentes de materias que tenga en su formación.`,
      400
    );
  }

  const trx = await db.transaction();
  try {
    const creadas = [];
    for (const pms of asignaciones) {
      const solapada = await trx('sustitucion')
        .where('id_profesor_materia_seccion', pms.id_profesor_materia_seccion)
        .where('fecha_desde', '<=', fechaFin)
        .where('fecha_hasta', '>=', fechaInicio)
        .first();

      if (solapada) {
        throw new AppError(
          'Ya existe una sustitución vigente que se solapa con el rango indicado para alguna asignación del titular',
          409
        );
      }

      const [row] = await trx('sustitucion')
        .insert({
          id_profesor_materia_seccion: pms.id_profesor_materia_seccion,
          id_persona_sustituto: idSustituto,
          fecha_desde: fechaInicio,
          fecha_hasta: fechaFin,
        })
        .returning('*');

      creadas.push(row);
    }

    await trx.commit();

    return {
      message: `Sustitución registrada: ${sustituto.nombre_completo} cubrirá las ${asignaciones.length} asignación(es) de ${titular.nombre_completo} del ${fechaInicio} al ${fechaFin}.`,
      total_asignaciones: asignaciones.length,
      sustituciones: creadas,
    };
  } catch (e) {
    await trx.rollback();
    throw e;
  }
}

function estadoSustitucion(fechaDesde, fechaHasta, hoy) {
  const desde = fechaAIsoDia(fechaDesde);
  const hasta = fechaAIsoDia(fechaHasta);
  if (hasta < desde) return 'finalizada';
  if (desde <= hoy && hasta >= hoy) return 'vigente';
  if (hasta < hoy) return 'finalizada';
  return 'programada';
}

export async function listarCandidatosSustituto(idTitularRaw) {
  const idTitular = parseInt(idTitularRaw, 10);
  if (!Number.isInteger(idTitular)) {
    throw new AppError('Identificador de titular inválido', 400);
  }

  const titular = await db('persona')
    .where({ id_persona: idTitular, nombre_rol: 'profesor' })
    .first();

  if (!titular) {
    throw new AppError('Profesor titular no encontrado', 404);
  }

  const cursoLectivo = await obtenerCursoLectivoActual();

  const materiasTitular = await db('profesor_materia_seccion as pms')
    .join('materia as m', 'pms.id_materia', 'm.id_materia')
    .where('pms.id_persona_profesor', idTitular)
    .where('pms.curso_lectivo', cursoLectivo)
    .groupBy('m.id_materia', 'm.nombre_materia')
    .select('m.id_materia', 'm.nombre_materia')
    .orderBy('m.nombre_materia', 'asc');

  if (materiasTitular.length === 0) {
    return {
      id_titular: idTitular,
      nombre_titular: titular.nombre_completo,
      materias_titular: [],
      candidatos: [],
      mensaje: 'El titular no tiene asignaciones en el año lectivo actual.',
    };
  }

  const materiaIds = materiasTitular.map((m) => m.id_materia);
  const requeridas = materiaIds.length;

  const candidatos = await db('persona as p')
    .join('profesor_materia_habilitacion as pmh', 'p.id_persona', 'pmh.id_persona_profesor')
    .whereIn('pmh.id_materia', materiaIds)
    .where('p.nombre_rol', 'profesor')
    .where('p.activo', true)
    .whereNot('p.id_persona', idTitular)
    .groupBy('p.id_persona', 'p.nombre_completo', 'p.correo')
    .havingRaw('COUNT(DISTINCT pmh.id_materia) = ?', [requeridas])
    .select('p.id_persona', 'p.nombre_completo', 'p.correo')
    .orderBy('p.nombre_completo', 'asc');

  return {
    id_titular: idTitular,
    nombre_titular: titular.nombre_completo,
    materias_titular: materiasTitular,
    candidatos,
    mensaje: candidatos.length === 0
      ? 'No hay docentes habilitados para todas las materias que imparte el titular.'
      : null,
  };
}

export async function listarSustituciones({ idPersona } = {}) {
  const cursoLectivo = await obtenerCursoLectivoActual();
  const hoy = fechaHoyIso();
  const curso = await db('curso_lectivo').where('id_curso_lectivo', cursoLectivo).first();

  let q = db('sustitucion as s')
    .join('profesor_materia_seccion as pms', 's.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .join('persona as pt', 'pms.id_persona_profesor', 'pt.id_persona')
    .join('persona as ps', 's.id_persona_sustituto', 'ps.id_persona')
    .join('materia as m', 'pms.id_materia', 'm.id_materia')
    .join('seccion as sec', 'pms.id_seccion', 'sec.id_seccion')
    .where('pms.curso_lectivo', cursoLectivo)
    .select(
      's.id_sustitucion',
      's.fecha_desde',
      's.fecha_hasta',
      'pms.id_persona_profesor as id_titular',
      'pt.nombre_completo as nombre_titular',
      'pt.cedula as cedula_titular',
      's.id_persona_sustituto as id_sustituto',
      'ps.nombre_completo as nombre_sustituto',
      'ps.cedula as cedula_sustituto',
      'm.nombre_materia',
      'sec.nombre_seccion'
    )
    .orderBy([
      { column: 's.fecha_desde', order: 'desc' },
      { column: 'pt.nombre_completo', order: 'asc' },
    ]);

  if (idPersona != null && idPersona !== '') {
    const id = parseInt(idPersona, 10);
    if (!Number.isInteger(id)) {
      throw new AppError('Identificador inválido', 400);
    }
    q = q.where(function filtroPersona() {
      this.where('pms.id_persona_profesor', id).orWhere('s.id_persona_sustituto', id);
    });
  }

  const filas = await q;
  const gruposMap = new Map();

  for (const f of filas) {
    const key = `${f.id_titular}|${f.id_sustituto}|${f.fecha_desde}|${f.fecha_hasta}`;
    if (!gruposMap.has(key)) {
      gruposMap.set(key, {
        id_titular: f.id_titular,
        nombre_titular: f.nombre_titular,
        cedula_titular: f.cedula_titular,
        id_sustituto: f.id_sustituto,
        nombre_sustituto: f.nombre_sustituto,
        cedula_sustituto: f.cedula_sustituto,
        fecha_desde: fechaAIsoDia(f.fecha_desde),
        fecha_hasta: fechaAIsoDia(f.fecha_hasta),
        estado: estadoSustitucion(f.fecha_desde, f.fecha_hasta, hoy),
        asignaciones: [],
      });
    }
    const g = gruposMap.get(key);
    if (!g.id_sustitucion_referencia) {
      g.id_sustitucion_referencia = f.id_sustitucion;
    }
    g.asignaciones.push({
      id_sustitucion: f.id_sustitucion,
      nombre_materia: f.nombre_materia,
      nombre_seccion: f.nombre_seccion,
    });
  }

  return {
    anio_lectivo: curso?.anio_curso_lectivo || new Date().getFullYear(),
    total: gruposMap.size,
    sustituciones: Array.from(gruposMap.values()),
  };
}

/**
 * Cancela o finaliza anticipadamente un grupo de sustitución (mismo titular/sustituto/rango).
 */
export async function cancelarSustitucion(idSustitucion) {
  const fila = await db('sustitucion as s')
    .join('profesor_materia_seccion as pms', 's.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .where('s.id_sustitucion', idSustitucion)
    .select(
      's.id_sustitucion',
      's.fecha_desde',
      's.fecha_hasta',
      's.id_persona_sustituto',
      'pms.id_persona_profesor as id_titular'
    )
    .first();

  if (!fila) {
    throw new AppError('Sustitución no encontrada', 404);
  }

  const hoy = fechaHoyIso();
  const estado = estadoSustitucion(fila.fecha_desde, fila.fecha_hasta, hoy);
  if (estado === 'finalizada') {
    throw new AppError('La sustitución ya está finalizada', 400);
  }

  const fechaDesdeStr = fechaAIsoDia(fila.fecha_desde);
  const fechaHastaOriginal = fechaAIsoDia(fila.fecha_hasta);
  const nuevaFechaHasta =
    estado === 'programada' ? fechaDiaAnterior(fechaDesdeStr) : fechaDiaAnterior(hoy);

  const idsGrupo = await db('sustitucion as s')
    .join('profesor_materia_seccion as pms', 's.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .where('pms.id_persona_profesor', fila.id_titular)
    .where('s.id_persona_sustituto', fila.id_persona_sustituto)
    .whereRaw('s.fecha_desde::date = ?::date', [fechaDesdeStr])
    .whereRaw('s.fecha_hasta::date = ?::date', [fechaHastaOriginal])
    .pluck('s.id_sustitucion');

  if (idsGrupo.length === 0) {
    throw new AppError('No se encontraron registros del grupo de sustitución a cancelar', 404);
  }

  const actualizados = await db('sustitucion')
    .whereIn('id_sustitucion', idsGrupo)
    .update({ fecha_hasta: nuevaFechaHasta })
    .returning('id_sustitucion');

  if (!actualizados.length) {
    throw new AppError('No se pudo actualizar la sustitución', 500);
  }

  return {
    cancelados: actualizados.length,
    fecha_hasta: nuevaFechaHasta,
    estado_anterior: estado,
  };
}

/**
 * Sustitución vigente en la que el docente actúa como sustituto (para banner en panel profesor).
 */
export async function obtenerSustitucionVigenteComoSustituto(idPersonaDocente) {
  const hoy = fechaHoyIso();
  const fila = await db('sustitucion as s')
    .join('profesor_materia_seccion as pms', 's.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .join('persona as pt', 'pt.id_persona', 'pms.id_persona_profesor')
    .where('s.id_persona_sustituto', idPersonaDocente)
    .where('s.fecha_desde', '<=', hoy)
    .where('s.fecha_hasta', '>=', hoy)
    .select(
      's.id_sustitucion',
      'pms.id_persona_profesor as id_titular',
      'pt.nombre_completo as nombre_titular',
      's.fecha_desde',
      's.fecha_hasta'
    )
    .orderBy('s.fecha_desde', 'desc')
    .first();

  if (!fila) return null;

  return {
    id_sustitucion: fila.id_sustitucion,
    id_titular: fila.id_titular,
    nombre_titular: fila.nombre_titular?.trim() || 'Docente titular',
    fecha_desde: fechaAIsoDia(fila.fecha_desde),
    fecha_hasta: fechaAIsoDia(fila.fecha_hasta),
  };
}
