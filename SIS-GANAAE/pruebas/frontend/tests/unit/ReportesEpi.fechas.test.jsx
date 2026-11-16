/**
 * Ciclo 16: restricciones de fechas en los campos (sin validación local).
 */
import { screen } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import { fijarFecha, configurarServiciosPorDefecto, renderPagina, ultimaLlamadaReporte } from '../helpers/pagina';

beforeEach(() => { fijarFecha(); configurarServiciosPorDefecto(); });
afterEach(() => vi.useRealTimers());

describe('Fechas futuras y límites', () => {
  test('[OBSERVACIÓN] los campos de fecha no tienen max: se puede pedir un mes futuro (2027-03)', async () => {
    const { user } = await renderPagina();
    const mes = screen.getByLabelText('Mes');
    expect(mes).not.toHaveAttribute('max');
    await user.clear(mes);
    await user.type(mes, '2027-03');
    await user.click(screen.getByRole('button', { name: /generar reporte/i }));
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'mensual', fecha_referencia: '2027-03-01' });
  });

  test('[OBSERVACIÓN] semanal acepta cualquier día; el rango lunes-domingo lo calcula el backend y solo se ve tras generar', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'semanal');
    expect(screen.getByLabelText('Un día de la semana')).not.toHaveAttribute('max');
    // No hay vista previa del rango de la semana antes de generar
    expect(screen.queryByText(/lunes|domingo/i)).toBeNull();
  });

  test('el select de año solo ofrece años pasados y el actual (no futuros)', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    const valores = [...screen.getByLabelText('Año').options].map((o) => Number(o.value));
    expect(Math.max(...valores)).toBe(2026);
  });
});

import epi from '@/services/epiServices';
import { esperarEstudiantes } from '../helpers/pagina';
describe('D-01 por cambio de tipo de periodo', () => {
  test('[CORREGIDO D-01 variante] pasar de Mensual 2026 a Anual 2025 conserva un estudiante que no está en la lista de 2025', async () => {
    epi.getEstudiantesSeccionEpi.mockImplementation((id, { anio }) => Promise.resolve(anio === '2025'
      ? { estudiantes: [{ id_estudiante: 900, nombre_completo: 'Solo 2025' }] }
      : { estudiantes: [{ id_estudiante: 501, nombre_completo: 'Ana Prueba Uno' }] }));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(1);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    await user.selectOptions(screen.getByLabelText('Año'), '2025');
    await screen.findByRole('option', { name: 'Solo 2025' });
    expect(screen.getByLabelText('Estudiante')).toHaveValue(''); // lo que ve el usuario: "Todos (1)"
    await user.click(screen.getByRole('button', { name: /generar reporte/i }));
    expect(ultimaLlamadaReporte()).not.toHaveProperty('id_estudiante');
  });
});
