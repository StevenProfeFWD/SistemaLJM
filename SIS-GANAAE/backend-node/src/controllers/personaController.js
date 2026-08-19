import db from '../db/knex.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { cifrarCookie, descifrarCookie } from '../utils/cookieEncryption.js';
import { cookieAuthOptions, cookieClearOptions } from '../utils/cookieOptions.js';
import configJWT from '../../configjwt.js';
import AppError from '../utils/AppError.js';
import { esAdministradorOperativo, puedeConsultarEstudiantes, puedeListarCatalogoEstudiantes, ROL_PROFESOR } from '../utils/roles.js';
import { obtenerIdsEstudiantesVisiblesParaProfesor } from '../utils/profesorGuiaVisibilidad.js';
import { actualizarEstudianteConEncargado } from '../services/estudianteService.js';
import {
  firmarTokenAcceso,
  firmarTokenPendientePassword,
  revocarDecoded,
  limpiarRevocadosExpirados,
} from '../services/tokenRevocationService.js';

const { jwtSecret, jwtExpiresIn } = configJWT;
const JWT_VERIFY_OPTS = { algorithms: ['HS256'] };
const esVacio = (value) => value == null || (typeof value === 'string' && value.trim() === '');

export async function getPersonas(req, res) {
  const personas = await db.select('*').from('persona');
  return res.json(personas);
}

export async function getEstudiantes(req, res) {
  const rol = req.user?.rol;
  if (!puedeListarCatalogoEstudiantes(rol)) {
    throw new AppError('No autorizado', 403);
  }

  const { q = '', includeArchived, incluirInactivos, estado } = req.query;
  const filtro = String(q).trim().toLowerCase();

  const soloArchivados =
    estado === 'archivado' ||
    incluirInactivos === 'true' ||
    includeArchived === 'only';

  let idsVisiblesProfesor = null;
  if (rol === ROL_PROFESOR) {
    idsVisiblesProfesor = await obtenerIdsEstudiantesVisiblesParaProfesor(req.user.id);
    if (!idsVisiblesProfesor.length) {
      return res.json([]);
    }
  }

  let query = db('persona as p')
    .select(
      'p.id_persona',
      'p.nombre_completo',
      'p.cedula',
      'p.correo',
      'p.telefono',
      'p.direccion',
      'p.fecha_nacimiento',
      'p.activo'
    )
    .where('p.nombre_rol', 'estudiante');

  if (idsVisiblesProfesor) {
    query = query.whereIn('p.id_persona', idsVisiblesProfesor);
  }

  if (soloArchivados) {
    query = query.andWhere('p.activo', false);
  } else {
    query = query.andWhere('p.activo', true);
  }
  if (filtro) {
    query = query.andWhere((qb) =>
      qb.whereRaw('LOWER(p.nombre_completo) LIKE ?', [`%${filtro}%`])
        .orWhereRaw('LOWER(p.cedula) LIKE ?', [`%${filtro}%`])
    );
  }

  const estudiantes = await query.orderBy('p.nombre_completo', 'asc');
  if (estudiantes.length === 0) {
    return res.json([]);
  }

  const anioVigente = new Date().getFullYear();
  const ids = estudiantes.map((e) => e.id_persona);

  // Batch: matrículas + curso + sección + tutor del año vigente (evita N+1)
  const mats = await db('matricula as m')
    .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .leftJoin('persona as t', 'm.id_persona_tutor', 't.id_persona')
    .whereIn('m.id_persona_estudiante', ids)
    .select(
      'm.id_persona_estudiante',
      'm.id_matricula',
      'm.estado',
      'm.ano_a_cursar',
      'm.fecha_matricula',
      'cl.anio_curso_lectivo',
      's.id_seccion',
      's.nombre_seccion',
      't.id_persona as tutor_id_persona',
      't.nombre_completo as tutor_nombre_completo',
      't.cedula as tutor_cedula',
      't.correo as tutor_correo',
      't.telefono as tutor_telefono'
    )
    .orderBy('cl.anio_curso_lectivo', 'desc')
    .orderBy('m.fecha_matricula', 'desc');

  const matriculaActualByEst = new Map();
  const tutorMatriculaByEst = new Map();

  for (const row of mats) {
    const idEst = row.id_persona_estudiante;
    if (!matriculaActualByEst.has(idEst)) {
      matriculaActualByEst.set(idEst, {
        id_matricula: row.id_matricula,
        estado: row.estado,
        ano_a_cursar: row.ano_a_cursar,
        anio_curso_lectivo: row.anio_curso_lectivo,
        id_seccion: row.id_seccion,
        nombre_seccion: row.nombre_seccion,
      });
    }
    if (
      Number(row.anio_curso_lectivo) === anioVigente &&
      !tutorMatriculaByEst.has(idEst)
    ) {
      tutorMatriculaByEst.set(idEst, {
        id_persona: row.tutor_id_persona,
        nombre_completo: row.tutor_nombre_completo,
        cedula: row.tutor_cedula,
        correo: row.tutor_correo,
        telefono: row.tutor_telefono,
      });
    }
  }

  const idsSinTutor = ids.filter((id) => !tutorMatriculaByEst.get(id)?.id_persona);
  const encargadoByEst = new Map();

  if (idsSinTutor.length > 0) {
    const encargados = await db('encargado_estudiante as ee')
      .leftJoin('persona as t', 'ee.id_persona_encargado', 't.id_persona')
      .whereIn('ee.id_persona_estudiante', idsSinTutor)
      .orderBy('ee.fecha', 'desc')
      .select(
        'ee.id_persona_estudiante',
        't.id_persona',
        't.nombre_completo',
        't.cedula',
        't.correo',
        't.telefono'
      );

    for (const row of encargados) {
      if (!encargadoByEst.has(row.id_persona_estudiante)) {
        encargadoByEst.set(row.id_persona_estudiante, {
          id_persona: row.id_persona,
          nombre_completo: row.nombre_completo,
          cedula: row.cedula,
          correo: row.correo,
          telefono: row.telefono,
        });
      }
    }
  }

  const detalle = estudiantes.map((e) => {
    let tutor = tutorMatriculaByEst.get(e.id_persona);
    if (!tutor?.id_persona) {
      tutor = encargadoByEst.get(e.id_persona);
    }
    const matriculaActual = matriculaActualByEst.get(e.id_persona) || null;

    return {
      ...e,
      tutor: tutor || null,
      seccion_actual: matriculaActual?.nombre_seccion || null,
      matricula_actual: matriculaActual,
    };
  });

  return res.json(detalle);
}

export async function getEstudianteDetalle(req, res) {
  if (!puedeConsultarEstudiantes(req.user.rol)) {
    throw new AppError('No autorizado', 403);
  }

  const { id } = req.params;
  const idEst = parseInt(id, 10);
  if (!Number.isInteger(idEst)) {
    throw new AppError('Identificador inválido', 400);
  }

  // Profesor: solo alumnos de su grupo guía o secciones asignadas (anti-IDOR)
  if (req.user.rol === ROL_PROFESOR) {
    const idsVisibles = await obtenerIdsEstudiantesVisiblesParaProfesor(req.user.id);
    const permitido = idsVisibles.some((x) => Number(x) === idEst);
    if (!permitido) {
      throw new AppError('No autorizado para consultar este estudiante', 403);
    }
  }

  const estudiante = await db('persona as p')
    .select(
      'p.id_persona',
      'p.nombre_completo',
      'p.cedula',
      'p.correo',
      'p.telefono',
      'p.direccion',
      'p.fecha_nacimiento',
      'p.activo'
    )
    .where({ 'p.id_persona': idEst, 'p.nombre_rol': 'estudiante' })
    .first();

  if (!estudiante) throw new AppError('Estudiante no encontrado', 404);

  const anioVigente = new Date().getFullYear();

  const matriculaTutor = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('persona as t', 'm.id_persona_tutor', 't.id_persona')
    .where('m.id_persona_estudiante', idEst)
    .andWhere('cl.anio_curso_lectivo', anioVigente)
    .select('t.id_persona', 't.nombre_completo', 't.cedula', 't.correo', 't.telefono')
    .first();

  let tutor = matriculaTutor?.id_persona
    ? { ...matriculaTutor, fecha: null, patria_potestad: null }
    : null;

  if (!tutor?.id_persona) {
    tutor = await db('encargado_estudiante as ee')
      .leftJoin('persona as t', 'ee.id_persona_encargado', 't.id_persona')
      .where('ee.id_persona_estudiante', idEst)
      .orderBy('ee.fecha', 'desc')
      .select(
        't.id_persona',
        't.nombre_completo',
        't.cedula',
        't.correo',
        't.telefono',
        'ee.fecha',
        'ee.patria_potestad'
      )
      .first();
  }

  const matriculas = await db('matricula as m')
    .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('m.id_persona_estudiante', idEst)
    .orderBy('cl.anio_curso_lectivo', 'desc')
    .orderBy('m.fecha_matricula', 'desc')
    .select('m.id_matricula', 'm.estado', 'm.ano_a_cursar', 'm.fecha_matricula', 'cl.anio_curso_lectivo', 's.nombre_seccion');

  return res.json({
    ...estudiante,
    tutor: tutor
      ? {
          ...tutor,
          parentesco: tutor.patria_potestad ? 'Tutor legal' : 'Encargado'
        }
      : null,
    matriculas
  });
}

export async function actualizarEstudiante(req, res) {
  const result = await actualizarEstudianteConEncargado(req.params.id, req.body);
  return res.json(result);
}

export async function archivarEstudiante(req, res) {
  const { id } = req.params;
  const { activo = false } = req.body;

  const updated = await db('persona')
    .where({ id_persona: id, nombre_rol: 'estudiante' })
    .update({ activo: Boolean(activo) });

  if (!updated) throw new AppError('Estudiante no encontrado', 404);
  return res.json({ message: Boolean(activo) ? 'Estudiante reactivado' : 'Estudiante archivado' });
}

export async function postPersona(req, res) {
  if (!esAdministradorOperativo(req.user?.rol)) {
    return res.status(403).json({ message: 'Solo los administradores operativos pueden registrar personas' });
  }

  const {
    nombre_completo,
    cedula,
    correo,
    telefono,
    direccion,
    fecha_nacimiento,
    nombre_rol,
    materias_habilitadas: materiasHabilitadasBody
  } = req.body;

  if (!nombre_completo || !cedula || !correo || !telefono || !direccion || !fecha_nacimiento || !nombre_rol) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  if (nombre_rol === 'estudiante') {
    return res.status(403).json({
      message: 'Los estudiantes solo se registran mediante el módulo de matrícula.',
    });
  }

  if (nombre_rol === 'administrador' || nombre_rol === 'super_administrador') {
    return res.status(403).json({
      message: 'Los administradores solo pueden ser creados por un Super Administrador.',
    });
  }

  const rolesPermitidosRegistro = ['profesor', 'orientador', 'padre_de_familia'];
  if (!rolesPermitidosRegistro.includes(nombre_rol)) {
    return res.status(400).json({ message: 'Rol no permitido en el registro de personas.' });
  }

  const materiasHabilitadas = Array.isArray(materiasHabilitadasBody)
    ? [...new Set(materiasHabilitadasBody.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n)))]
    : [];

  if (nombre_rol === 'profesor' && materiasHabilitadas.length === 0) {
    return res.status(400).json({
      message: 'Los docentes deben tener al menos una materia habilitada según su formación.'
    });
  }

  const correoExistente = await db('persona').where({ correo }).first();
  const cedulaExistente = await db('persona').where({ cedula }).first();

  if (correoExistente) {
    return res.status(409).json({ message: 'El correo existe en la información almacenada.' });
  }

  if (cedulaExistente) {
    return res.status(409).json({ message: 'La cedúla existe en la información almacenada.' });
  }

  await db.transaction(async (trx) => {
    const [inserted] = await trx('persona')
      .insert({
        nombre_completo,
        cedula,
        correo,
        telefono,
        direccion,
        fecha_nacimiento,
        nombre_rol
      })
      .returning('id_persona');

    const idPersona = inserted?.id_persona ?? inserted;

    if (nombre_rol === 'profesor' && materiasHabilitadas.length > 0) {
      const rows = materiasHabilitadas.map((id_materia) => ({
        id_persona_profesor: idPersona,
        id_materia
      }));
      await trx('profesor_materia_habilitacion').insert(rows);
    }
  });

  return res.status(201).json({
    message: 'Persona registrada correctamente en la base de datos'
  });
}

/** Docente: materias habilitadas (solo administrador). */
export async function getMateriasHabilitadasProfesor(req, res) {
  if (req.user.rol !== 'administrador') {
    throw new AppError('Solo los administradores pueden consultar esta información', 403);
  }

  const { id } = req.params;
  const persona = await db('persona').where({ id_persona: id }).first();
  if (!persona) throw new AppError('Persona no encontrada', 404);
  if (persona.nombre_rol !== 'profesor') {
    throw new AppError('La persona no es docente', 400);
  }

  const materias = await db('profesor_materia_habilitacion as pmh')
    .join('materia as m', 'pmh.id_materia', 'm.id_materia')
    .where('pmh.id_persona_profesor', id)
    .select('m.id_materia', 'm.nombre_materia')
    .orderBy('m.nombre_materia');

  return res.json({ id_persona: Number(id), materias });
}

/** Reemplaza el conjunto de materias habilitadas (solo administrador). */
export async function putMateriasHabilitadasProfesor(req, res) {
  if (req.user.rol !== 'administrador') {
    throw new AppError('Solo los administradores pueden modificar materias habilitadas', 403);
  }

  const { id } = req.params;
  const { id_materias: idMateriasBody } = req.body;
  if (!Array.isArray(idMateriasBody)) {
    throw new AppError('Debe enviar id_materias (array de números)', 400);
  }

  const idMaterias = [...new Set(idMateriasBody.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)))];

  const persona = await db('persona').where({ id_persona: id }).first();
  if (!persona) throw new AppError('Persona no encontrada', 404);
  if (persona.nombre_rol !== 'profesor') {
    throw new AppError('La persona no es docente', 400);
  }

  await db.transaction(async (trx) => {
    const actuales = await trx('profesor_materia_habilitacion')
      .where({ id_persona_profesor: id })
      .pluck('id_materia');

    const nuevoSet = new Set(idMaterias);
    const quitadas = actuales.filter((mid) => !nuevoSet.has(mid));

    for (const mid of quitadas) {
      const enUso = await trx('profesor_materia_seccion')
        .where({ id_persona_profesor: id, id_materia: mid })
        .first();
      if (enUso) {
        throw new AppError(
          'No puede quitar una materia para la que el docente ya tiene asignaciones registradas. Quite primero esas asignaciones.',
          400
        );
      }
    }

    if (idMaterias.length === 0) {
      const tieneAsignaciones = await trx('profesor_materia_seccion').where({ id_persona_profesor: id }).first();
      if (tieneAsignaciones) {
        throw new AppError(
          'No puede dejar al docente sin materias habilitadas mientras tenga asignaciones de carga lectiva.',
          400
        );
      }
    }

    await trx('profesor_materia_habilitacion').where({ id_persona_profesor: id }).del();
    if (idMaterias.length > 0) {
      await trx('profesor_materia_habilitacion').insert(
        idMaterias.map((id_materia) => ({
          id_persona_profesor: Number(id),
          id_materia
        }))
      );
    }
  });

  return res.json({ message: 'Materias habilitadas actualizadas' });
}

export async function loginPersona(req, res) {
  const { correo, contrasena } = req.body;

  // Buscar la persona por correo
  const persona = await db('persona')
    .where({ correo })
    .first();

  if (!persona) {
    return res.status(401).json({ error: 'Correo no registrado' });
  }

  if (persona.activo === false) {
    return res.status(403).json({ error: 'Su cuenta está inactiva. Contacte a la administración del liceo.' });
  }

  // Buscar el usuario asociado a ese correo
  const usuario = await db('usuariosistema')
    .where({ persona_id: persona.id_persona })
    .first();

  if (!usuario) {
    return res.status(401).json({ error: 'Usuario no encontrado' });
  }

  if (usuario.activo === false) {
    return res.status(403).json({ error: 'Su cuenta está inactiva. Contacte a la administración del liceo.' });
  }

  // Verificar la contraseña
  const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

  if (!contrasenaValida) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  //Verificar si es el primer login
  if (usuario.primer_login == true) {
    const pendingToken = firmarTokenPendientePassword(persona.id_persona);
    return res
      .cookie('pending_password_change', cifrarCookie(pendingToken), cookieAuthOptions({ maxAgeMs: 1000 * 60 * 10 }))
      .json({
        mensaje: 'Debe cambiar su contraseña generica a una de uso personal',
        usuario: {
          id: persona.id_persona,
          nombre_completo: persona.nombre_completo,
          correo: persona.correo,
          rol: persona.nombre_rol,
          primer_login: true
        },
      });
  }

  const token = firmarTokenAcceso(
    { id: persona.id_persona, correo: persona.correo, rol: persona.nombre_rol },
    jwtExpiresIn
  );

  return res
    .cookie('token', cifrarCookie(token), cookieAuthOptions({ maxAgeMs: 1000 * 60 * 60 }))
    .json({
      mensaje: 'Login exitoso',
      usuario: {
        id: persona.id_persona,
        nombre_completo: persona.nombre_completo,
        correo: persona.correo,
        rol: persona.nombre_rol,
        primer_login: false
      }
    });
}

async function revocarTokenDesdeCookie(valorCifrado) {
  const plain = descifrarCookie(valorCifrado);
  if (!plain) return;
  try {
    const decoded = jwt.verify(plain, jwtSecret, JWT_VERIFY_OPTS);
    await revocarDecoded(decoded);
  } catch {
    // Token ya inválido/expirado: no hay nada que revocar
  }
}

export async function logoutPersona(req, res) {
  await Promise.all([
    revocarTokenDesdeCookie(req.cookies?.token),
    revocarTokenDesdeCookie(req.cookies?.pending_password_change),
  ]);
  void limpiarRevocadosExpirados();

  return res
    .clearCookie('token', cookieClearOptions())
    .clearCookie('pending_password_change', cookieClearOptions())
    .json({ mensaje: 'Sesión cerrada correctamente' });
}

export async function patchPersonaPassword(req, res) {
  const { id } = req.params;
  const { contrasena_hash } = req.body;

  if (!contrasena_hash) {
    return res.status(400).json({ error: 'Debe enviar la nueva contraseña' });
  }

  const usuario = await db('usuariosistema')
    .where({ persona_id: id })
    .first();

  if (!usuario) {
    return res.status(404).json({ error: 'Usuario del sistema no encontrado' });
  }

  const hash = await bcrypt.hash(contrasena_hash, 10);

  await db('usuariosistema')
    .where({ persona_id: id })
    .update({
      contrasena_hash: hash,
      primer_login: false
    });

  // Invalida el token pendiente de primer login si existía
  await revocarTokenDesdeCookie(req.cookies?.pending_password_change);

  const persona = await db('persona').where({ id_persona: id }).first();
  const token = firmarTokenAcceso(
    { id: persona.id_persona, correo: persona.correo, rol: persona.nombre_rol },
    jwtExpiresIn
  );

  return res
    .clearCookie('pending_password_change', cookieClearOptions())
    .cookie('token', cifrarCookie(token), cookieAuthOptions({ maxAgeMs: 1000 * 60 * 60 }))
    .json({
      mensaje: 'Contraseña cambiada exitosamente',
      respuesta: true
    });
}

export async function getSesion(req, res) {
  const persona = await db('persona')
    .where({ id_persona: req.user.id })
    .first();
  if (!persona) {
    return res.status(404).json({ error: 'Persona no encontrada' });
  }
  return res.json({
    id: persona.id_persona,
    nombre_completo: persona.nombre_completo,
    correo: persona.correo,
    rol: persona.nombre_rol
  });
}

export async function getMisEstudiantes(req, res) {
  if (req.user.rol !== 'padre_de_familia') {
    return res.status(403).json({ error: 'Solo tutores pueden ver esta información' });
  }

  const anioVigente = new Date().getFullYear();

  const idsPorEncargado = await db('encargado_estudiante as ee')
    .where('ee.id_persona_encargado', req.user.id)
    .pluck('ee.id_persona_estudiante');

  const idsPorMatriculaActual = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .where('m.id_persona_tutor', req.user.id)
    .andWhere('cl.anio_curso_lectivo', anioVigente)
    .pluck('m.id_persona_estudiante');

  const idsUnicos = [...new Set([...idsPorEncargado, ...idsPorMatriculaActual])];

  if (idsUnicos.length === 0) {
    return res.json([]);
  }

  const estudiantes = await db('persona as p')
    .select('p.id_persona', 'p.nombre_completo', 'p.cedula', 'p.correo')
    .whereIn('p.id_persona', idsUnicos)
    .orderBy('p.nombre_completo', 'asc');

  const conMatriculas = await Promise.all(estudiantes.map(async (e) => {
    const mats = await db('matricula as m')
      .leftJoin('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
      .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
      .where('m.id_persona_estudiante', e.id_persona)
      .select('m.id_matricula', 'm.estado', 'm.ano_a_cursar', 'cl.anio_curso_lectivo', 's.nombre_seccion')
      .orderBy('cl.anio_curso_lectivo', 'desc');
    return { ...e, matriculas: mats };
  }));

  return res.json(conMatriculas);
}

