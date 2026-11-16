/**
 * Revisión de ReportesAsistenciaEpi.jsx tras D-01 (estudiante por año), D-02 (columna Otros)
 * y la extracción de TablaConteo memoizada.
 */
import { screen, within, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import { reporte, seccion, totales } from '../helpers/fixtures';
import {
  fijarFecha, configurarServiciosPorDefecto, renderPagina, ultimaLlamadaReporte, esperarEstudiantes,
} from '../helpers/pagina';

beforeEach(() => {
  fijarFecha();
  configurarServiciosPorDefecto();
});
afterEach(() => vi.useRealTimers());

const generar = (user) => user.click(screen.getByRole('button', { name: /generar reporte/i }));
const conOtros = (base, otros) => ({ ...base, otros, total: base.total + otros });

function columnasPorFila(tabla) {
  return [...tabla.querySelectorAll('tr')].map((tr) => tr.children.length);
}

describe('Columna "Otros" (D-02)', () => {
  test('con otros > 0: todas las filas (cabecera, secciones, materias expandidas y total) tienen el mismo número de celdas', async () => {
    const sec = seccion(1, '7-1', [['Matemáticas', 10]], conOtros(totales(50, 0, 0, 0), 4));
    sec.materias[0].totales = conOtros(sec.materias[0].totales, 4);
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({
      secciones: [sec], resumen_general: conOtros(totales(50, 0, 0, 0), 4),
    }));
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: /Sección 7-1/ }));
    const tabla = screen.getByRole('table');
    expect(within(tabla).getByRole('columnheader', { name: 'Otros' })).toBeInTheDocument();
    const cols = columnasPorFila(tabla);
    expect(new Set(cols).size).toBe(1);
    expect(cols[0]).toBe(8);
  });

  test('sin otros: no hay columna "Otros" y las filas tienen 7 celdas', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: /Sección 7-1/ }));
    const tabla = screen.getByRole('table');
    expect(within(tabla).queryByRole('columnheader', { name: 'Otros' })).toBeNull();
    expect(new Set(columnasPorFila(tabla))).toEqual(new Set([7]));
  });

  test('regenerar de un reporte con otros a uno sin otros quita la columna (TablaConteo memo se actualiza)', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValueOnce(reporte({ resumen_general: conOtros(totales(), 2) }));
    const { user } = await renderPagina();
    expect(screen.getByRole('columnheader', { name: 'Otros' })).toBeInTheDocument();
    epi.getReporteAsistenciaEpi.mockResolvedValueOnce(reporte());
    await generar(user);
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Otros' })).toBeNull());
  });

  test('[OBSERVACIÓN] las tarjetas de resumen no muestran "Otros": su suma no cuadra con "Total de registros"', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ resumen_general: conOtros(totales(10, 0, 0, 0), 5) }));
    await renderPagina();
    expect(screen.getByText('Total de registros')).toBeInTheDocument();
    expect(screen.queryByText(/^Otros$/i, { selector: 'p' })).toBeNull();
  });
});

describe('Estudiante seleccionado y cambio de año (D-01)', () => {
  test('si el estudiante sí existe en la lista del nuevo año, se conserva', async () => {
    epi.getEstudiantesSeccionEpi.mockImplementation(() =>
      Promise.resolve({ estudiantes: [{ id_estudiante: 501, nombre_completo: 'Ana Prueba Uno' }] }));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(1);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    const mes = screen.getByLabelText('Mes');
    await user.clear(mes);
    await user.type(mes, '2025-05');
    await waitFor(() => expect(epi.getEstudiantesSeccionEpi).toHaveBeenLastCalledWith('1', { anio: '2025' }));
    await esperarEstudiantes(1);
    expect(screen.getByLabelText('Estudiante')).toHaveValue('501');
    await generar(user);
    expect(ultimaLlamadaReporte()).toMatchObject({ id_estudiante: '501' });
  });

  test('si la carga de estudiantes falla, el filtro de estudiante se limpia', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    epi.getEstudiantesSeccionEpi.mockRejectedValue(new Error('fallo simulado'));
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    await user.selectOptions(screen.getByLabelText('Año'), '2025');
    await waitFor(() => expect(screen.getByLabelText('Estudiante')).not.toBeDisabled());
    await generar(user);
    expect(ultimaLlamadaReporte()).not.toHaveProperty('id_estudiante');
  });

  test('[OBSERVACIÓN] mientras se recarga la lista del nuevo año, "Generar" sigue habilitado y envía el estudiante anterior', async () => {
    let liberar;
    epi.getEstudiantesSeccionEpi.mockImplementation((id, { anio }) =>
      anio === '2025'
        ? new Promise((r) => { liberar = () => r({ estudiantes: [{ id_estudiante: 777, nombre_completo: 'Otro 2025' }] }); })
        : Promise.resolve({ estudiantes: [{ id_estudiante: 501, nombre_completo: 'Ana Prueba Uno' }] }));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(1);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    const mes = screen.getByLabelText('Mes');
    await user.clear(mes);
    await user.type(mes, '2025-05');
    await waitFor(() => expect(screen.getByLabelText('Estudiante')).toBeDisabled());
    // El select (deshabilitado) aún muestra a Ana, así que lo enviado coincide con lo visible.
    expect(screen.getByLabelText('Estudiante')).toHaveValue('501');
    await generar(user);
    expect(ultimaLlamadaReporte()).toMatchObject({ id_estudiante: '501' });
    liberar();
    // Al llegar la lista, el filtro se limpia y aparece el aviso amarillo de filtros cambiados.
    await waitFor(() => expect(screen.getByLabelText('Estudiante')).toHaveValue(''));
    expect(await screen.findByText(/Cambió los filtros/)).toBeInTheDocument();
  });
});
