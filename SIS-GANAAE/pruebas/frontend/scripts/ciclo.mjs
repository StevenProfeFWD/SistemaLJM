// Ejecuta la suite completa y agrega una línea al registro de ciclos (resultados/ciclos.jsonl).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const res = path.join(raiz, 'resultados');
fs.mkdirSync(res, { recursive: true });
const etiqueta = process.argv[2] || 'ciclo';
const t0 = Date.now();
const r = spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${path.join(res, 'ultimo.json')}`], { cwd: raiz, shell: true, encoding: 'utf8' });
const dur = Date.now() - t0;
const j = JSON.parse(fs.readFileSync(path.join(res, 'ultimo.json'), 'utf8'));
let axe = {};
try { axe = JSON.parse(fs.readFileSync(path.join(res, 'axe-ultimo.json'), 'utf8')).estados; } catch {}
const fallidas = [];
for (const f of j.testResults) for (const a of f.assertionResults) if (a.status === 'failed') fallidas.push(`${path.basename(f.name)} :: ${a.fullName}`);
const linea = {
  etiqueta, inicio: new Date(t0).toISOString(), duracion_ms: dur,
  archivos: j.testResults.length, total: j.numTotalTests, pasaron: j.numPassedTests, fallaron: j.numFailedTests,
  axe_violaciones_por_estado: Object.fromEntries(Object.entries(axe).map(([k, v]) => [k, v.length])),
  fallidas,
};
try { linea.rendimiento_en_paralelo = JSON.parse(fs.readFileSync(path.join(res, 'rendimiento.json'), 'utf8')).medidas; } catch {}
// Segunda pasada: solo rendimiento, aislado (sin competencia con otros workers de vitest)
spawnSync('npx', ['vitest', 'run', 'tests/rendimiento', '--reporter=json', `--outputFile=${path.join(res, 'rend-aislado.json')}`], { cwd: raiz, shell: true, encoding: 'utf8' });
try {
  const j2 = JSON.parse(fs.readFileSync(path.join(res, 'rend-aislado.json'), 'utf8'));
  linea.rendimiento_aislado = { pasaron: j2.numPassedTests, fallaron: j2.numFailedTests, medidas: JSON.parse(fs.readFileSync(path.join(res, 'rendimiento.json'), 'utf8')).medidas };
} catch {}
fs.appendFileSync(path.join(res, 'ciclos.jsonl'), JSON.stringify(linea) + '\n');
console.log(JSON.stringify({ ...linea, fallidas: fallidas.length }, null, 1));
console.log(fallidas.join('\n'));
if (r.status !== 0 && j.numFailedTests === 0) console.error(r.stderr.slice(-3000));
