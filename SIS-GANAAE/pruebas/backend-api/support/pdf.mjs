/** Utilidades de inspección de PDF (sin dependencias). */
export function contarPaginas(buf) {
  const s = buf.toString('latin1');
  const m = s.match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}
export function esPdfValido(buf) {
  const s = buf.toString('latin1');
  return s.startsWith('%PDF-') && /%%EOF\s*$/.test(s);
}
/** Parser binario para supertest. */
export function binParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
