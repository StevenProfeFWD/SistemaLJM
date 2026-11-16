/**
 * Micro-benchmark del costo fijo de un PDF con pdfkit (misma versión y mismos
 * recursos que usa la app): documento vacío, + fuentes Roboto, + logo PNG, + logo JPG.
 * No ejecuta código de la app; solo aísla qué recursos dominan el costo fijo observado.
 */
import path from 'node:path';
import { BACKEND_DIR, requireApp } from '../support/paths.mjs';

const PDFDocument = requireApp('pdfkit');
const FONTS = path.join(BACKEND_DIR, 'assets/fonts');
const IMG = path.join(BACKEND_DIR, 'public/images');

function generar({ fuentes, png, jpg }) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ ms: performance.now() - t0, bytes: Buffer.concat(chunks).length }));
    if (fuentes) {
      doc.registerFont('R', path.join(FONTS, 'Roboto-Regular.ttf'));
      doc.registerFont('B', path.join(FONTS, 'Roboto-Bold.ttf'));
      doc.font('B').text('Benemérito Liceo José Martí').font('R').text('Reporte ñ á é í ó ú');
    } else {
      doc.font('Helvetica').text('Benemerito Liceo Jose Marti');
    }
    if (png) doc.image(path.join(IMG, 'logo-mep.png'), 40, 30, { fit: [70, 40] });
    if (jpg) doc.image(path.join(IMG, 'logo-liceo.jpg'), 485, 30, { fit: [70, 40] });
    doc.end();
  });
}

const variantes = {
  vacio_helvetica: { fuentes: false, png: false, jpg: false },
  con_fuentes_roboto: { fuentes: true, png: false, jpg: false },
  con_logo_png: { fuentes: false, png: true, jpg: false },
  con_logo_jpg: { fuentes: false, png: false, jpg: true },
  completo_como_app: { fuentes: true, png: true, jpg: true },
};
const N = 15;
const res = {};
for (const [k, v] of Object.entries(variantes)) {
  await generar(v); // calentamiento
  const ms = [];
  let bytes = 0;
  for (let i = 0; i < N; i++) { const r = await generar(v); ms.push(r.ms); bytes = r.bytes; }
  ms.sort((a, b) => a - b);
  res[k] = { p50_ms: Math.round(ms[Math.floor(N / 2)] * 10) / 10, max_ms: Math.round(ms[N - 1] * 10) / 10, bytes };
}
console.log(JSON.stringify(res, null, 1));
