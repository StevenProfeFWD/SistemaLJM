import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import { MAX_SECCIONES_GUIA_POR_PROFESOR } from './seccionService.js';
import {
  parseRangoFechas,
  consultarHistorialAsistenciaHijo,
} from './padresAsistenciaService.js';
import {
  calcularResumenAsistencia,
  contarEstadosAsistencia,
  calcularMetricasAnaliticas,
} from '../utils/estadoAsistencia.js';
import { TIPO_ESTADO_LABEL } from './orientacionService.js';
import { fechaToStr } from '../utils/estadoEstudiantePeriodo.js';
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
  return { id: curso.id_curso_lectivo, anio };
}

export async function listarSeccionesGuiaProfesor(idProfesor) {
  return db('seccion as s')
    .leftJoin('persona as pg', 's.id_persona_profesor_guia', 'pg.id_persona')
    .where('s.id_persona_profesor_guia', idProfesor)
    .select(
      's.id_seccion',
      's.nombre_seccion',
      's.numero_seccion',
      'pg.id_persona as id_profesor_guia',
      'pg.nombre_completo as nombre_profesor_guia'
    )
    .orderBy('s.nombre_seccion', 'asc');
}

function parseIdSeccionQuery(query, secciones) {
  const raw = query?.id_seccion;
  if (raw != null && String(raw).trim() !== '') {
    const id = parseInt(raw, 10);
    if (!Number.isInteger(id)) {
      throw new AppError('id_seccion inválido', 400);
    }
    const seccion = secciones.find((s) => s.id_seccion === id);
    if (!seccion) {
      throw new AppError('La sección indicada no pertenece a sus grupos guía', 403);
    }
    return seccion;
  }

  if (secciones.length === 1) {
    return secciones[0];
  }

  if (secciones.length > 1) {
    throw new AppError(
      'Debe indicar id_seccion cuando supervisa más de un grupo guía',
      400
    );
  }

  throw new AppError('No está asignado como profesor guía de ninguna sección', 403);
}

async function obtenerEstudiantesSeccionGuia(idSeccion, idCursoLectivo) {
  return db('matricula as m')
    .join('persona as p', 'm.id_persona_estudiante', 'p.id_persona')
    .where({
      'm.id_seccion': idSeccion,
      'm.id_curso_lectivo': idCursoLectivo,
      'p.activo': true,
    })
    .whereNotIn('m.estado', ['cancelada', 'graduado'])
    .select(
      'p.id_persona as id_persona_estudiante',
      'p.nombre_completo',
      'p.cedula'
    )
    .orderBy('p.nombre_completo', 'asc');
}

export async function obtenerMiSeccionGuia(idProfesor) {
  const secciones = await listarSeccionesGuiaProfesor(idProfesor);
  if (secciones.length === 0) {
    return {
      max_secciones_guia: MAX_SECCIONES_GUIA_POR_PROFESOR,
      seccionesGuia: [],
      seccionGuia: null,
      estudiantes: [],
    };
  }

  const { id: idCursoLectivo, anio } = await obtenerCursoLectivoActual();

  const seccionesGuia = await Promise.all(
    secciones.map(async (s) => {
      const estudiantes = await obtenerEstudiantesSeccionGuia(s.id_seccion, idCursoLectivo);
      return {
        ...s,
        anio_curso_lectivo: anio,
        id_curso_lectivo: idCursoLectivo,
        total_estudiantes: estudiantes.length,
      };
    })
  );

  const primera = seccionesGuia[0];
  const estudiantesPrimera = await obtenerEstudiantesSeccionGuia(
    primera.id_seccion,
    idCursoLectivo
  );

  return {
    max_secciones_guia: MAX_SECCIONES_GUIA_POR_PROFESOR,
    seccionesGuia,
    seccionGuia: primera,
    estudiantes: estudiantesPrimera,
  };
}

export async function assertEstudianteEnSeccionGuia(idProfesor, idEstudiante) {
  const secciones = await listarSeccionesGuiaProfesor(idProfesor);
  if (secciones.length === 0) {
    throw new AppError('No está asignado como profesor guía de ninguna sección', 403);
  }

  const { id: idCursoLectivo } = await obtenerCursoLectivoActual();
  const idEst = parseInt(idEstudiante, 10);
  if (!Number.isInteger(idEst)) {
    throw new AppError('id_estudiante inválido', 400);
  }

  const idsSeccion = secciones.map((s) => s.id_seccion);

  const matricula = await db('matricula')
    .where({
      id_persona_estudiante: idEst,
      id_curso_lectivo: idCursoLectivo,
    })
    .whereIn('id_seccion', idsSeccion)
    .first();

  if (!matricula) {
    throw new AppError('El estudiante no pertenece a ninguno de sus grupos guía', 403);
  }

  const seccion = secciones.find((s) => s.id_seccion === matricula.id_seccion);

  return { seccion, idEstudiante: idEst };
}

export async function obtenerAsistenciaSeccionGuia(idProfesor, query = {}) {
  const secciones = await listarSeccionesGuiaProfesor(idProfesor);
  if (secciones.length === 0) {
    throw new AppError('No está asignado como profesor guía de ninguna sección', 403);
  }

  const seccion = parseIdSeccionQuery(query, secciones);
  const { id: idCursoLectivo, anio } = await obtenerCursoLectivoActual();
  const estudiantes = await obtenerEstudiantesSeccionGuia(seccion.id_seccion, idCursoLectivo);

  const rango = parseRangoFechas(
    query.fecha_inicio || `${anio}-01-01`,
    query.fecha_fin
  );

  if (query.id_estudiante != null && String(query.id_estudiante).trim() !== '') {
    const idEst = parseInt(query.id_estudiante, 10);
    const pertenece = estudiantes.some((e) => e.id_persona_estudiante === idEst);
    if (!pertenece) {
      throw new AppError('El estudiante no pertenece a la sección seleccionada', 403);
    }
    const detalle = await consultarHistorialAsistenciaHijo(
      idEst,
      rango.fecha_inicio,
      rango.fecha_fin
    );
    return {
      seccion,
      rango,
      estudiante: detalle.estudiante,
      resumen: detalle.resumen,
      registros: detalle.registros,
    };
  }

  const ids = estudiantes.map((e) => e.id_persona_estudiante);
  if (ids.length === 0) {
    return {
      seccion,
      rango,
      resumen_global: null,
      estudiantes: [],
    };
  }

  const filas = await db('asistencia as a')
    .join('profesor_materia_seccion as pms', 'a.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .join('persona as est', 'a.id_persona_estudiante', 'est.id_persona')
    .whereIn('a.id_persona_estudiante', ids)
    .where('pms.id_seccion', seccion.id_seccion)
    .whereBetween('a.fecha', [rango.fecha_inicio, rango.fecha_fin])
    .select('a.estado', 'a.id_persona_estudiante', 'est.nombre_completo', 'est.cedula');

  const porEstudiante = new Map();
  for (const est of estudiantes) {
    porEstudiante.set(est.id_persona_estudiante, { ...est, registros: [] });
  }
  for (const f of filas) {
    porEstudiante.get(f.id_persona_estudiante)?.registros.push(f);
  }

  const matriz = [...porEstudiante.values()].map((e) => {
    const resumen = calcularResumenAsistencia(e.registros);
    return {
      id_persona_estudiante: e.id_persona_estudiante,
      nombre_completo: e.nombre_completo,
      cedula: e.cedula,
      nivel_asistencia_pct: resumen.nivel_asistencia_pct,
      ausencias_totales: resumen.ausencias_totales,
      ausencias_justificadas: resumen.ausencias_justificadas,
      ausencias_injustificadas: resumen.ausencias_injustificadas,
      tardias: resumen.tardias,
      en_riesgo_exclusion: resumen.ausencias_totales >= 3,
    };
  });

  const conteosGlobales = contarEstadosAsistencia(filas);
  const metricas = calcularMetricasAnaliticas(conteosGlobales);

  return {
    seccion,
    rango,
    resumen_global: {
      ...metricas,
      nivel_asistencia_general_pct: metricas.nivel_asistencia_pct,
    },
    estudiantes: matriz,
  };
}

async function reportesOrientacionParaSeccion(seccion, idCursoLectivo, idProfesor) {
  const estudiantes = await obtenerEstudiantesSeccionGuia(seccion.id_seccion, idCursoLectivo);
  const ids = estudiantes.map((e) => e.id_persona_estudiante);

  if (ids.length === 0) {
    return [];
  }

  const estados = await db('estado_estudiante_periodo as e')
    .join('persona as p', 'e.id_persona_estudiante', 'p.id_persona')
    .whereIn('e.id_persona_estudiante', ids)
    .whereIn('e.tipo_estado', ['suspension', 'permiso_institucional', 'expulsion'])
    .orderBy('e.fecha_inicio', 'desc')
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
    );

  const idsEstados = estados.map((e) => e.id_estado_periodo);
  let comentarios = [];
  if (idsEstados.length > 0) {
    comentarios = await db('comentario_seguimiento_guia as c')
      .join('persona as prof', 'c.id_persona_profesor', 'prof.id_persona')
      .whereIn('c.id_estado_periodo', idsEstados)
      .orderBy('c.fecha_registro', 'asc')
      .select(
        'c.id_comentario',
        'c.id_estado_periodo',
        'c.id_persona_profesor',
        'c.comentario',
        'c.fecha_registro',
        'prof.nombre_completo as nombre_profesor'
      );
  }

  const comentariosPorEstado = new Map();
  for (const c of comentarios) {
    if (!comentariosPorEstado.has(c.id_estado_periodo)) {
      comentariosPorEstado.set(c.id_estado_periodo, []);
    }
    comentariosPorEstado.get(c.id_estado_periodo).push({
      ...c,
      fecha_registro: c.fecha_registro
        ? new Date(c.fecha_registro).toISOString()
        : null,
    });
  }

  return estados.map((e) => ({
    id_estado_periodo: e.id_estado_periodo,
    id_persona_estudiante: e.id_persona_estudiante,
    nombre_completo: e.nombre_completo,
    cedula: e.cedula,
    tipo_estado: e.tipo_estado,
    tipo_estado_label: TIPO_ESTADO_LABEL[e.tipo_estado] || e.tipo_estado,
    fecha_inicio: fechaToStr(e.fecha_inicio),
    fecha_fin: fechaToStr(e.fecha_fin),
    motivo: e.motivo,
    nombre_seccion: seccion.nombre_seccion,
    id_seccion: seccion.id_seccion,
    comentarios: comentariosPorEstado.get(e.id_estado_periodo) || [],
  }));
}

export async function obtenerReportesOrientacionSeccionGuia(idProfesor, query = {}) {
  const secciones = await listarSeccionesGuiaProfesor(idProfesor);
  if (secciones.length === 0) {
    throw new AppError('No está asignado como profesor guía de ninguna sección', 403);
  }

  const { id: idCursoLectivo } = await obtenerCursoLectivoActual();

  const rawSeccion = query?.id_seccion;
  if (rawSeccion != null && String(rawSeccion).trim() !== '') {
    const seccion = parseIdSeccionQuery(query, secciones);
    const registros = await reportesOrientacionParaSeccion(seccion, idCursoLectivo, idProfesor);
    return { seccion, total: registros.length, registros };
  }

  if (secciones.length === 1) {
    const registros = await reportesOrientacionParaSeccion(
      secciones[0],
      idCursoLectivo,
      idProfesor
    );
    return { seccion: secciones[0], total: registros.length, registros };
  }

  const bloques = await Promise.all(
    secciones.map(async (s) => ({
      seccion: s,
      registros: await reportesOrientacionParaSeccion(s, idCursoLectivo, idProfesor),
    }))
  );

  const registros = bloques.flatMap((b) => b.registros);

  return {
    seccion: null,
    secciones: secciones.map((s) => ({
      id_seccion: s.id_seccion,
      nombre_seccion: s.nombre_seccion,
    })),
    total: registros.length,
    registros,
  };
}

export async function crearComentarioSeguimientoGuia(idProfesor, body) {
  const idEstado = parseInt(body.id_estado_periodo, 10);
  if (!Number.isInteger(idEstado)) {
    throw new AppError('id_estado_periodo inválido', 400);
  }

  const texto = String(body.comentario || '').trim();
  if (texto.length < 5) {
    throw new AppError('El comentario debe tener al menos 5 caracteres', 400);
  }

  const estado = await db('estado_estudiante_periodo')
    .where('id_estado_periodo', idEstado)
    .first();

  if (!estado) {
    throw new AppError('Registro de orientación no encontrado', 404);
  }

  await assertEstudianteEnSeccionGuia(idProfesor, estado.id_persona_estudiante);

  const [inserted] = await db('comentario_seguimiento_guia')
    .insert({
      id_estado_periodo: idEstado,
      id_persona_profesor: idProfesor,
      comentario: texto,
    })
    .returning('*');

  const profesor = await db('persona')
    .where('id_persona', idProfesor)
    .select('nombre_completo')
    .first();

  return {
    ...inserted,
    nombre_profesor: profesor?.nombre_completo,
    fecha_registro: inserted.fecha_registro
      ? new Date(inserted.fecha_registro).toISOString()
      : null,
    message: 'Comentario de seguimiento registrado correctamente.',
  };
}
