/**
 * Rendimiento ligero en jsdom: 40 secciones × 10 materias (400 filas de detalle).
 * Los tiempos de jsdom son indicativos (no equivalen a un navegador real).
 */
import fs from 'node:fs';
import path from 'node:path';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach, afterEach, afterAll } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import Page from '@/pages/epi/ReportesAsistenciaEpi';
import { renderConProveedores } from '../helpers/render';
import { generarGrande } from '../helpers/fixtures';
import { fijarFecha, configurarServiciosPorDefecto } from '../helpers/pagina';

const medidas = {};
beforeEach(() => { fijarFecha(); configurarServiciosPorDefecto(); });
afterEach(() => vi.useRealTimers());
afterAll(() => {
  const dir = path.resolve(__dirname, '../../resultados');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rendimiento.json'), JSON.stringify({ fecha: new Date().toISOString(), medidas }, null, 2));
});

describe('Render con 40 secciones × 10 materias', () => {
  test('primer render de la tabla (40 filas) < 1500 ms en jsdom', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(generarGrande(40, 10));
    const t0 = performance.now();
    renderConProveedores(<Page />);
    await screen.findByRole('button', { name: /Sección S-40/ });
    medidas.render_inicial_ms = Math.round(performance.now() - t0);
    expect(screen.getAllByRole('button', { name: /^Sección S-/ })).toHaveLength(40);
    expect(medidas.render_inicial_ms).toBeLessThan(1500);
  });

  test('"Ver detalle de todas" (400 filas de materia) < 1500 ms en jsdom', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(generarGrande(40, 10));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByRole('button', { name: /Sección S-40/ });
    const t0 = performance.now();
    await user.click(screen.getByRole('button', { name: 'Ver detalle de todas' }));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(1 + 40 + 400 + 1));
    medidas.expandir_todo_ms = Math.round(performance.now() - t0);
    const t1 = performance.now();
    await user.click(screen.getByRole('button', { name: 'Contraer todo' }));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(42));
    medidas.contraer_todo_ms = Math.round(performance.now() - t1);
    expect(medidas.expandir_todo_ms).toBeLessThan(1500);
  });

  test('cambiar un filtro (re-render + comparación JSON de params) < 300 ms con tabla expandida', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(generarGrande(40, 10));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByRole('button', { name: /Sección S-40/ });
    await user.click(screen.getByRole('button', { name: 'Ver detalle de todas' }));
    const t0 = performance.now();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    medidas.cambio_filtro_expandido_ms = Math.round(performance.now() - t0);
    expect(screen.getByText(/Cambió los filtros/)).toBeInTheDocument();
    expect(medidas.cambio_filtro_expandido_ms).toBeLessThan(300);
  });
});

// Añadido en el ciclo 5: medición con React Profiler (independiente de la latencia de user-event).
import { Profiler } from 'react';
describe('Costo de render por cambio de filtro (React Profiler)', () => {
  test('[MEJORA] un cambio de filtro ya no vuelve a renderizar la tabla expandida (tabla memoizada: actualDuration << baseDuration)', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(generarGrande(40, 10));
    const commits = [];
    const user = userEvent.setup();
    renderConProveedores(
      <Profiler id="epi" onRender={(id, fase, actual, base) => commits.push({ fase, actual, base })}><Page /></Profiler>,
    );
    await screen.findByRole('button', { name: /Sección S-40/ });
    await user.click(screen.getByRole('button', { name: 'Ver detalle de todas' }));
    commits.length = 0;
    await user.selectOptions(screen.getByLabelText('Materia'), '10');
    const upd = commits.filter((c) => c.fase === 'update');
    medidas.profiler_cambio_filtro = {
      commits: upd.length,
      actual_ms: Math.round(upd.reduce((a, c) => a + c.actual, 0)),
      base_ms: Math.round(Math.max(...upd.map((c) => c.base))),
    };
    expect(upd.length).toBeGreaterThan(0);
    // Con la tabla memoizada, el trabajo real del commit es una fracción del árbol completo.
    expect(medidas.profiler_cambio_filtro.actual_ms).toBeLessThan(0.5 * medidas.profiler_cambio_filtro.base_ms);
  });
});
