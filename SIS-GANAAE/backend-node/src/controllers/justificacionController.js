import {
  listarJustificaciones,
  obtenerJustificacionPorId,
  obtenerJustificacionPorAsistencia,
  crearJustificacion,
} from '../services/justificacionService.js';

/** GET /justificaciones — historial filtrado y paginado (alcance por rol). */
export async function getJustificaciones(req, res) {
  const { fecha_inicio, fecha_fin, id_seccion, tipo_justificacion, busqueda, page, limit } = req.query;
  const resultado = await listarJustificaciones(req.user, {
    fecha_inicio,
    fecha_fin,
    id_seccion,
    tipo_justificacion,
    busqueda,
    page,
    limit,
  });
  return res.json(resultado);
}

/** GET /justificaciones/:id — detalle de una justificación. */
export async function getJustificacionPorId(req, res) {
  const justificacion = await obtenerJustificacionPorId(req.user, req.params.id);
  return res.json(justificacion);
}

/** GET /justificaciones/asistencia/:id_asistencia — justificación de un registro de asistencia. */
export async function getJustificacionPorAsistencia(req, res) {
  const justificacion = await obtenerJustificacionPorAsistencia(req.user, req.params.id_asistencia);
  return res.json({ justificacion });
}

/** POST /justificaciones — registrar justificación de una ausencia/tardanza. */
export async function postJustificacion(req, res) {
  const justificacion = await crearJustificacion(req.user, req.body);
  return res.status(201).json({ message: 'Justificación registrada', justificacion });
}
