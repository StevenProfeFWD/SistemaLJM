/**
 * Contraste de color (WCAG 1.4.3 / 1.4.11) calculado a partir de los tokens reales:
 * frontend-reactjs/node_modules/tailwindcss/theme.css (Tailwind 4, OKLCH) y src/index.css.
 * Umbrales: texto normal 4.5:1, texto grande (≥24px o ≥18.66px negrita) 3:1, no-texto 3:1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, afterAll } from 'vitest';
import { leerTokenTailwind as tw, leerVariableApp as app, contraste, mezclar, BLANCO, hex } from '../helpers/color';

const tabla = [];
const reg = (caso, fg, bg, min) => {
  const r = contraste(fg, bg);
  tabla.push({ caso, fg: hex(fg), bg: hex(bg), razon: r, minimo: min, cumple: r >= min });
  return r;
};

afterAll(() => {
  const dir = path.resolve(__dirname, '../../resultados');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'contraste.json'), JSON.stringify(tabla, null, 2));
});

describe('Colores de estado del % de asistencia sobre blanco (celdas text-sm, 4.5:1)', () => {
  test.each(['green-700', 'yellow-700', 'red-700'])('text-%s sobre blanco ≥ 4.5:1', (c) => {
    expect(reg(`text-${c} / blanco (celda tabla)`, tw(c), BLANCO, 4.5)).toBeGreaterThanOrEqual(4.5);
  });
  test('text-blue-700 (KPI aus. justificadas) sobre blanco ≥ 4.5:1', () => {
    expect(reg('text-blue-700 / blanco (KPI)', tw('blue-700'), BLANCO, 4.5)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Fila "Total general" (fondo bg-blue-50)', () => {
  test.each(['green-700', 'yellow-700', 'red-700'])('text-%s sobre blue-50 ≥ 4.5:1', (c) => {
    expect(reg(`text-${c} / blue-50 (tfoot)`, tw(c), tw('blue-50'), 4.5)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Avisos', () => {
  test('aviso amarillo: text-yellow-800 sobre bg-yellow-50 ≥ 4.5:1', () => {
    expect(reg('text-yellow-800 / yellow-50 (aviso)', tw('yellow-800'), tw('yellow-50'), 4.5)).toBeGreaterThanOrEqual(4.5);
  });
  test('error: text-red-700 sobre bg-red-50 ≥ 4.5:1', () => {
    expect(reg('text-red-700 / red-50 (error)', tw('red-700'), tw('red-50'), 4.5)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Textos secundarios y estados', () => {
  test('text-muted-foreground (etiquetas KPI text-xs) sobre blanco ≥ 4.5:1', () => {
    expect(reg('muted-foreground / blanco (etiquetas KPI, subtítulo)', app('muted-foreground'), BLANCO, 4.5)).toBeGreaterThanOrEqual(4.5);
  });
  test('[INFORMATIVO] select deshabilitado: slate-500 sobre slate-200/60 (exento por WCAG 1.4.3 al estar inactivo)', () => {
    const fondo = mezclar(tw('slate-200'), BLANCO, 0.6);
    const r = reg('slate-500 / slate-200@60% (select deshabilitado, exento)', tw('slate-500'), fondo, 4.5);
    expect(r).toBeGreaterThan(3);
  });
  test('[CORREGIDO D-08] indicador de foco global outline-ring/50 sobre blanco ≥ 3:1 (WCAG 1.4.11 / 2.4.13)', () => {
    const anillo = mezclar(app('ring'), BLANCO, 0.5);
    expect(reg('outline ring/50 / blanco (foco botones de sección)', anillo, BLANCO, 3)).toBeGreaterThanOrEqual(3);
  });
  test('[OBSERVACIÓN] anillo de foco de inputs ring-slate-900/20 por sí solo < 3:1 (compensa borde slate-900)', () => {
    const anillo = mezclar(tw('slate-900'), BLANCO, 0.2);
    const r = reg('ring slate-900/20 / blanco (inputs; el borde slate-900 sí contrasta)', anillo, BLANCO, 3);
    const borde = reg('borde slate-900 / blanco (inputs enfocados)', tw('slate-900'), BLANCO, 3);
    expect(r).toBeLessThan(3);
    expect(borde).toBeGreaterThanOrEqual(3);
  });
});
