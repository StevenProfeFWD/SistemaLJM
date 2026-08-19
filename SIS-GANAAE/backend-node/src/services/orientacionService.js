import db from '../db/knex.js';
import {
  TIPOS_VALIDOS,
  fechaToStr,
  estudianteTieneExpulsionDefinitiva,
  validarSuspensionSinSolapamiento,
} from '../utils/estadoEstudiantePeriodo.js';
import { notificarEstadoOrientacion } from './notificationService.js';

async function aplicarCierreAcademicoPorExpulsion(trx, idEstudiante) {
  const anio = new Date().getFullYear();

  const idsMatricula = await trx('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .where('m.id_persona_estudiante', idEstudiante)
    .where('cl.anio_curso_lectivo', anio)
    .whereIn('m.estado', ['activa', 'pendiente'])
    .pluck('m.id_matricula');

  if (idsMatricula.length) {
    await trx('matricula').whereIn('id_matricula', idsMatricula).update({ estado: 'cancelada' });
  }

  await trx('persona')
    .where({ id_persona: idEstudiante, nombre_rol: 'estudiante' })
    .update({ activo: false });
}

export async function listarEstadosPeriodo(idEstudiante) {
  let q = db('estado_estudiante_periodo as e')
    .join('persona as p', 'e.id_persona_estudiante', 'p.id_persona')
    .select(
      'e.id_estado_periodo',
      'e.id_persona_estudiante',
      'e.tipo_estado',
      'e.fecha_inicio',
      'e.fecha_fin',
      'e.motivo',
      'e.created_at',
      'p.nombre_completo',
      'p.cedula'
    )
    .orderBy('e.fecha_inicio', 'desc');

  if (idEstudiante != null) {
    const id = parseInt(idEstudiante, 10);
    if (!Number.isInteger(id)) {
      const err = new Error('id_estudiante inválido');
      err.status = 400;
      throw err;
    }
    q = q.where('e.id_persona_estudiante', id);
  }

  const rows = await q;
  return rows.map((r) => ({
    ...r,
    fecha_inicio: fechaToStr(r.fecha_inicio),
    fecha_fin: fechaToStr(r.fecha_fin),
  }));
}

export async function crearEstadoPeriodo(body) {
  const {
    id_persona_estudiante,
    tipo_estado,
    fecha_inicio,
    fecha_fin,
    motivo,
  } = body;

  const idEst = parseInt(id_persona_estudiante, 10);
  if (!Number.isInteger(idEst)) {
    const err = new Error('id_persona_estudiante es obligatorio');
    err.status = 400;
    throw err;
  }

  const tipo = String(tipo_estado || '').trim();
  if (!TIPOS_VALIDOS.includes(tipo)) {
    const err = new Error(`tipo_estado inválido. Use: ${TIPOS_VALIDOS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!fecha_inicio) {
    const err = new Error('fecha_inicio es obligatoria');
    err.status = 400;
    throw err;
  }

  if (tipo !== 'expulsion' && !fecha_fin) {
    const err = new Error('fecha_fin es obligatoria excepto para expulsión definitiva');
    err.status = 400;
    throw err;
  }

  if (fecha_fin && fecha_fin < fecha_inicio) {
    const err = new Error('fecha_fin no puede ser anterior a fecha_inicio');
    err.status = 400;
    throw err;
  }

  const estudiante = await db('persona')
    .where({ id_persona: idEst, nombre_rol: 'estudiante' })
    .first();

  if (!estudiante) {
    const err = new Error('Estudiante no encontrado');
    err.status = 404;
    throw err;
  }

  if (await estudianteTieneExpulsionDefinitiva(idEst)) {
    const err = new Error(
      'El estudiante tiene una expulsión definitiva registrada. No se pueden registrar nuevos estados especiales.'
    );
    err.status = 403;
    throw err;
  }

  const inserted = await db.transaction(async (trx) => {
    if (tipo === 'suspension') {
      await validarSuspensionSinSolapamiento(idEst, fecha_inicio, fecha_fin, null, trx);
    }

    const [fila] = await trx('estado_estudiante_periodo')
      .insert({
        id_persona_estudiante: idEst,
        tipo_estado: tipo,
        fecha_inicio,
        fecha_fin: fecha_fin || null,
        motivo: motivo || null,
      })
      .returning('*');

    if (tipo === 'expulsion') {
      await aplicarCierreAcademicoPorExpulsion(trx, idEst);
    }

    return fila;
  });

  const resultado = {
    ...inserted,
    fecha_inicio: fechaToStr(inserted.fecha_inicio),
    fecha_fin: fechaToStr(inserted.fecha_fin),
    nombre_completo: estudiante.nombre_completo,
  };

  setImmediate(() => {
    notificarEstadoOrientacion({
      ...resultado,
      id_persona_estudiante: idEst,
    }).catch((err) => {
      console.error('[orientacion] Error al notificar por correo:', err.message);
    });
  });

  return resultado;
}

export async function actualizarEstadoPeriodo(idEstado, body) {
  const id = parseInt(idEstado, 10);
  if (!Number.isInteger(id)) {
    const err = new Error('id_estado_periodo inválido');
    err.status = 400;
    throw err;
  }

  const existente = await db('estado_estudiante_periodo')
    .where('id_estado_periodo', id)
    .first();

  if (!existente) {
    const err = new Error('Registro de estado no encontrado');
    err.status = 404;
    throw err;
  }

  if (existente.tipo_estado === 'expulsion') {
    const err = new Error('La expulsión es definitiva y no puede modificarse');
    err.status = 403;
    throw err;
  }

  const hoy = hoyIsoLocal();
  const finExistente = fechaToStr(existente.fecha_fin);
  if (finExistente && finExistente <= hoy) {
    const err = new Error('No se puede modificar un registro histórico');
    err.status = 403;
    throw err;
  }

  const tipo = body.tipo_estado != null ? String(body.tipo_estado).trim() : existente.tipo_estado;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    const err = new Error(`tipo_estado inválido. Use: ${TIPOS_VALIDOS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const fechaInicio = body.fecha_inicio ?? fechaToStr(existente.fecha_inicio);
  const fechaFin = body.fecha_fin !== undefined
    ? (body.fecha_fin || null)
    : fechaToStr(existente.fecha_fin);

  if (tipo !== 'expulsion' && !fechaFin) {
    const err = new Error('fecha_fin es obligatoria excepto para expulsión definitiva');
    err.status = 400;
    throw err;
  }

  if (fechaFin && fechaFin < fechaInicio) {
    const err = new Error('fecha_fin no puede ser anterior a fecha_inicio');
    err.status = 400;
    throw err;
  }

  if (tipo === 'suspension') {
    await db.transaction(async (trx) => {
      await validarSuspensionSinSolapamiento(
        existente.id_persona_estudiante,
        fechaInicio,
        fechaFin,
        id,
        trx
      );

      await trx('estado_estudiante_periodo')
        .where('id_estado_periodo', id)
        .update({
          tipo_estado: tipo,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          motivo: body.motivo !== undefined ? body.motivo : existente.motivo,
          updated_at: db.fn.now(),
        });
    });
  } else {
    await db('estado_estudiante_periodo')
      .where('id_estado_periodo', id)
      .update({
        tipo_estado: tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        motivo: body.motivo !== undefined ? body.motivo : existente.motivo,
        updated_at: db.fn.now(),
      });
  }

  return obtenerRegistroHistorialPorId(id);
}

export function hoyIsoLocal() {
  const h = new Date();
  const y = h.getFullYear();
  const m = String(h.getMonth() + 1).padStart(2, '0');
  const d = String(h.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Cierra anticipadamente un estado vigente fijando fecha_fin al día de hoy
 * (el estudiante vuelve a estado regular en asistencia a partir del día siguiente).
 */
export async function anularEstadoPeriodo(idEstado) {
  const id = parseInt(idEstado, 10);
  if (!Number.isInteger(id)) {
    const err = new Error('id_estado_periodo inválido');
    err.status = 400;
    throw err;
  }

  const existente = await db('estado_estudiante_periodo')
    .where('id_estado_periodo', id)
    .first();

  if (!existente) {
    const err = new Error('Registro de estado no encontrado');
    err.status = 404;
    throw err;
  }

  if (existente.tipo_estado === 'expulsion') {
    const err = new Error('La expulsión es definitiva y no puede finalizarse ni levantarse');
    err.status = 403;
    throw err;
  }

  const hoy = hoyIsoLocal();
  const inicio = fechaToStr(existente.fecha_inicio);
  const finActual = fechaToStr(existente.fecha_fin);

  if (finActual && finActual <= hoy) {
    const err = new Error('Este estado ya finalizó y no puede levantarse de nuevo');
    err.status = 400;
    throw err;
  }

  const updatePayload = hoy < inicio
    ? { fecha_inicio: hoy, fecha_fin: hoy }
    : { fecha_fin: hoy };

  await db('estado_estudiante_periodo')
    .where('id_estado_periodo', id)
    .update({
      ...updatePayload,
      updated_at: db.fn.now(),
    });

  return obtenerRegistroHistorialPorId(id);
}

async function enriquecerEstudianteBusqueda(estudiante) {
  const anio = new Date().getFullYear();
  const expulsadoDefinitivo = await estudianteTieneExpulsionDefinitiva(estudiante.id_persona);

  const matricula = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('m.id_persona_estudiante', estudiante.id_persona)
    .where('cl.anio_curso_lectivo', anio)
    .select(
      'm.estado',
      'm.ano_a_cursar',
      's.nombre_seccion'
    )
    .orderBy('m.fecha_matricula', 'desc')
    .first();

  const estadoMat = matricula?.estado ? String(matricula.estado).toLowerCase() : null;
  const matriculaActiva = Boolean(
    matricula &&
      !expulsadoDefinitivo &&
      !['inactiva', 'archivada', 'cancelada'].includes(estadoMat)
  );

  return {
    id_persona: estudiante.id_persona,
    nombre_completo: estudiante.nombre_completo,
    cedula: estudiante.cedula,
    correo: estudiante.correo,
    expulsado_definitivo: expulsadoDefinitivo,
    matricula_activa: matriculaActiva,
    matricula_estado: matricula?.estado || null,
    nombre_seccion: matricula?.nombre_seccion || null,
    ano_a_cursar: matricula?.ano_a_cursar || null,
  };
}

/**
 * Búsqueda predictiva de estudiantes para el módulo de orientación.
 * @param {{ q?: string, id_estudiante?: string|number }} params
 */
export async function buscarEstudiantesOrientacion({ q, id_estudiante }) {
  if (id_estudiante != null && String(id_estudiante).trim() !== '') {
    const id = parseInt(id_estudiante, 10);
    if (!Number.isInteger(id)) {
      const err = new Error('id_estudiante inválido');
      err.status = 400;
      throw err;
    }
    const row = await db('persona')
      .where({ id_persona: id, nombre_rol: 'estudiante' })
      .select('id_persona', 'nombre_completo', 'cedula', 'correo', 'activo')
      .first();
    if (!row) return [];
    return [await enriquecerEstudianteBusqueda(row)];
  }

  const term = String(q || '').trim();
  if (term.length < 2) {
    return [];
  }

  const pattern = `%${term.toLowerCase()}%`;
  const cedulaLimpia = term.replace(/\s/g, '');
  const cedulaPattern = `%${cedulaLimpia}%`;

  const rows = await db('persona as p')
    .select('p.id_persona', 'p.nombre_completo', 'p.cedula', 'p.correo')
    .where('p.nombre_rol', 'estudiante')
    .where('p.activo', true)
    .andWhere((qb) => {
      qb.whereRaw('LOWER(p.nombre_completo) LIKE ?', [pattern])
        .orWhereRaw('p.cedula LIKE ?', [cedulaPattern]);
    })
    .orderBy('p.nombre_completo', 'asc')
    .limit(5);

  return Promise.all(rows.map(enriquecerEstudianteBusqueda));
}

export const TIPO_ESTADO_LABEL = {
  suspension: 'Suspensión',
  permiso_institucional: 'Permiso Institucional',
  expulsion: 'Expulsión',
};

async function obtenerMatriculaVigente(idEstudiante) {
  const anio = new Date().getFullYear();
  return db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('m.id_persona_estudiante', idEstudiante)
    .where('cl.anio_curso_lectivo', anio)
    .select('s.id_seccion', 's.nombre_seccion', 'm.ano_a_cursar')
    .orderBy('m.fecha_matricula', 'desc')
    .first();
}

function parseFiltrosHistorial(query) {
  const idSeccion = query.id_seccion != null && String(query.id_seccion).trim() !== ''
    ? parseInt(query.id_seccion, 10)
    : null;
  const tipoEstado = query.tipo_estado != null && String(query.tipo_estado).trim() !== ''
    ? String(query.tipo_estado).trim()
    : null;

  if (idSeccion != null && !Number.isInteger(idSeccion)) {
    const err = new Error('id_seccion inválido');
    err.status = 400;
    throw err;
  }
  if (tipoEstado && !TIPOS_VALIDOS.includes(tipoEstado)) {
    const err = new Error(`tipo_estado inválido. Use: ${TIPOS_VALIDOS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const fechaInicio = query.fecha_inicio && /^\d{4}-\d{2}-\d{2}$/.test(String(query.fecha_inicio).trim())
    ? String(query.fecha_inicio).trim()
    : null;
  const fechaFin = query.fecha_fin && /^\d{4}-\d{2}-\d{2}$/.test(String(query.fecha_fin).trim())
    ? String(query.fecha_fin).trim()
    : null;

  if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
    const err = new Error('fecha_inicio no puede ser posterior a fecha_fin');
    err.status = 400;
    throw err;
  }

  return { id_seccion: idSeccion, tipo_estado: tipoEstado, fecha_inicio: fechaInicio, fecha_fin: fechaFin };
}

async function enriquecerRegistroHistorial(row) {
  const mat = await obtenerMatriculaVigente(row.id_persona_estudiante);
  const fechaFin = fechaToStr(row.fecha_fin);
  const hoy = hoyIsoLocal();
  const esExpulsion = row.tipo_estado === 'expulsion';
  const esVigente = esExpulsion || (!fechaFin || fechaFin > hoy);
  const esEditable = !esExpulsion && Boolean(fechaFin && fechaFin > hoy);
  return {
    id_estado_periodo: row.id_estado_periodo,
    id_persona_estudiante: row.id_persona_estudiante,
    cedula: row.cedula,
    nombre_completo: row.nombre_completo,
    correo: row.correo,
    id_seccion: mat?.id_seccion ?? null,
    nombre_seccion: mat?.nombre_seccion ?? 'Sin sección',
    ano_a_cursar: mat?.ano_a_cursar ?? null,
    tipo_estado: row.tipo_estado,
    tipo_estado_label: TIPO_ESTADO_LABEL[row.tipo_estado] || row.tipo_estado,
    fecha_inicio: fechaToStr(row.fecha_inicio),
    fecha_fin: fechaFin,
    es_vigente: esVigente,
    es_expulsion: esExpulsion,
    es_editable: esEditable,
    motivo: row.motivo,
    created_at: row.created_at,
  };
}

function queryHistorialBase(filtros) {
  let q = db('estado_estudiante_periodo as e')
    .join('persona as p', 'e.id_persona_estudiante', 'p.id_persona')
    .select(
      'e.id_estado_periodo',
      'e.id_persona_estudiante',
      'e.tipo_estado',
      'e.fecha_inicio',
      'e.fecha_fin',
      'e.motivo',
      'e.created_at',
      'p.nombre_completo',
      'p.cedula',
      'p.correo'
    );

  if (filtros.tipo_estado) {
    q = q.where('e.tipo_estado', filtros.tipo_estado);
  }

  if (filtros.fecha_inicio && filtros.fecha_fin) {
    q = q
      .where('e.fecha_inicio', '<=', filtros.fecha_fin)
      .where(function solapaRango() {
        this.whereNull('e.fecha_fin').orWhere('e.fecha_fin', '>=', filtros.fecha_inicio);
      });
  } else if (filtros.fecha_inicio) {
    q = q.where(function vigenteDesde() {
      this.whereNull('e.fecha_fin').orWhere('e.fecha_fin', '>=', filtros.fecha_inicio);
    });
  } else if (filtros.fecha_fin) {
    q = q.where('e.fecha_inicio', '<=', filtros.fecha_fin);
  }

  return q.orderBy('e.fecha_inicio', 'desc');
}

export async function listarHistorialOrientacion(query) {
  const filtros = parseFiltrosHistorial(query);
  const rows = await queryHistorialBase(filtros);
  let registros = await Promise.all(rows.map(enriquecerRegistroHistorial));

  if (filtros.id_seccion != null) {
    registros = registros.filter((r) => r.id_seccion === filtros.id_seccion);
  }

  const secciones = await db('seccion')
    .select('id_seccion', 'nombre_seccion')
    .orderBy('nombre_seccion');

  return {
    filtros,
    total: registros.length,
    registros,
    catalogos: { secciones },
  };
}

export async function obtenerRegistroHistorialPorId(idEstado) {
  const id = parseInt(idEstado, 10);
  if (!Number.isInteger(id)) {
    const err = new Error('id_estado_periodo inválido');
    err.status = 400;
    throw err;
  }

  const row = await db('estado_estudiante_periodo as e')
    .join('persona as p', 'e.id_persona_estudiante', 'p.id_persona')
    .where('e.id_estado_periodo', id)
    .select(
      'e.id_estado_periodo',
      'e.id_persona_estudiante',
      'e.tipo_estado',
      'e.fecha_inicio',
      'e.fecha_fin',
      'e.motivo',
      'e.created_at',
      'p.nombre_completo',
      'p.cedula',
      'p.correo'
    )
    .first();

  if (!row) {
    const err = new Error('Registro de estado no encontrado');
    err.status = 404;
    throw err;
  }

  return enriquecerRegistroHistorial(row);
}

export async function eliminarEstadoPeriodo(idEstado) {
  const id = parseInt(idEstado, 10);
  if (!Number.isInteger(id)) {
    const err = new Error('id_estado_periodo inválido');
    err.status = 400;
    throw err;
  }

  const deleted = await db('estado_estudiante_periodo')
    .where('id_estado_periodo', id)
    .del();

  if (!deleted) {
    const err = new Error('Registro de estado no encontrado');
    err.status = 404;
    throw err;
  }

  return { message: 'Registro eliminado correctamente', id_estado_periodo: id };
}
