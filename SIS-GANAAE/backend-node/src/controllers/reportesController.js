import {
  obtenerEstadisticasReportes,
  obtenerAlertasPermanencia,
} from '../services/reportesService.js';

export async function getEstadisticasReportes(req, res) {
  try {
    const datos = await obtenerEstadisticasReportes(req.query);
    return res.json(datos);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al generar estadísticas' });
  }
}

export async function getPermanenciaAlertas(req, res) {
  try {
    const datos = await obtenerAlertasPermanencia(req.query);
    return res.json(datos);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al consultar alertas' });
  }
}
