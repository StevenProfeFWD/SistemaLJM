/**
 * Usabilidad técnica y accesibilidad (WCAG 2.1/2.2 AA) de la pantalla EPI.
 * - axe-core en los estados principales (contraste se calcula aparte: jsdom no pinta).
 * - Etiquetas, teclado, foco, textos en español, estados deshabilitados.
 */
import fs from 'node:fs';
import path from 'node:path';
import axe from 'axe-core';
import { screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach, afterEach, afterAll } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import Page from '@/pages/epi/ReportesAsistenciaEpi';
import { renderConProveedores } from '../helpers/render';
import { reporte, totales } from '../helpers/fixtures';
import { fijarFecha, configurarServiciosPorDefecto, renderPagina, esperarEstudiantes } from '../helpers/pagina';
import { APP } from '../helpers/color';

const RESUMEN_AXE = {};
const RES_DIR = path.resolve(__dirname, '../../resultados');

async function analizar(estado, contenedor = document.body) {
  const r = await axe.run(contenedor, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  RESUMEN_AXE[estado] = r.violations.map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: v.nodes[0]?.target?.join(' ') }));
  return r.violations;
}

const idsSerios = (vs) => vs.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id);

beforeEach(() => {
  fijarFecha();
  configurarServiciosPorDefecto();
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  fs.mkdirSync(RES_DIR, { recursive: true });
  fs.writeFileSync(path.join(RES_DIR, 'axe-ultimo.json'), JSON.stringify({ fecha: new Date().toISOString(), estados: RESUMEN_AXE }, null, 2));
});

describe('axe-core por estado de la pantalla', () => {
  test('estado inicial con datos: sin violaciones serias/críticas', async () => {
    await renderPagina();
    const v = await analizar('inicial');
    expect(idsSerios(v)).toEqual([]);
  });

  test('todas las secciones expandidas: sin violaciones serias/críticas', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Ver detalle de todas' }));
    expect(idsSerios(await analizar('expandido'))).toEqual([]);
  });

  test('periodo personalizado + sección + estudiantes cargados', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    expect(idsSerios(await analizar('personalizado_estudiantes'))).toEqual([]);
  });

  test('estado de error', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue(new Error('x'));
    renderConProveedores(<Page />);
    await screen.findByRole('alert');
    expect(idsSerios(await analizar('error'))).toEqual([]);
  });

  test('estado de carga', async () => {
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise(() => {}));
    renderConProveedores(<Page />);
    await screen.findByText('Generando reporte de asistencia…');
    expect(idsSerios(await analizar('cargando'))).toEqual([]);
  });

  test('diálogo "Sin datos" abierto', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByText(/No hay registros/);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await screen.findByRole('alertdialog');
    expect(idsSerios(await analizar('dialogo_sin_datos'))).toEqual([]);
  });

  test('aviso amarillo visible', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Materia'), '10');
    expect(idsSerios(await analizar('aviso_filtros'))).toEqual([]);
  });

  test('[INFORMATIVO] no hay violaciones de ningún impacto en el estado inicial', async () => {
    await renderPagina();
    const v = await analizar('inicial_todas');
    expect(v.map((x) => `${x.id}(${x.impact})`)).toEqual([]);
  });
});

describe('Etiquetas de formularios (WCAG 1.3.1, 3.3.2, 4.1.2)', () => {
  test('cada control del formulario tiene <label> asociado en todos los tipos de periodo', async () => {
    const { user } = await renderPagina();
    for (const p of ['semanal', 'mensual', 'anual', 'personalizado']) {
      await user.selectOptions(screen.getByLabelText('Tipo de reporte'), p);
      const form = document.querySelector('form');
      const controles = form.querySelectorAll('input, select, textarea');
      for (const c of controles) {
        expect(c.labels.length, `${p}: control #${c.id} sin etiqueta`).toBeGreaterThan(0);
        expect(c.labels[0].textContent.trim()).not.toBe('');
      }
    }
  });

  test('los ids de los controles son únicos', async () => {
    await renderPagina();
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('campos de fecha obligatorios marcados con required', async () => {
    const { user } = await renderPagina();
    expect(screen.getByLabelText('Mes')).toBeRequired();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    expect(screen.getByLabelText('Desde')).toBeRequired();
    expect(screen.getByLabelText('Hasta')).toBeRequired();
  });

  test('[OBSERVACIÓN] la obligatoriedad no se indica visualmente en la etiqueta (sin "*" ni "(obligatorio)")', async () => {
    await renderPagina();
    expect(document.querySelector('label[for="epi-mes"]').textContent).toBe('Mes');
  });
});

describe('Operación solo con teclado (WCAG 2.1.1, 2.4.3)', () => {
  test('orden de tabulación lógico dentro del contenido principal', async () => {
    const { user } = await renderPagina();
    const main = document.getElementById('main-content');
    // Ir al primer elemento enfocable del <main>
    screen.getByRole('button', { name: 'Descargar PDF' }).focus();
    const orden = [document.activeElement];
    for (let i = 0; i < 8; i++) {
      await user.tab();
      if (!main.contains(document.activeElement)) break;
      orden.push(document.activeElement);
    }
    const nombres = orden.map((el) => el.id || el.textContent.trim().replace(/\s+/g, ' '));
    expect(nombres).toEqual([
      'Descargar PDF', 'epi-periodo', 'epi-mes', 'epi-seccion', 'epi-materia',
      'Generar reporte', 'Ver detalle de todas', 'Sección 7-1(2 materias)', 'Sección 8-2(1 materia)',
    ].slice(0, nombres.length));
    expect(nombres).not.toContain('epi-estudiante'); // deshabilitado ⇒ fuera del orden
  });

  test('Enter dentro del campo Mes envía el formulario (genera reporte)', async () => {
    const { user } = await renderPagina();
    const mes = screen.getByLabelText('Mes');
    mes.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(2));
  });

  test('Enter y Espacio sobre el botón de sección alternan aria-expanded', async () => {
    const { user } = await renderPagina();
    const b = screen.getByRole('button', { name: /Sección 7-1/ });
    b.focus();
    await user.keyboard('{Enter}');
    expect(b).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(b).toHaveAttribute('aria-expanded', 'false');
  });

  test('todos los botones de sección exponen aria-expanded booleano', async () => {
    await renderPagina();
    const botones = screen.getAllByRole('button', { name: /^Sección / });
    expect(botones.length).toBe(2);
    botones.forEach((b) => expect(['true', 'false']).toContain(b.getAttribute('aria-expanded')));
  });

  test('[OBSERVACIÓN] los botones de sección no tienen aria-controls hacia las filas que muestran', async () => {
    await renderPagina();
    expect(screen.getByRole('button', { name: /Sección 7-1/ })).not.toHaveAttribute('aria-controls');
  });

  test('al abrir el diálogo "Sin datos" el foco va al botón "Entendido"', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByText(/No hay registros/);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await screen.findByRole('alertdialog');
    expect(document.activeElement).toHaveTextContent('Entendido');
  });

  test('[CORREGIDO D-04] al cerrar el diálogo el foco debe volver al botón que lo abrió (WCAG 2.4.3)', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByText(/No hay registros/);
    const btn = screen.getByRole('button', { name: 'Descargar PDF' });
    await user.click(btn);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(btn);
  });

  test('[CORREGIDO D-05] el diálogo modal debe atrapar el foco (Tab no sale del alertdialog)', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByText(/No hay registros/);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    const dlg = await screen.findByRole('alertdialog');
    await user.tab();
    expect(dlg.contains(document.activeElement)).toBe(true);
  });

  test('[MEJORA] el alertdialog enlaza el mensaje con aria-describedby', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const user = userEvent.setup();
    renderConProveedores(<Page />);
    await screen.findByText(/No hay registros/);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveAccessibleName('Sin datos');
    expect(dlg).toHaveAccessibleDescription('No hay datos de asistencia para el periodo seleccionado.');
  });
});

describe('Foco visible y estados (WCAG 2.4.7, 1.4.11)', () => {
  test('botones de la librería UI declaran estilo focus-visible (anillo)', async () => {
    await renderPagina();
    for (const n of ['Descargar PDF', /Generar reporte/, 'Ver detalle de todas']) {
      expect(screen.getByRole('button', { name: n }).className).toMatch(/focus-visible:ring/);
    }
  });

  test('selects e inputs cambian borde y anillo al enfocar', async () => {
    await renderPagina();
    for (const id of ['epi-periodo', 'epi-mes', 'epi-seccion', 'epi-materia', 'epi-estudiante']) {
      const cls = document.getElementById(id).className;
      expect(cls).toMatch(/focus:border-slate-900/);
      expect(cls).toMatch(/focus:ring-2/);
    }
  });

  test('[OBSERVACIÓN] los botones de expandir sección no definen estilo de foco propio (dependen del outline global outline-ring/50)', async () => {
    await renderPagina();
    const cls = screen.getByRole('button', { name: /Sección 7-1/ }).className;
    expect(cls).not.toMatch(/focus/);
  });
});

describe('Estados deshabilitados y su explicación', () => {
  test('Estudiante deshabilitado expone la razón como descripción accesible (title)', async () => {
    await renderPagina();
    const est = screen.getByLabelText('Estudiante');
    expect(est).toHaveAccessibleDescription('Seleccione primero una sección');
  });

  test('[OBSERVACIÓN] "Descargar PDF" deshabilitado tras un error no explica por qué', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue(new Error('x'));
    renderConProveedores(<Page />);
    await screen.findByRole('alert');
    const b = screen.getByRole('button', { name: 'Descargar PDF' });
    expect(b).toBeDisabled();
    expect(b).not.toHaveAttribute('title');
    expect(b).not.toHaveAttribute('aria-describedby');
  });

  test('el aviso de filtros cambiados es anunciado (role=status) y menciona la acción a tomar', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    const aviso = screen.getByText(/Cambió los filtros/);
    expect(aviso).toHaveAttribute('role', 'status');
    expect(aviso.textContent).toMatch(/Generar reporte/);
  });
});

describe('Estructura semántica (WCAG 1.3.1, 2.4.6)', () => {
  test('hay exactamente un h1 y un landmark main', async () => {
    await renderPagina();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  test('[OBSERVACIÓN] los títulos de tarjeta ("Parámetros del reporte", "Conteo por sección") no son encabezados', async () => {
    await renderPagina();
    expect(screen.queryByRole('heading', { name: 'Parámetros del reporte' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Conteo por sección' })).toBeNull();
  });

  test('la tabla tiene encabezados de columna', async () => {
    await renderPagina();
    const heads = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Sección / materia', 'Presentes', 'Tardías', 'Aus. justificadas', 'Aus. injustificadas', 'Total', '% Asistencia']);
  });

  test('[OBSERVACIÓN] la tabla no tiene <caption> ni encabezados de fila (th scope=row)', async () => {
    await renderPagina();
    const t = screen.getByRole('table');
    expect(t.querySelector('caption')).toBeNull();
    expect(within(t).queryAllByRole('rowheader')).toHaveLength(0);
  });

  test('[CORREGIDO D-06] index.html declara lang="es" (WCAG 3.1.1)', () => {
    const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
    expect(html).toMatch(/<html lang="es/);
  });

  test('[CORREGIDO D-07] el <title> del documento es descriptivo (WCAG 2.4.2)', () => {
    const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<title>frontend-reactjs<\/title>/);
  });
});

describe('Consistencia de textos en español', () => {
  test('no hay textos en inglés visibles en la pantalla', async () => {
    await renderPagina();
    const texto = document.body.textContent;
    expect(texto).not.toMatch(/\b(Loading|Download|Generate|Report|Section|Subject|Student|Error:)\b/);
  });

  test('etiquetas KPI y columnas usan la misma terminología (Presentes, Tardías, Total)', async () => {
    await renderPagina();
    for (const t of ['Presentes', 'Tardías']) expect(screen.getAllByText(t).length).toBeGreaterThanOrEqual(2);
  });

  test('[OBSERVACIÓN] el orden de ausencias difiere entre KPI (injustificadas→justificadas) y tabla (justificadas→injustificadas)', async () => {
    await renderPagina();
    const kpi = [...document.querySelectorAll('p.uppercase')].map((p) => p.textContent);
    expect(kpi.indexOf('Ausencias injustificadas')).toBeLessThan(kpi.indexOf('Ausencias justificadas'));
    const cols = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(cols.indexOf('Aus. justificadas')).toBeLessThan(cols.indexOf('Aus. injustificadas'));
  });

  test('[OBSERVACIÓN] encabezados abreviados "Aus." sin <abbr title> (lectores de pantalla leen "aus")', async () => {
    await renderPagina();
    expect(document.querySelector('th abbr')).toBeNull();
  });

  test('se usa la elipsis tipográfica "…" de forma consistente en estados de carga', async () => {
    let resolver;
    epi.descargarReporteAsistenciaEpiPdf.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(screen.getByRole('button', { name: 'Generando PDF…' })).toBeInTheDocument();
    await act(async () => resolver(new Blob(['x'])));
  });
});

describe('Teclado mientras cargan los estudiantes (ciclo 9)', () => {
  test('[OBSERVACIÓN] con la lista cargando, Tab desde Sección salta Estudiante (disabled) y llega a Generar', async () => {
    let resolver;
    epi.getEstudiantesSeccionEpi.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const { user } = await renderPagina();
    const sec = screen.getByLabelText('Sección');
    await user.selectOptions(sec, '1');
    sec.focus();
    await user.tab(); // Materia
    await user.tab(); // Estudiante está disabled → siguiente
    expect(document.activeElement).toHaveTextContent('Generar reporte');
    await act(async () => resolver({ estudiantes: [{ id_estudiante: 1, nombre_completo: 'X' }] }));
    expect(screen.getByLabelText('Estudiante')).toBeEnabled();
  });
});

describe('Regiones vivas (ciclo 12)', () => {
  test('[OBSERVACIÓN] el aviso amarillo (role=status) se monta junto con su texto: no existe una región viva previa', async () => {
    const { user } = await renderPagina();
    expect(document.querySelectorAll('p[role="status"]')).toHaveLength(0);
    await user.selectOptions(screen.getByLabelText('Materia'), '10');
    const aviso = document.querySelector('p[role="status"]');
    expect(aviso).not.toBeNull();
    expect(aviso.textContent.length).toBeGreaterThan(0);
  });

  test('el error usa role=alert (se anuncia al insertarse)', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue(new Error('x'));
    renderConProveedores(<Page />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el reporte');
  });

  test('[OBSERVACIÓN] al terminar la generación no se anuncia el resultado (no hay región viva con el resumen)', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: /generar reporte/i }));
    await screen.findByText('Sección 7-1');
    const vivas = [...document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')].filter((e) => e.textContent.includes('Periodo'));
    expect(vivas).toHaveLength(0);
  });
});
