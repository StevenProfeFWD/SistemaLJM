/** Conversión OKLCH → sRGB y razón de contraste WCAG 2.x (sin dependencias). */
import fs from 'node:fs';
import path from 'node:path';

export const APP = path.resolve(__dirname, '../../../../frontend-reactjs');

export function leerTokenTailwind(nombre) {
  const css = fs.readFileSync(path.join(APP, 'node_modules/tailwindcss/theme.css'), 'utf8');
  const m = new RegExp(`--color-${nombre}:\\s*oklch\\(([^)]+)\\)`).exec(css);
  if (!m) throw new Error(`token no encontrado: ${nombre}`);
  return parseOklch(m[1]);
}

export function leerVariableApp(nombre) {
  const css = fs.readFileSync(path.join(APP, 'src/index.css'), 'utf8');
  const m = new RegExp(`--${nombre}:\\s*oklch\\(([^)]+)\\)`).exec(css);
  if (!m) throw new Error(`variable no encontrada: ${nombre}`);
  return parseOklch(m[1]);
}

function parseOklch(s) {
  const [l, c, h] = s.trim().split(/\s+/);
  const L = l.endsWith('%') ? parseFloat(l) / 100 : parseFloat(l);
  return oklchToRgb(L, parseFloat(c), parseFloat(h || 0));
}

export function oklchToRgb(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  });
}

export const BLANCO = [1, 1, 1];

export function mezclar(fg, bg, alfa) {
  return fg.map((v, i) => v * alfa + bg[i] * (1 - alfa));
}

function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

export const hex = (rgb) => `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
