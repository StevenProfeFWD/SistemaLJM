/**
 * Caja blanca del controlador y del cableado de rutas EPI.
 * Los servicios se sustituyen con vi.mock (no hay BD ni PDF real en las pruebas del controlador).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../backend-node/src/services/epiReportesService.js', () => ({
  obtenerReporteAsistenciaEpi: vi.fn(),
  listarEstudiantesSeccionEpi: vi.fn(),
}));
vi.mock('../../../../backend-node/src/services/pdfService.js', () => ({
  pipeReporteAsistenciaEpiPdf: vi.fn(async () => {}),
}));

const svc = await import('../../../../backend-node/src/services/epiReportesService.js');
const pdf = await import('../../../../backend-node/src/services/pdfService.js');
const ctrl = await import('../../../../backend-node/src/controllers/epiController.js');
const { default: router } = await import('../../../../backend-node/src/routes/epiRoutes.js');
const { verificarReportesEpi } = await import('../../../../backend-node/src/middlewares/verificarRoles.js');
const { verificarTokenInterno } = await import('../../../../backend-node/src/middlewares/verificarToken.js');

const fakeRes = () => {
  const res = { headers: {} };
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn((k, v) => {
    res.headers[k] = v;
  });
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe('epiController', () => {
  it('getReporteAsistenciaEpi pasa req.query y responde JSON (sin detalle)', async () => {
    svc.obtenerReporteAsistenciaEpi.mockResolvedValue({ ok: 1 });
    const res = fakeRes();
    await ctrl.getReporteAsistenciaEpi({ query: { periodo: 'semanal' } }, res);
    expect(svc.obtenerReporteAsistenciaEpi).toHaveBeenCalledWith({ periodo: 'semanal' });
    expect(res.json).toHaveBeenCalledWith({ ok: 1 });
  });

  it('getEstudiantesSeccionEpi pasa params.idSeccion y query', async () => {
    svc.listarEstudiantesSeccionEpi.mockResolvedValue({ estudiantes: [] });
    const res = fakeRes();
    await ctrl.getEstudiantesSeccionEpi({ params: { idSeccion: '7' }, query: { anio: '2026' } }, res);
    expect(svc.listarEstudiantesSeccionEpi).toHaveBeenCalledWith('7', { anio: '2026' });
    expect(res.json).toHaveBeenCalledWith({ estudiantes: [] });
  });

  it('getReporteAsistenciaEpiPdf: pide detalle, fija cabeceras y delega en pdfService', async () => {
    const datos = { filtros: { periodo: 'mensual', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' } };
    svc.obtenerReporteAsistenciaEpi.mockResolvedValue(datos);
    const res = fakeRes();
    await ctrl.getReporteAsistenciaEpiPdf({ query: { periodo: 'mensual' } }, res);
    expect(svc.obtenerReporteAsistenciaEpi).toHaveBeenCalledWith({ periodo: 'mensual' }, { incluirDetalle: true });
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toBe(
      'attachment; filename=reporte_asistencia_epi_mensual_2026-03-01_2026-03-31.pdf'
    );
    expect(pdf.pipeReporteAsistenciaEpiPdf).toHaveBeenCalledWith(res, datos);
  });

  it('errores del servicio se propagan (asyncHandler los envía a next) y no se fijan cabeceras', async () => {
    svc.obtenerReporteAsistenciaEpi.mockRejectedValue(new Error('x'));
    const res = fakeRes();
    await expect(ctrl.getReporteAsistenciaEpiPdf({ query: {} }, res)).rejects.toThrow('x');
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('epiRoutes — cableado', () => {
  const rutas = router.stack.map((l) => ({
    path: l.route.path,
    metodos: Object.keys(l.route.methods),
    pila: l.route.stack.map((s) => s.handle),
  }));

  it('expone exactamente 3 rutas GET', () => {
    expect(rutas.map((r) => [r.path, r.metodos])).toEqual([
      ['/epi/reporte-asistencia', ['get']],
      ['/epi/secciones/:idSeccion/estudiantes', ['get']],
      ['/epi/reporte-asistencia/pdf', ['get']],
    ]);
  });

  it('cada ruta aplica primero verificarTokenInterno y luego verificarReportesEpi', () => {
    for (const r of rutas) {
      expect(r.pila).toHaveLength(3);
      expect(r.pila[0]).toBe(verificarTokenInterno);
      expect(r.pila[1]).toBe(verificarReportesEpi);
      expect(r.pila[2].name).toBe('wrapped'); // asyncHandler
    }
  });

  it('el handler envuelto llama a next(err) cuando el servicio falla', async () => {
    const err = new Error('falla');
    svc.obtenerReporteAsistenciaEpi.mockRejectedValue(err);
    const next = vi.fn();
    rutas[0].pila[2]({ query: {} }, fakeRes(), next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(err);
  });
});
