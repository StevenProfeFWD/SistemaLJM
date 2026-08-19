import {
  listarEstadosPeriodo,
  crearEstadoPeriodo,
  actualizarEstadoPeriodo,
  anularEstadoPeriodo,
  buscarEstudiantesOrientacion,
  listarHistorialOrientacion,
  obtenerRegistroHistorialPorId,
  eliminarEstadoPeriodo,
} from '../services/orientacionService.js';
import {
  pipeComprobanteOrientacionPdf,
  pipeReporteOrientacionFiltradoPdf,
} from '../services/pdfService.js';

export async function getBuscarEstudiantesOrientacion(req, res) {
  try {
    const resultados = await buscarEstudiantesOrientacion({
      q: req.query.q,
      id_estudiante: req.query.id_estudiante,
    });
    return res.json(resultados);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error en la búsqueda' });
  }
}

export async function getHistorialOrientacion(req, res) {
  try {
    const datos = await listarHistorialOrientacion(req.query);
    return res.json(datos);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al consultar historial' });
  }
}

export async function getComprobanteOrientacionPdf(req, res) {
  try {
    const registro = req.estadoPeriodo || (await obtenerRegistroHistorialPorId(req.params.id));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=comprobante_orientacion_${registro.id_estado_periodo}.pdf`
    );
    await pipeComprobanteOrientacionPdf(res, registro);
  } catch (e) {
    const status = e.status || 500;
    if (!res.headersSent) {
      return res.status(status).json({ error: e.message || 'Error al generar PDF' });
    }
  }
}

export async function getReporteOrientacionFiltradoPdf(req, res) {
  try {
    const datos = await listarHistorialOrientacion(req.query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=reporte_estados_orientacion_${Date.now()}.pdf`
    );
    await pipeReporteOrientacionFiltradoPdf(res, {
      filtros: datos.filtros,
      registros: datos.registros,
    });
  } catch (e) {
    const status = e.status || 500;
    if (!res.headersSent) {
      return res.status(status).json({ error: e.message || 'Error al generar reporte PDF' });
    }
  }
}

export async function deleteEstadoOrientacion(req, res) {
  try {
    const result = await eliminarEstadoPeriodo(req.params.id);
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al eliminar registro' });
  }
}

export async function getEstadosOrientacion(req, res) {
  try {
    const estados = await listarEstadosPeriodo(req.query.id_estudiante);
    return res.json(estados);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al listar estados' });
  }
}

export async function postEstadoOrientacion(req, res) {
  try {
    const creado = await crearEstadoPeriodo(req.body);
    return res.status(201).json(creado);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al registrar estado' });
  }
}

export async function patchEstadoOrientacion(req, res) {
  try {
    const actualizado = await actualizarEstadoPeriodo(req.params.id, req.body);
    return res.json(actualizado);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al actualizar estado' });
  }
}

export async function putEstadoOrientacion(req, res) {
  return patchEstadoOrientacion(req, res);
}

export async function patchAnularEstadoOrientacion(req, res) {
  try {
    const result = await anularEstadoPeriodo(req.params.id);
    return res.json({
      message: 'Estado finalizado correctamente. El estudiante volverá activo en asistencia.',
      registro: result,
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al anular estado' });
  }
}
