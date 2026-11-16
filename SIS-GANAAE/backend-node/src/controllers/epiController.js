import {
  obtenerReporteAsistenciaEpi,
  listarEstudiantesSeccionEpi,
} from '../services/epiReportesService.js';
import { pipeReporteAsistenciaEpiPdf } from '../services/pdfService.js';

export async function getReporteAsistenciaEpi(req, res) {
  const datos = await obtenerReporteAsistenciaEpi(req.query);
  return res.json(datos);
}

export async function getEstudiantesSeccionEpi(req, res) {
  const datos = await listarEstudiantesSeccionEpi(req.params.idSeccion, req.query);
  return res.json(datos);
}

export async function getReporteAsistenciaEpiPdf(req, res) {
  const datos = await obtenerReporteAsistenciaEpi(req.query, { incluirDetalle: true });
  const { periodo, fecha_inicio, fecha_fin } = datos.filtros;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=reporte_asistencia_epi_${periodo}_${fecha_inicio}_${fecha_fin}.pdf`
  );
  await pipeReporteAsistenciaEpiPdf(res, datos);
}
