// Compara resultados de cada prueba entre ciclos (vitest-ciclo-*.json) para detectar inestabilidad.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resultados');
const files = fs.readdirSync(dir).filter((f) => /^vitest-ciclo-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
const estados = new Map();
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const t of d.testResults) for (const a of t.assertionResults) {
    const k = `${path.basename(t.name)} > ${a.fullName}`;
    if (!estados.has(k)) estados.set(k, []);
    estados.get(k).push(a.status);
  }
}
const inestables = [...estados].filter(([, s]) => new Set(s).size > 1);
console.log(`ciclos: ${files.length}; pruebas distintas: ${estados.size}; con resultado variable entre ciclos: ${inestables.length}`);
for (const [k, s] of inestables) console.log(`- ${k}: ${s.join(',')}`);
