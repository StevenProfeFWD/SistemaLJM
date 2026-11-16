// Genera fragmentos Markdown a partir de resultados/ultimo.json y resultados/ciclos.jsonl
import fs from 'node:fs';
import path from 'node:path';
const raiz = process.cwd();
const j = JSON.parse(fs.readFileSync(path.join(raiz, 'resultados/ultimo.json'), 'utf8'));
const rel = (n) => path.relative(raiz, n).split(path.sep).join('/');
const esc = (s) => String(s).replace(/\|/g, '\|');
let out = '';
out += '| Archivo | Tipo | Pruebas | Pasan | Fallan |\n|---|---|---:|---:|---:|\n';
const tipo = (f) => f.includes('/unit/') ? 'Unitaria / componente' : f.includes('/funcionales/') ? 'Funcional' : f.includes('/usabilidad/') ? 'Usabilidad / accesibilidad' : 'Rendimiento';
const files = [...j.testResults].sort((a, b) => rel(a.name).localeCompare(rel(b.name)));
for (const t of files) {
  const p = t.assertionResults.filter((a) => a.status === 'passed').length;
  const f = t.assertionResults.filter((a) => a.status === 'failed').length;
  out += `| \`${rel(t.name)}\` | ${tipo(rel(t.name))} | ${t.assertionResults.length} | ${p} | ${f} |\n`;
}
out += `| **Total** | | **${j.numTotalTests}** | **${j.numPassedTests}** | **${j.numFailedTests}** |\n\n`;
fs.writeFileSync(path.join(raiz, 'resultados/tabla-archivos.md'), out);

let fal = '';
for (const t of files) for (const a of t.assertionResults) if (a.status === 'failed') {
  const msg = (a.failureMessages[0] || '').split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').slice(0, 160);
  fal += `| \`${path.basename(t.name)}\` | ${esc([...a.ancestorTitles, a.title].join(' › '))} | ${esc(msg)} |\n`;
}
fs.writeFileSync(path.join(raiz, 'resultados/fallidas.md'), '| Archivo | Prueba | Mensaje de la aserción |\n|---|---|---|\n' + fal);

let pas = '';
for (const t of files) {
  const ok = t.assertionResults.filter((a) => a.status === 'passed');
  if (!ok.length) continue;
  pas += `\n**${rel(t.name)}** (${ok.length})\n\n`;
  for (const a of ok) pas += `- ✔ ${[...a.ancestorTitles, a.title].join(' › ')}\n`;
}
fs.writeFileSync(path.join(raiz, 'resultados/pasaron.md'), pas);

const ciclos = fs.readFileSync(path.join(raiz, 'resultados/ciclos.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
let c = '| # | Inicio (UTC) | Descripción | Archivos | Pruebas | Pasan | Fallan | Duración suite | Violaciones axe (8 estados, sin contraste) | Rendimiento aislado (pasan/fallan) |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|\n';
ciclos.forEach((l, i) => {
  const axe = Object.values(l.axe_violaciones_por_estado || {}).reduce((a, b) => a + b, 0);
  const ra = l.rendimiento_aislado ? `${l.rendimiento_aislado.pasaron}/${l.rendimiento_aislado.fallaron}` : '—';
  c += `| ${i + 1} | ${l.inicio.slice(11, 19)} | ${esc(l.etiqueta)} | ${l.archivos} | ${l.total} | ${l.pasaron} | ${l.fallaron} | ${(l.duracion_ms / 1000).toFixed(1)} s | ${axe} | ${ra} |\n`;
});
fs.writeFileSync(path.join(raiz, 'resultados/ciclos.md'), c);
console.log('ok', j.numTotalTests, j.numPassedTests, j.numFailedTests);
