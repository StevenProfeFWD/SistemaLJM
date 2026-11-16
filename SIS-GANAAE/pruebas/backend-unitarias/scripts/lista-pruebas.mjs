// Genera resultados/lista-pruebas.md (tabla por archivo + lista de pruebas con su estado)
// a partir de resultados/ultimo.json (reporter json de vitest).
// Las pruebas "it.fails" (título con "(expectativa correcta)") se reportan como FALLA: vitest las
// marca como "passed" precisamente porque su aserción falla mientras el defecto exista.
import fs from 'node:fs';
import path from 'node:path';

const r = JSON.parse(fs.readFileSync('resultados/ultimo.json', 'utf8'));
const rel = (n) => n.split(path.sep).join('/').split('/').slice(-3).join('/');
const esFallaEsperada = (x) => x.status === 'passed' && x.title.includes('(expectativa correcta)');

let md = '| Archivo | Total | Pasaron | Fallan (it.fails, defecto confirmado) | Fallaron (inesperado) | Omitidas |\n|---|---:|---:|---:|---:|---:|\n';
let det = '';
let tot = { t: 0, p: 0, fe: 0, f: 0, o: 0 };
for (const t of [...r.testResults].sort((a, b) => rel(a.name).localeCompare(rel(b.name)))) {
  const a = t.assertionResults;
  const fe = a.filter(esFallaEsperada).length;
  const p = a.filter((x) => x.status === 'passed').length - fe;
  const f = a.filter((x) => x.status === 'failed').length;
  const o = a.length - p - fe - f;
  tot = { t: tot.t + a.length, p: tot.p + p, fe: tot.fe + fe, f: tot.f + f, o: tot.o + o };
  md += `| \`${rel(t.name)}\` | ${a.length} | ${p} | ${fe} | ${f} | ${o} |\n`;
  det += `\n#### \`${rel(t.name)}\`\n\n`;
  const grupos = new Map();
  for (const x of a) {
    const g = x.ancestorTitles.join(' › ') || '(raíz)';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(x);
  }
  for (const [g, xs] of grupos) {
    det += `- **${g}**\n`;
    for (const x of xs) {
      let etiqueta = 'PASÓ';
      if (x.status === 'failed') etiqueta = '**FALLÓ**';
      else if (x.status !== 'passed') etiqueta = x.status.toUpperCase();
      else if (esFallaEsperada(x)) etiqueta = '**FALLA (it.fails — defecto confirmado)**';
      det += `  - ${etiqueta} — ${x.title.split('|').join('\\|')}\n`;
    }
  }
}
md += `| **Total** | **${tot.t}** | **${tot.p}** | **${tot.fe}** | **${tot.f}** | **${tot.o}** |\n`;
fs.writeFileSync('resultados/lista-pruebas.md', `${md}\n### Detalle de cada prueba\n${det}`);
console.log(md);
