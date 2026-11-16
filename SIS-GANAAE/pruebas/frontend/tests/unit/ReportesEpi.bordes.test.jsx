/**
 * Casos borde adicionales de ReportesAsistenciaEpi (ciclo 2).
 */
import { screen, within, waitFor, act } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import { reporte, CATALOGOS } from '../helpers/fixtures';
import { fijarFecha, configurarServiciosPorDefecto, renderPagina, ultimaLlamadaReporte, esperarEstudiantes } from '../helpers/pagina';

beforeEach(() => { fijarFecha(); configurarServiciosPorDefecto(); });
afterEach(() => vi.useRealTimers());

const generar = (user) => user.click(screen.getByRole('button', { name: /generar reporte/i }));

describe('Envío del formulario y concurrencia', () => {
  test('Enter en un campo mientras se genera NO dispara otra consulta (botón submit deshabilitado)', async () => {
    const { user } = await renderPagina();
    let resolver;
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise((r) => { resolver = r; }));
    await generar(user);
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(2);
    screen.getByLabelText('Tipo de reporte').focus();
    await user.keyboard('{Enter}');
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(2);
    await act(async () => resolver(reporte()));
  });

  test('doble clic rápido en "Generar reporte" produce una sola consulta adicional', async () => {
    const { user } = await renderPagina();
    let resolver;
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise((r) => { resolver = r; }));
    await user.dblClick(screen.getByRole('button', { name: /generar reporte/i }));
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(2);
    await act(async () => resolver(reporte()));
  });

  test('la carga inicial se ejecuta una sola vez (sin doble llamada por efectos)', async () => {
    await renderPagina();
    await new Promise((r) => setTimeout(r, 50));
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(1);
  });
});

describe('Catálogos', () => {
  test('si la respuesta no trae catálogos, se conservan los anteriores', async () => {
    const { user } = await renderPagina();
    const sinCat = reporte(); delete sinCat.catalogos;
    epi.getReporteAsistenciaEpi.mockResolvedValue(sinCat);
    await generar(user);
    await screen.findByText('Sección 7-1');
    expect(within(screen.getByLabelText('Sección')).getAllByRole('option')).toHaveLength(1 + CATALOGOS.secciones.length);
  });

  test('tras un error, los filtros elegidos y los catálogos se mantienen', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    epi.getReporteAsistenciaEpi.mockRejectedValueOnce(new Error('x'));
    await generar(user);
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Sección')).toHaveValue('2');
    expect(within(screen.getByLabelText('Materia')).getAllByRole('option')).toHaveLength(3);
  });

  test('[OBSERVACIÓN] sin ningún reporte exitoso, los selects Sección/Materia solo ofrecen "Todas"', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue(new Error('x'));
    const userEvent = (await import('@testing-library/user-event')).default;
    const { renderConProveedores } = await import('../helpers/render');
    const Page = (await import('@/pages/epi/ReportesAsistenciaEpi')).default;
    userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByRole('alert');
    expect(within(screen.getByLabelText('Sección')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas']);
  });
});

describe('PDF: nombres de archivo por periodo', () => {
  test.each([
    ['semanal', '2026-11-09', '2026-11-15'],
    ['anual', '2026-01-01', '2026-12-31'],
    ['personalizado', '2026-08-01', '2026-09-15'],
  ])('periodo %s (inicio %s, fin %s) → nombre de archivo con periodo y fechas', async (periodo, ini, fin) => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ filtros: { periodo, periodo_label: periodo, fecha_inicio: ini, fecha_fin: fin } }));
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.guardarBlob).toHaveBeenCalled());
    expect(epi.guardarBlob.mock.calls[0][1]).toBe(`reporte_asistencia_epi_${periodo}_${ini}_${fin}.pdf`);
  });

  test('el PDF incluye id_estudiante cuando el reporte mostrado lo tenía', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '502');
    await generar(user);
    await screen.findByText('Sección 7-1');
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalled());
    expect(epi.descargarReporteAsistenciaEpiPdf.mock.calls[0][0]).toEqual({ periodo: 'mensual', fecha_referencia: '2026-11-01', id_seccion: '1', id_estudiante: '502' });
  });

  test('el PDF no se descarga dos veces con doble clic (botón deshabilitado durante la descarga)', async () => {
    let resolver;
    epi.descargarReporteAsistenciaEpiPdf.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const { user } = await renderPagina();
    await user.dblClick(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalledTimes(1);
    await act(async () => resolver(new Blob(['x'])));
  });
});

describe('Fechas límite', () => {
  test('31 de diciembre: mensual usa 2026-12-01 y Desde = 2026-12-01', async () => {
    vi.setSystemTime(new Date('2026-12-31T23:30:00'));
    const { user } = await renderPagina();
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'mensual', fecha_referencia: '2026-12-01' });
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-12-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-12-31');
  });

  test('1 de enero a las 00:10 (hora local) mantiene el año local', async () => {
    vi.setSystemTime(new Date('2027-01-01T00:10:00'));
    const { user } = await renderPagina();
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'mensual', fecha_referencia: '2027-01-01' });
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    expect(screen.getByLabelText('Año')).toHaveValue('2027');
  });

  test('vaciar el campo Mes y generar: el navegador valida "required" (jsdom: el envío se bloquea)', async () => {
    const { user } = await renderPagina();
    await user.clear(screen.getByLabelText('Mes'));
    await generar(user);
    // Con required y valor vacío, la validación nativa impide el submit.
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Mes')).toBeInvalid();
  });
});
