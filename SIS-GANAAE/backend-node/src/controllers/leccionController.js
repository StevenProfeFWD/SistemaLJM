import { getLeccionesCatalog } from '../services/catalogCacheService.js';

export async function getLecciones(req, res) {
  const lecciones = await getLeccionesCatalog();
  return res.json(lecciones);
}