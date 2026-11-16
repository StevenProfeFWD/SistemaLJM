/**
 * Añadido en el ciclo 7 tras el análisis de mutantes: el mutante M1 (no reiniciar el estudiante al
 * cambiar de sección) sobrevivía porque un <select> controlado con un valor inexistente muestra la
 * primera opción ("Todos") en el DOM. Estas pruebas verifican el ESTADO real a través de los
 * parámetros enviados al servicio, no solo el valor visible del select.
 */
import { screen, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import { fijarFecha, configurarServiciosPorDefecto, renderPagina, ultimaLlamadaReporte, esperarEstudiantes } from '../helpers/pagina';

beforeEach(() => { fijarFecha(); configurarServiciosPorDefecto(); });
afterEach(() => vi.useRealTimers());

const generar = (user) => user.click(screen.getByRole('button', { name: /generar reporte/i }));

describe('Estado oculto del estudiante seleccionado', () => {
  test('tras cambiar de sección, el reporte NO incluye el estudiante de la sección anterior', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await esperarEstudiantes(1);
    await generar(user);
    await waitFor(() => expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(2));
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'mensual', fecha_referencia: '2026-11-01', id_seccion: '2' });
  });

  test('el valor visible del select coincide con lo que se envía (sección 1 → estudiante 502)', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '502');
    expect(screen.getByLabelText('Estudiante')).toHaveValue('502');
    await generar(user);
    await waitFor(() => expect(ultimaLlamadaReporte()).toMatchObject({ id_estudiante: '502' }));
  });
});

import { act } from '@testing-library/react';
import { reporte } from '../helpers/fixtures';
describe('Cambios de filtros mientras se genera (ciclo 8)', () => {
  test('los filtros siguen editables durante la carga; al llegar la respuesta se muestra el reporte pedido y aparece el aviso', async () => {
    const { user } = await renderPagina();
    let resolver;
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise((r) => { resolver = r; }));
    await user.selectOptions(screen.getByLabelText('Materia'), '10');
    await generar(user);
    const pedidos = ultimaLlamadaReporte();
    expect(screen.getByLabelText('Sección')).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await act(async () => resolver(reporte()));
    await screen.findByText('Sección 7-1');
    expect(pedidos).toEqual({ periodo: 'mensual', fecha_referencia: '2026-11-01', id_materia: '10' });
    expect(screen.getByText(/Cambió los filtros/)).toBeInTheDocument();
    // El PDF usa lo pedido, no la sección elegida durante la carga
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalledWith(pedidos));
  });

  test('[OBSERVACIÓN] durante la carga los selects no se deshabilitan ni indican que el cambio no afectará al reporte en curso', async () => {
    const { user } = await renderPagina();
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise(() => {}));
    await generar(user);
    expect(screen.getByLabelText('Tipo de reporte')).toBeEnabled();
    expect(screen.queryByText(/Cambió los filtros/)).toBeNull();
  });
});
