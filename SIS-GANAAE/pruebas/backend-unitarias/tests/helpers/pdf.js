import { Writable } from 'node:stream';

/** Stream escribible en memoria que imita a `res` de Express para recibir el PDF. */
export function crearSumidero() {
  const trozos = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      trozos.push(Buffer.from(chunk));
      cb();
    },
  });
  const terminado = new Promise((ok, ko) => {
    stream.on('finish', () => ok(Buffer.concat(trozos)));
    stream.on('error', ko);
  });
  return { stream, terminado };
}

/** Genera el PDF con la función dada y devuelve el Buffer completo. */
export async function generarPdf(fn, ...args) {
  const { stream, terminado } = crearSumidero();
  await fn(stream, ...args);
  return terminado;
}

let pdfjs;
/** Extrae { paginas, textos[] } con pdfjs-dist (texto por página). */
export async function extraerTexto(buffer) {
  pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const textos = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    textos.push(tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' '));
  }
  const paginas = doc.numPages;
  await doc.destroy();
  return { paginas, textos, todo: textos.join('\n') };
}

/** Ítems de texto de la página `n` (1-based) con posición x y ancho en puntos. */
export async function extraerItems(buffer, n = 1) {
  pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, verbosity: 0 }).promise;
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const items = tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }));
  await doc.destroy();
  return items;
}
