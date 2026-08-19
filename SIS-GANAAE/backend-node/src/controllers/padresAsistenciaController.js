import {
  assertPadrePuedeVerEstudiante,
  consultarHistorialAsistenciaHijo,
  obtenerReporteAsistenciaPadre,
} from '../services/padresAsistenciaService.js';
import { listEstadosEspecialesHijo } from '../services/padresEstadosService.js';
import { obtenerDashboardHijo } from '../services/padresDashboardService.js';
import { pipeReporteAsistenciaHijoPdf } from '../services/pdfService.js';

export async function getAsistenciaHijos(req, res) {
  const { id_estudiante, fecha_inicio, fecha_fin } = req.query;

  if (!id_estudiante) {
    return res.status(400).json({ error: 'id_estudiante es obligatorio' });
  }

  try {
    const id = await assertPadrePuedeVerEstudiante(req.user.id, id_estudiante);
    const datos = await consultarHistorialAsistenciaHijo(id, fecha_inicio, fecha_fin);
    return res.json(datos);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al consultar asistencia' });
  }
}

export async function getReporteAsistenciaPdf(req, res) {
  const { id_estudiante, fecha_inicio, fecha_fin } = req.query;

  if (!id_estudiante) {
    return res.status(400).json({ error: 'id_estudiante es obligatorio' });
  }

  try {
    const reporte = await obtenerReporteAsistenciaPadre(
      req.user.id,
      id_estudiante,
      fecha_inicio,
      fecha_fin
    );

    const slug = String(reporte.estudiante.nombre_completo || 'estudiante')
      .replace(/\s+/g, '_')
      .replace(/[^\w\-]/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=reporte_asistencia_${slug}_${reporte.rango.fecha_inicio}_${reporte.rango.fecha_fin}.pdf`
    );

    await pipeReporteAsistenciaHijoPdf(res, reporte);
  } catch (e) {
    const status = e.status || 500;
    if (!res.headersSent) {
      return res.status(status).json({ error: e.message || 'Error al generar el PDF' });
    }
  }
}

export async function getEstadosEspecialesHijos(req, res) {
  const { id_estudiante } = req.query;

  if (!id_estudiante) {
    return res.status(400).json({ error: 'id_estudiante es obligatorio' });
  }

  try {
    const datos = await listEstadosEspecialesHijo(req.user.id, id_estudiante);
    return res.json(datos);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al consultar estados especiales' });
  }
}

export async function getDashboardHijo(req, res) {
  const { id_estudiante } = req.query;

  if (!id_estudiante) {
    return res.status(400).json({ error: 'id_estudiante es obligatorio' });
  }

  try {
    const datos = await obtenerDashboardHijo(req.user.id, id_estudiante);
    return res.json(datos);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al cargar el panel' });
  }
}
