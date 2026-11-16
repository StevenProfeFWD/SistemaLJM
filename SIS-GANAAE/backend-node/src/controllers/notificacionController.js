import { listarNotificaciones } from '../services/notificacionHistorialService.js';

export async function getNotificaciones(req, res) {
  const resultado = await listarNotificaciones(req.query);
  return res.json({
    status: 'success',
    pagination: resultado.pagination,
    data: resultado.data,
    catalogos: resultado.catalogos,
    filtros: resultado.filtros,
  });
}
