import db from '../db/knex.js';
import AppError from '../utils/AppError.js';
import {
  getMateriasCatalog,
  invalidateMateriasCache,
} from '../services/catalogCacheService.js';

/** Trim + capitalización por palabra (título) */
export function normalizeNombreMateria(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => (w.length === 0 ? '' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

async function findByNombreNormalizado(nombreNormalizado, excludeId = null) {
  let q = db('materia').whereRaw('lower(trim(both from nombre_materia)) = ?', [
    nombreNormalizado.toLowerCase()
  ]);
  if (excludeId != null) {
    q = q.andWhereNot('id_materia', excludeId);
  }
  return q.first();
}

export async function getMaterias(req, res) {
  const rows = await getMateriasCatalog();
  return res.json(rows);
}

export async function postMateria(req, res) {
  const { nombre_materia, descripcion } = req.body;
  if (!nombre_materia || typeof nombre_materia !== 'string') {
    throw new AppError('El nombre de la materia es obligatorio', 400);
  }

  const nombre = normalizeNombreMateria(nombre_materia);
  if (!nombre) {
    throw new AppError('El nombre de la materia no puede quedar vacío', 400);
  }

  const dupe = await findByNombreNormalizado(nombre);
  if (dupe) {
    return res.status(409).json({ error: 'Ya existe una materia con ese nombre.' });
  }

  const desc =
    descripcion != null && String(descripcion).trim() !== '' ? String(descripcion).trim() : null;

  try {
    const [inserted] = await db('materia')
      .insert({ nombre_materia: nombre, descripcion: desc })
      .returning('*');
    invalidateMateriasCache();
    return res.status(201).json(inserted);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una materia con ese nombre.' });
    }
    throw err;
  }
}

export async function putMateria(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    throw new AppError('Identificador inválido', 400);
  }

  const existente = await db('materia').where({ id_materia: id }).first();
  if (!existente) {
    throw new AppError('Materia no encontrada', 404);
  }

  const { nombre_materia, descripcion } = req.body;
  const updates = {};

  if (nombre_materia !== undefined) {
    if (typeof nombre_materia !== 'string') {
      throw new AppError('nombre_materia inválido', 400);
    }
    const nombre = normalizeNombreMateria(nombre_materia);
    if (!nombre) {
      throw new AppError('El nombre de la materia no puede quedar vacío', 400);
    }
    const dupe = await findByNombreNormalizado(nombre, id);
    if (dupe) {
      return res.status(409).json({ error: 'Ya existe una materia con ese nombre.' });
    }
    updates.nombre_materia = nombre;
  }

  if (descripcion !== undefined) {
    updates.descripcion =
      descripcion != null && String(descripcion).trim() !== '' ? String(descripcion).trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No hay cambios que aplicar', 400);
  }

  try {
    await db('materia').where({ id_materia: id }).update(updates);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una materia con ese nombre.' });
    }
    throw err;
  }

  const actualizada = await db('materia').where({ id_materia: id }).first();
  invalidateMateriasCache();
  return res.json(actualizada);
}

export async function deleteMateria(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    throw new AppError('Identificador inválido', 400);
  }

  const existente = await db('materia').where({ id_materia: id }).first();
  if (!existente) {
    throw new AppError('Materia no encontrada', 404);
  }

  const [pmh, pms, mat] = await Promise.all([
    db('profesor_materia_habilitacion').where({ id_materia: id }).first(),
    db('profesor_materia_seccion').where({ id_materia: id }).first(),
    db('matricula').where({ id_materia: id }).first()
  ]);

  if (pmh || pms || mat) {
    return res.status(409).json({
      error: 'No se puede eliminar: La materia tiene registros vinculados'
    });
  }

  await db('materia').where({ id_materia: id }).del();
  invalidateMateriasCache();
  return res.status(204).send();
}
