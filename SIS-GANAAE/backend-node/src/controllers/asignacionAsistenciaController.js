import db from '../db/knex.js';
import {
  getMateriasCatalog,
  getSeccionesCatalog,
  invalidateCursosLectivosCache,
} from '../services/catalogCacheService.js';
import {
  etiquetaLeccion,
  fechaToIsoDiaSemana,
  DIA_SEMANA_LABEL,
} from '../utils/leccionHelper.js';
import {
  obtenerEstadosActivosPorEstudiantes,
  esEstadoBloqueante,
  estadoAsistenciaForzado,
} from '../utils/estadoEstudiantePeriodo.js';
import { dispararNotificacionesAusencias } from '../services/notificationService.js';
import {
  aplicarFiltroAsignacionesProfesor,
  profesorPuedeAccederAsignacion,
  fechaHoyIso,
} from '../utils/sustitucionHelper.js';

async function obtenerCursoLectivoActual() {
  const anio = new Date().getFullYear();
  let curso = await db('curso_lectivo').where({ anio_curso_lectivo: anio }).first();
  if (!curso) {
    const [c] = await db('curso_lectivo').insert({ anio_curso_lectivo: anio }).returning('id_curso_lectivo');
    curso = c;
    invalidateCursosLectivosCache();
  }
  return curso.id_curso_lectivo;
}

async function fetchHorariosConLeccion(idProfesorMateriaSeccion, diaSemanaFiltro = null) {
  let q = db('horarioasignacion as ha')
    .join('leccion as l', 'ha.id_leccion', 'l.id_leccion')
    .where('ha.id_profesor_materia_seccion', idProfesorMateriaSeccion);

  if (diaSemanaFiltro != null) {
    q = q.where('ha.dia_semana', diaSemanaFiltro);
  }

  const rows = await q
    .orderBy('ha.dia_semana')
    .orderBy('ha.id_leccion')
    .select(
      'ha.dia_semana',
      'ha.id_leccion',
      'l.hora_inicio',
      'l.hora_fin',
      'l.es_recreo_almuerzo'
    );

  return rows.map((row) => ({
    ...row,
    etiqueta: etiquetaLeccion(row),
  }));
}

function validarBloqueLeccion(h, index) {
  const dia = parseInt(h.dia_semana, 10);
  const idLeccion = parseInt(h.id_leccion, 10);
  if (!Number.isFinite(dia) || dia < 1 || dia > 7) {
    return `Horario ${index + 1}: dia_semana inválido (1–7)`;
  }
  if (!Number.isInteger(idLeccion) || idLeccion < 1 || idLeccion > 15) {
    return `Horario ${index + 1}: id_leccion debe ser un entero entre 1 y 15`;
  }
  return null;
}

const LECCION_ALMUERZO_ID = 7;
const ERROR_LECCION_ALMUERZO =
  'Operación inválida: No se pueden asignar materias académicas en la lección 7 (período de almuerzo institucional)';

function contieneLeccionAlmuerzo(horarios) {
  return horarios.some((h) => parseInt(h.id_leccion, 10) === LECCION_ALMUERZO_ID);
}

export async function getAsignaciones(req, res) {
  const cursoLectivo = await obtenerCursoLectivoActual();
  const fechaParam = req.query.fecha != null ? String(req.query.fecha).trim() : '';
  let diaSemanaFiltro = null;

  if (fechaParam) {
    diaSemanaFiltro = fechaToIsoDiaSemana(fechaParam);
    if (!diaSemanaFiltro) {
      return res.status(400).json({ error: 'Fecha inválida. Use formato YYYY-MM-DD' });
    }
  }

  let q = db('profesor_materia_seccion as pms')
    .select(
      'pms.id_profesor_materia_seccion',
      'pms.id_persona_profesor',
      'pms.curso_lectivo',
      'pms.id_materia',
      'pms.id_seccion',
      'persona.nombre_completo as nombre_profesor',
      'materia.nombre_materia',
      'seccion.nombre_seccion'
    )
    .leftJoin('persona', 'pms.id_persona_profesor', 'persona.id_persona')
    .leftJoin('materia', 'pms.id_materia', 'materia.id_materia')
    .leftJoin('seccion', 'pms.id_seccion', 'seccion.id_seccion')
    .where('pms.curso_lectivo', cursoLectivo);

  if (req.user.rol === 'profesor') {
    const fechaRef = fechaParam || fechaHoyIso();
    q = aplicarFiltroAsignacionesProfesor(q, req.user.id, fechaRef);
  }

  if (diaSemanaFiltro != null) {
    q = q.whereExists(function existeHorarioEseDia() {
      this.select(db.raw('1'))
        .from('horarioasignacion as ha')
        .whereRaw('ha.id_profesor_materia_seccion = pms.id_profesor_materia_seccion')
        .where('ha.dia_semana', diaSemanaFiltro);
    });
  }

  const asignaciones = await q
    .orderBy('materia.nombre_materia')
    .orderBy('seccion.nombre_seccion');

  const conHorarios = await Promise.all(
    asignaciones.map(async (a) => {
      const horarios = await fetchHorariosConLeccion(
        a.id_profesor_materia_seccion,
        diaSemanaFiltro
      );
      return { ...a, horarios };
    })
  );

  if (fechaParam) {
    return res.json({
      fecha: fechaParam,
      dia_semana: diaSemanaFiltro,
      dia_semana_label: DIA_SEMANA_LABEL[diaSemanaFiltro] || null,
      es_fin_de_semana: diaSemanaFiltro >= 6,
      asignaciones: conHorarios,
    });
  }

  return res.json(conHorarios);
}

async function validarMateriaHabilitada(idProf, idMat) {
  const habilitado = await db('profesor_materia_habilitacion')
    .where({ id_persona_profesor: idProf, id_materia: idMat })
    .first();

  if (!habilitado) {
    const tieneAlguna = await db('profesor_materia_habilitacion')
      .where({ id_persona_profesor: idProf })
      .first();
    if (!tieneAlguna) {
      return 'El docente no tiene materias habilitadas registradas. Configúrelas en Asignación de Materias antes de asignar carga lectiva.';
    }
    return 'Esta materia no está entre las habilitadas para este docente según su formación.';
  }
  return null;
}

async function validarConflictosHorario(trx, { idProf, idSeccion, cursoLectivo, asignacionId, horarios }) {
  for (const h of horarios) {
    const dia = parseInt(h.dia_semana, 10);
    const idLeccion = parseInt(h.id_leccion, 10);

    const conflicto = await trx('horarioasignacion as ha')
      .join('profesor_materia_seccion as pms', 'ha.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
      .join('materia as m', 'pms.id_materia', 'm.id_materia')
      .join('seccion as s', 'pms.id_seccion', 's.id_seccion')
      .where('pms.id_persona_profesor', idProf)
      .where('pms.curso_lectivo', cursoLectivo)
      .where('ha.dia_semana', dia)
      .where('ha.id_leccion', idLeccion)
      .whereNot('pms.id_profesor_materia_seccion', asignacionId)
      .select('s.nombre_seccion', 'm.nombre_materia')
      .first();

    if (conflicto) {
      return {
        status: 409,
        error: 'El profesor ya tiene una clase asignada en ese horario',
        detalle: `El docente ya imparte ${conflicto.nombre_materia} en la sección ${conflicto.nombre_seccion} el día ${DIA_SEMANA_LABEL[dia] || `Día ${dia}`} en la lección ${idLeccion}`,
      };
    }

    const choqueSeccion = await trx('horarioasignacion as ha')
      .join('profesor_materia_seccion as pms', 'ha.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
      .join('persona as p', 'pms.id_persona_profesor', 'p.id_persona')
      .join('materia as m', 'pms.id_materia', 'm.id_materia')
      .join('seccion as s', 'pms.id_seccion', 's.id_seccion')
      .where('pms.id_seccion', idSeccion)
      .where('pms.curso_lectivo', cursoLectivo)
      .where('ha.dia_semana', dia)
      .where('ha.id_leccion', idLeccion)
      .whereNot('pms.id_profesor_materia_seccion', asignacionId)
      .select('s.nombre_seccion', 'm.nombre_materia', 'p.nombre_completo')
      .first();

    if (choqueSeccion) {
      return {
        status: 409,
        error: 'La sección ya tiene una clase asignada en ese horario',
        detalle: `La sección ${choqueSeccion.nombre_seccion} ya tiene la lección ocupada con la materia de ${choqueSeccion.nombre_materia} impartida por ${choqueSeccion.nombre_completo} el día ${DIA_SEMANA_LABEL[dia] || `Día ${dia}`} en la lección ${idLeccion}`,
      };
    }
  }
  return null;
}

export async function postAsignacion(req, res) {
  const { id_persona_profesor, id_materia, id_seccion, horarios } = req.body;
  if (!id_persona_profesor || !id_materia || !id_seccion || !Array.isArray(horarios) || horarios.length === 0) {
    return res.status(400).json({
      error: 'Faltan datos: id_persona_profesor, id_materia, id_seccion, horarios (array de { dia_semana, id_leccion })',
    });
  }

  for (let i = 0; i < horarios.length; i += 1) {
    const err = validarBloqueLeccion(horarios[i], i);
    if (err) return res.status(400).json({ error: err });
  }

  if (contieneLeccionAlmuerzo(horarios)) {
    return res.status(400).json({ error: ERROR_LECCION_ALMUERZO });
  }

  const claves = horarios.map((h) => `${parseInt(h.dia_semana, 10)}-${parseInt(h.id_leccion, 10)}`);
  if (new Set(claves).size !== claves.length) {
    return res.status(400).json({ error: 'Hay bloques duplicados (mismo día y lección)' });
  }

  const cursoLectivo = await obtenerCursoLectivoActual();

  const idProf = parseInt(id_persona_profesor, 10);
  const idMat = parseInt(id_materia, 10);

  const errHab = await validarMateriaHabilitada(idProf, idMat);
  if (errHab) {
    return res.status(400).json({ error: errHab });
  }

  const trx = await db.transaction();
  try {
    const idSeccionAsignacion = parseInt(id_seccion, 10);

    const inserted = await trx('profesor_materia_seccion')
      .insert({
        id_persona_profesor: idProf,
        curso_lectivo: cursoLectivo,
        id_materia: idMat,
        id_seccion: idSeccionAsignacion,
      })
      .onConflict(['id_persona_profesor', 'curso_lectivo', 'id_materia', 'id_seccion'])
      .ignore()
      .returning('id_profesor_materia_seccion');

    const idAsignacion =
      inserted && inserted.length > 0
        ? typeof inserted[0] === 'object' && inserted[0] !== null
          ? inserted[0].id_profesor_materia_seccion
          : inserted[0]
        : null;

    const asignacionId =
      idAsignacion ||
      (await trx('profesor_materia_seccion')
        .where({
          id_persona_profesor: idProf,
          curso_lectivo: cursoLectivo,
          id_materia: idMat,
          id_seccion: idSeccionAsignacion,
        })
        .first()
        .then((r) => r?.id_profesor_materia_seccion));

    if (!asignacionId) {
      await trx.rollback();
      return res.status(500).json({ error: 'No se pudo crear/obtener la asignación' });
    }

    const conflictoHorario = await validarConflictosHorario(trx, {
      idProf,
      idSeccion: idSeccionAsignacion,
      cursoLectivo,
      asignacionId,
      horarios,
    });

    if (conflictoHorario) {
      await trx.rollback();
      return res.status(conflictoHorario.status).json({
        error: conflictoHorario.error,
        detalle: conflictoHorario.detalle,
      });
    }

    for (const h of horarios) {
      await trx('horarioasignacion').insert({
        id_profesor_materia_seccion: asignacionId,
        dia_semana: parseInt(h.dia_semana, 10),
        id_leccion: parseInt(h.id_leccion, 10),
      });
    }

    await trx.commit();

    return res.status(201).json({
      message: 'Asignación creada',
      id_profesor_materia_seccion: asignacionId,
    });
  } catch (e) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    // UNIQUE de horarioasignacion (mismo día+lección dentro de la misma asignación)
    if (e?.code === '23505') {
      return res.status(409).json({
        error: 'Bloque de horario duplicado',
        detalle: 'Ya existe un bloque con el mismo día y lección para esta asignación.',
      });
    }
    throw e;
  }

}

export async function putAsignacion(req, res) {
  const idPms = parseInt(req.params.id, 10);
  if (!Number.isInteger(idPms)) {
    return res.status(400).json({ error: 'id de asignación inválido' });
  }

  const existente = await db('profesor_materia_seccion')
    .where('id_profesor_materia_seccion', idPms)
    .first();

  if (!existente) {
    return res.status(404).json({ error: 'Asignación no encontrada' });
  }

  const { id_persona_profesor, id_materia, id_seccion, horarios } = req.body;
  if (!id_persona_profesor || !id_materia || !id_seccion || !Array.isArray(horarios) || horarios.length === 0) {
    return res.status(400).json({
      error: 'Faltan datos: id_persona_profesor, id_materia, id_seccion, horarios (array de { dia_semana, id_leccion })',
    });
  }

  for (let i = 0; i < horarios.length; i += 1) {
    const err = validarBloqueLeccion(horarios[i], i);
    if (err) return res.status(400).json({ error: err });
  }

  if (contieneLeccionAlmuerzo(horarios)) {
    return res.status(400).json({ error: ERROR_LECCION_ALMUERZO });
  }

  const claves = horarios.map((h) => `${parseInt(h.dia_semana, 10)}-${parseInt(h.id_leccion, 10)}`);
  if (new Set(claves).size !== claves.length) {
    return res.status(400).json({ error: 'Hay bloques duplicados (mismo día y lección)' });
  }

  const idProf = parseInt(id_persona_profesor, 10);
  const idMat = parseInt(id_materia, 10);
  const idSeccionAsignacion = parseInt(id_seccion, 10);
  const cursoLectivo = existente.curso_lectivo;

  const errHab = await validarMateriaHabilitada(idProf, idMat);
  if (errHab) {
    return res.status(400).json({ error: errHab });
  }

  const trx = await db.transaction();
  try {
    const duplicada = await trx('profesor_materia_seccion')
      .where({
        id_persona_profesor: idProf,
        curso_lectivo: cursoLectivo,
        id_materia: idMat,
        id_seccion: idSeccionAsignacion,
      })
      .whereNot('id_profesor_materia_seccion', idPms)
      .first();

    if (duplicada) {
      await trx.rollback();
      return res.status(409).json({
        error: 'Ya existe otra asignación con el mismo docente, materia y sección',
      });
    }

    await trx('profesor_materia_seccion')
      .where('id_profesor_materia_seccion', idPms)
      .update({
        id_persona_profesor: idProf,
        id_materia: idMat,
        id_seccion: idSeccionAsignacion,
      });

    const conflictoHorario = await validarConflictosHorario(trx, {
      idProf,
      idSeccion: idSeccionAsignacion,
      cursoLectivo,
      asignacionId: idPms,
      horarios,
    });

    if (conflictoHorario) {
      await trx.rollback();
      return res.status(conflictoHorario.status).json({
        error: conflictoHorario.error,
        detalle: conflictoHorario.detalle,
      });
    }

    await trx('horarioasignacion').where('id_profesor_materia_seccion', idPms).del();

    for (const h of horarios) {
      await trx('horarioasignacion').insert({
        id_profesor_materia_seccion: idPms,
        dia_semana: parseInt(h.dia_semana, 10),
        id_leccion: parseInt(h.id_leccion, 10),
      });
    }

    await trx.commit();
    return res.json({ message: 'Asignación actualizada correctamente', id_profesor_materia_seccion: idPms });
  } catch (e) {
    try {
      await trx.rollback();
    } catch {
      /* ignore */
    }
    if (e?.code === '23505') {
      return res.status(409).json({
        error: 'Bloque de horario duplicado',
        detalle: 'Ya existe un bloque con el mismo día y lección para esta asignación.',
      });
    }
    throw e;
  }
}

export async function deleteAsignacion(req, res) {
  const idPms = parseInt(req.params.id, 10);
  if (!Number.isInteger(idPms)) {
    return res.status(400).json({ error: 'id de asignación inválido' });
  }

  const existente = await db('profesor_materia_seccion')
    .where('id_profesor_materia_seccion', idPms)
    .first();

  if (!existente) {
    return res.status(404).json({ error: 'Asignación no encontrada' });
  }

  await db('profesor_materia_seccion').where('id_profesor_materia_seccion', idPms).del();

  return res.json({ message: 'Asignación eliminada correctamente' });
}

export async function getAsignacionesCatalogos(req, res) {
  const [materias, secciones, profesores] = await Promise.all([
    getMateriasCatalog(),
    getSeccionesCatalog(),
    db('persona').where({ nombre_rol: 'profesor', activo: true }).select('id_persona', 'nombre_completo')
  ]);
  return res.json({ materias, secciones, profesores });
}

export async function getAsistenciaEstudiantes(req, res) {
  const { id_asignacion, fecha } = req.query;
  if (!id_asignacion) {
    return res.status(400).json({ error: 'id_asignacion es obligatorio' });
  }

  const asignacion = await db('profesor_materia_seccion')
    .where({ id_profesor_materia_seccion: id_asignacion })
    .first();

  if (!asignacion) {
    return res.status(404).json({ error: 'Asignación no encontrada' });
  }

  if (req.user.rol === 'profesor') {
    const fechaConsulta = fecha ? String(fecha).slice(0, 10) : fechaHoyIso();
    const puede = await profesorPuedeAccederAsignacion(req.user.id, id_asignacion, fechaConsulta);
    if (!puede) {
      return res.status(403).json({ error: 'No tiene acceso a esta asignación' });
    }
  }

  const cursoLectivo = await obtenerCursoLectivoActual();

  const estudiantes = await db('matricula as m')
    .select(
      'p.id_persona',
      'p.nombre_completo',
      'm.id_matricula'
    )
    .leftJoin('persona as p', 'm.id_persona_estudiante', 'p.id_persona')
    .where({
      'm.id_curso_lectivo': cursoLectivo,
      'm.id_seccion': asignacion.id_seccion
    })
    .whereNotNull('m.id_seccion')
    .orderBy('p.nombre_completo');

  const fechaConsulta = fecha ? String(fecha).slice(0, 10) : null;
  const idsEstudiantes = estudiantes.map((e) => e.id_persona);
  const estadosMap = fechaConsulta
    ? await obtenerEstadosActivosPorEstudiantes(idsEstudiantes, fechaConsulta)
    : new Map();

  const estudiantesConEstado = estudiantes.map((e) => ({
    ...e,
    estadoEspecial: estadosMap.get(e.id_persona) || null,
  }));

  let asistenciaHoy = [];
  if (fecha) {
    asistenciaHoy = await db('asistencia')
      .where({
        id_profesor_materia_seccion: parseInt(id_asignacion),
        fecha: fecha
      })
      .select('id_persona_estudiante', 'estado', 'observacion', 'fecha_hora');
  }

  return res.json({
    asignacion: {
      id_profesor_materia_seccion: asignacion.id_profesor_materia_seccion,
      id_seccion: asignacion.id_seccion,
      id_materia: asignacion.id_materia
    },
    estudiantes: estudiantesConEstado,
    asistencia_hoy: asistenciaHoy
  });
}

export async function postAsistencia(req, res) {
  const { id_profesor_materia_seccion, fecha, lista } = req.body;
  if (!id_profesor_materia_seccion || !fecha || !Array.isArray(lista)) {
    return res.status(400).json({ error: 'Faltan: id_profesor_materia_seccion, fecha, lista (array de { id_persona_estudiante, estado, observacion? })' });
  }

  const asignacion = await db('profesor_materia_seccion as pms')
    .join('materia as m', 'pms.id_materia', 'm.id_materia')
    .join('seccion as s', 'pms.id_seccion', 's.id_seccion')
    .where('pms.id_profesor_materia_seccion', id_profesor_materia_seccion)
    .select(
      'pms.id_profesor_materia_seccion',
      'pms.id_seccion',
      'pms.id_materia',
      'm.nombre_materia',
      's.nombre_seccion'
    )
    .first();

  if (!asignacion) {
    return res.status(404).json({ error: 'Asignación no encontrada' });
  }

  if (req.user.rol === 'profesor') {
    const fechaStr = typeof fecha === 'string' ? fecha.slice(0, 10) : fechaHoyIso();
    const puede = await profesorPuedeAccederAsignacion(
      req.user.id,
      id_profesor_materia_seccion,
      fechaStr
    );
    if (!puede) {
      return res.status(403).json({ error: 'No puede registrar asistencia para esta asignación' });
    }
  }

  const estadosValidos = ['presente', 'ausente', 'justificado', 'tardanza'];
  const fechaDate = typeof fecha === 'string' ? fecha : fecha;
  const idPms = parseInt(id_profesor_materia_seccion);
  const idsLista = lista.map((item) => parseInt(item.id_persona_estudiante, 10));
  const estadosMap = await obtenerEstadosActivosPorEstudiantes(idsLista, String(fechaDate).slice(0, 10));

  try {
    await db('asistencia')
      .where({ id_profesor_materia_seccion: idPms, fecha: fechaDate })
      .del();

    const registrosInsertados = [];

    for (const item of lista) {
      const idEst = parseInt(item.id_persona_estudiante, 10);
      const especial = estadosMap.get(idEst);
      let estado = (item.estado && estadosValidos.includes(item.estado)) ? item.estado : 'presente';

      if (especial && esEstadoBloqueante(especial.tipo_estado)) {
        estado = estadoAsistenciaForzado(especial.tipo_estado);
      }

      const [insertado] = await db('asistencia')
        .insert({
          id_profesor_materia_seccion: idPms,
          fecha: fechaDate,
          fecha_hora: new Date(),
          id_persona_estudiante: parseInt(item.id_persona_estudiante),
          estado,
          observacion: item.observacion || null,
        })
        .returning(['id_asistencia', 'id_persona_estudiante', 'estado']);

      registrosInsertados.push(insertado);
    }

    dispararNotificacionesAusencias({
      registros: registrosInsertados,
      fecha: fechaDate,
      nombreMateria: asignacion.nombre_materia,
      nombreSeccion: asignacion.nombre_seccion,
    });

    return res.status(201).json({ message: 'Asistencia registrada' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe asistencia para este día; use actualización.' });
    }
    throw error;
  }
}

export async function getHorariosSeccion(req, res) {
  const { id_seccion } = req.query;
  const cursoLectivo = await obtenerCursoLectivoActual();
  if (!id_seccion) {
    return res.status(400).json({ error: 'id_seccion es obligatorio' });
  }
  const horarios = await db('horarioseccion')
    .where({ id_curso_lectivo: cursoLectivo, id_seccion: parseInt(id_seccion) })
    .orderBy('dia_semana');
  return res.json(horarios);
}

export async function postHorariosSeccion(req, res) {
  const { id_seccion, horarios } = req.body;
  if (!id_seccion || !Array.isArray(horarios)) {
    return res.status(400).json({ error: 'Faltan: id_seccion y horarios (array de { dia_semana, hora_entrada, hora_salida })' });
  }
  const cursoLectivo = await obtenerCursoLectivoActual();
  const idSeccion = parseInt(id_seccion);

  await db('horarioseccion').where({ id_curso_lectivo: cursoLectivo, id_seccion: idSeccion }).del();
  for (const h of horarios) {
    await db('horarioseccion').insert({
      id_curso_lectivo: cursoLectivo,
      id_seccion: idSeccion,
      dia_semana: parseInt(h.dia_semana),
      hora_entrada: h.hora_entrada,
      hora_salida: h.hora_salida,
    });
  }
  return res.status(201).json({ message: 'Horario de sección actualizado' });
}
