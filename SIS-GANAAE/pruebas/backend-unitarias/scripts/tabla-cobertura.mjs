// Imprime la tabla de cobertura por archivo (Markdown) desde coverage/coverage-summary.json
import fs from 'node:fs';
import path from 'node:path';
const s = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
const filas = [];
for (const [f, v] of Object.entries(s)) {
  const n = f === 'total' ? 'TOTAL (archivos cargados)' : f.split(path.sep).join('/').split('/src/')[1];
  filas.push(`| \`${n}\` | ${v.statements.pct} | ${v.branches.pct} (${v.branches.covered}/${v.branches.total}) | ${v.functions.pct} | ${v.lines.pct} |`);
}
console.log('| Archivo | % Sentencias | % Ramas (cubiertas/total) | % Funciones | % Líneas |\n|---|---:|---:|---:|---:|\n' + filas.join('\n'));
