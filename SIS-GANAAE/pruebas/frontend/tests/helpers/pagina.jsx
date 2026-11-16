import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import epi from '@/services/epiServices';
import Page from '@/pages/epi/ReportesAsistenciaEpi';
import { renderConProveedores } from './render';
import { reporte, ESTUDIANTES_7_1, ESTUDIANTES_8_2 } from './fixtures';

/** Fecha fija: sábado 14/11/2026 12:00 local (solo se simula Date, no los timers). */
export function fijarFecha(iso = '2026-11-14T12:00:00') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

export function configurarServiciosPorDefecto() {
  epi.getReporteAsistenciaEpi.mockReset().mockResolvedValue(reporte());
  epi.getEstudiantesSeccionEpi.mockReset().mockImplementation((id) =>
    Promise.resolve(String(id) === '2' ? ESTUDIANTES_8_2 : ESTUDIANTES_7_1));
  epi.descargarReporteAsistenciaEpiPdf.mockReset().mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
  epi.guardarBlob.mockReset();
}

export async function renderPagina(opts) {
  const user = userEvent.setup();
  const utils = renderConProveedores(<Page />, opts);
  await screen.findByText('Sección 7-1');
  return { user, ...utils };
}

export const ultimaLlamadaReporte = () => epi.getReporteAsistenciaEpi.mock.calls.at(-1)[0];

export async function esperarEstudiantes(n) {
  await waitFor(() => expect(screen.getByLabelText('Estudiante')).not.toBeDisabled());
  await screen.findByRole('option', { name: `Todos (${n})` });
}
