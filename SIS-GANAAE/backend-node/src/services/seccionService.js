import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import { MAX_ESTUDIANTES_POR_SECCION } from '../utils/seccionHelper.js';
import {
  invalidateSeccionesCache,
} from './catalogCacheService.js';

export const MAX_SECCIONES_GUIA_POR_PROFESOR = 2;

async function obtenerAnioCursoActual() {
  return new Date().getFullYear();
}

export async function listarSeccionesConGuia() {
  const anio = await obtenerAnioCursoActual();

  const secciones = await db('seccion as s')
    .leftJoin('persona as pg', 's.id_persona_profesor_guia', 'pg.id_persona')
    .select(
      's.id_seccion',
      's.nombre_seccion',
      's.numero_seccion',
      's.id_persona_profesor_guia',
      'pg.nombre_completo as nombre_profesor_guia'
    )
    .orderBy('s.nombre_seccion', 'asc');

  const curso = await db('curso_lectivo').where({ anio_curso_lectivo: anio }).first();
  let conteosPorSeccion = new Map();

  if (curso) {
    const conteos = await db('matricula as m')
      .where('m.id_curso_lectivo', curso.id_curso_lectivo)
      .where('m.estado', 'activa')
      .whereNotNull('m.id_seccion')
      .groupBy('m.id_seccion')
      .select('m.id_seccion')
      .count('* as total');

    conteosPorSeccion = new Map(
      conteos.map((c) => [c.id_seccion, parseInt(c.total, 10)])
    );
  }

  const profesores = await db('persona')
    .where({ nombre_rol: 'profesor', activo: true })
    .select('id_persona', 'nombre_completo')
    .orderBy('nombre_completo', 'asc');

  return {
    anio_curso_lectivo: anio,
    max_secciones_guia_por_profesor: MAX_SECCIONES_GUIA_POR_PROFESOR,
    cupo_maximo_por_seccion: MAX_ESTUDIANTES_POR_SECCION,
    secciones: secciones.map((s) => {
      const totalActivos = conteosPorSeccion.get(s.id_seccion) || 0;
      return {
        id_seccion: s.id_seccion,
        nombre_seccion: s.nombre_seccion,
        numero_seccion: s.numero_seccion,
        id_persona_profesor_guia: s.id_persona_profesor_guia,
        nombre_profesor_guia: s.nombre_profesor_guia || null,
        total_estudiantes: totalActivos,
        cupos_disponibles: Math.max(0, MAX_ESTUDIANTES_POR_SECCION - totalActivos),
      };
    }),
    profesores,
  };
}

export async function asignarProfesorGuia(idSeccion, idPersonaProfesor) {
  const idSec = parseInt(idSeccion, 10);
  const idProf = parseInt(idPersonaProfesor, 10);

  if (!Number.isInteger(idSec)) {
    throw new AppError('id_seccion inválido', 400);
  }
  if (!Number.isInteger(idProf)) {
    throw new AppError('id_persona_profesor inválido', 400);
  }

  const seccion = await db('seccion').where('id_seccion', idSec).first();
  if (!seccion) {
    throw new AppError('Sección no encontrada', 404);
  }

  const profesor = await db('persona')
    .where({ id_persona: idProf, nombre_rol: 'profesor', activo: true })
    .first();

  if (!profesor) {
    throw new AppError('Docente no encontrado o inactivo', 404);
  }

  if (seccion.id_persona_profesor_guia === idProf) {
    return {
      message: `El docente ya es profesor guía de la sección ${seccion.nombre_seccion}.`,
      id_seccion: idSec,
      nombre_seccion: seccion.nombre_seccion,
      id_persona_profesor_guia: idProf,
      nombre_profesor_guia: profesor.nombre_completo,
    };
  }

  const otrasSecciones = await db('seccion')
    .where('id_persona_profesor_guia', idProf)
    .whereNot('id_seccion', idSec)
    .select('id_seccion', 'nombre_seccion');

  if (otrasSecciones.length >= MAX_SECCIONES_GUIA_POR_PROFESOR) {
    const nombres = otrasSecciones.map((s) => s.nombre_seccion).join(', ');
    throw new AppError(
      `El docente ya es profesor guía del máximo recomendado (${MAX_SECCIONES_GUIA_POR_PROFESOR}) de secciones: ${nombres}`,
      400
    );
  }

  await db('seccion')
    .where('id_seccion', idSec)
    .update({ id_persona_profesor_guia: idProf });

  invalidateSeccionesCache();

  return {
    message: `Profesor asignado como guía de la sección ${seccion.nombre_seccion} exitosamente.`,
    id_seccion: idSec,
    nombre_seccion: seccion.nombre_seccion,
    id_persona_profesor_guia: idProf,
    nombre_profesor_guia: profesor.nombre_completo,
  };
}

export async function revocarProfesorGuia(idSeccion) {
  const idSec = parseInt(idSeccion, 10);
  if (!Number.isInteger(idSec)) {
    throw new AppError('id_seccion inválido', 400);
  }

  const seccion = await db('seccion').where('id_seccion', idSec).first();
  if (!seccion) {
    throw new AppError('Sección no encontrada', 404);
  }

  await db('seccion')
    .where('id_seccion', idSec)
    .update({ id_persona_profesor_guia: null });

  invalidateSeccionesCache();

  return {
    message: `Profesor guía removido de la sección ${seccion.nombre_seccion}.`,
    id_seccion: idSec,
    nombre_seccion: seccion.nombre_seccion,
  };
}
