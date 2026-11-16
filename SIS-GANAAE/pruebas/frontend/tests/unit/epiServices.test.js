/**
 * epiServices.jsx real, con el cliente HTTP simulado (setup.js): verifica URL, params y responseType.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import apiClient from '@/config/api';
import epiServicio, {
  getReporteAsistenciaEpi, getEstudiantesSeccionEpi, descargarReporteAsistenciaEpiPdf, guardarBlob,
} from '@/services/epiServices';

beforeEach(() => {
  apiClient.get.mockReset();
});

describe('epiServices', () => {
  test('getReporteAsistenciaEpi → GET /epi/reporte-asistencia con params y devuelve data', async () => {
    apiClient.get.mockResolvedValue({ data: { ok: 1 } });
    const r = await getReporteAsistenciaEpi({ periodo: 'anual', fecha_referencia: '2026-01-01' });
    expect(apiClient.get).toHaveBeenCalledWith('/epi/reporte-asistencia', { params: { periodo: 'anual', fecha_referencia: '2026-01-01' } });
    expect(r).toEqual({ ok: 1 });
  });

  test('getReporteAsistenciaEpi sin argumentos envía params vacíos', async () => {
    apiClient.get.mockResolvedValue({ data: {} });
    await getReporteAsistenciaEpi();
    expect(apiClient.get).toHaveBeenCalledWith('/epi/reporte-asistencia', { params: {} });
  });

  test('getEstudiantesSeccionEpi → GET /epi/secciones/:id/estudiantes', async () => {
    apiClient.get.mockResolvedValue({ data: { estudiantes: [] } });
    await getEstudiantesSeccionEpi('7', { anio: '2026' });
    expect(apiClient.get).toHaveBeenCalledWith('/epi/secciones/7/estudiantes', { params: { anio: '2026' } });
  });

  test('[OBSERVACIÓN] getEstudiantesSeccionEpi no codifica el id en la URL (encodeURIComponent)', async () => {
    apiClient.get.mockResolvedValue({ data: {} });
    await getEstudiantesSeccionEpi('1/../2', {});
    expect(apiClient.get.mock.calls[0][0]).toBe('/epi/secciones/1/../2/estudiantes');
  });

  test('descargarReporteAsistenciaEpiPdf usa responseType blob y devuelve el blob', async () => {
    const blob = new Blob(['%PDF']);
    apiClient.get.mockResolvedValue({ data: blob });
    const r = await descargarReporteAsistenciaEpiPdf({ periodo: 'mensual' });
    expect(apiClient.get).toHaveBeenCalledWith('/epi/reporte-asistencia/pdf', { params: { periodo: 'mensual' }, responseType: 'blob' });
    expect(r).toBe(blob);
  });

  test('los errores HTTP se propagan al llamador', async () => {
    apiClient.get.mockRejectedValue({ response: { status: 500 } });
    await expect(getReporteAsistenciaEpi({})).rejects.toEqual({ response: { status: 500 } });
  });

  test('guardarBlob crea un <a download>, lo pulsa, lo elimina y revoca la URL', () => {
    const crear = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:x');
    const revocar = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicks = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, download: this.download, enDom: document.body.contains(this) }); };
    try {
      guardarBlob(new Blob(['x']), 'archivo.pdf');
    } finally {
      HTMLAnchorElement.prototype.click = orig;
    }
    expect(clicks).toEqual([{ href: 'blob:x', download: 'archivo.pdf', enDom: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revocar).toHaveBeenCalledWith('blob:x');
    crear.mockRestore(); revocar.mockRestore();
  });

  test('el export por defecto expone las 4 funciones', () => {
    expect(Object.keys(epiServicio).sort()).toEqual(['descargarReporteAsistenciaEpiPdf', 'getEstudiantesSeccionEpi', 'getReporteAsistenciaEpi', 'guardarBlob']);
  });
});
