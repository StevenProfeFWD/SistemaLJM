/**
 * Ejecuta un ciclo completo: suite vitest + pasada de rendimiento, y agrega un
 * resumen a resultados/ciclos.jsonl.
 * Uso: node perf/ciclo.mjs <n> [args extra para perf.mjs]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const n = process.argv[2] || 'x';
const extra = process.argv.slice(3);
const ts = new Date().toISOString();

const t0 = Date.now();
spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
const vit = JSON.parse(fs.readFileSync(path.join(root, 'resultados/ultimo-vitest.json'), 'utf8'));
fs.copyFileSync(path.join(root, 'resultados/ultimo-vitest.json'), path.join(root, `resultados/vitest-ciclo-${n}.json`));
const suiteMs = Date.now() - t0;
const fallidos = [];
const porArchivo = {};
for (const f of vit.testResults) {
  const nombre = path.basename(f.name);
  porArchivo[nombre] = { total: f.assertionResults.length, pasaron: f.assertionResults.filter((a) => a.status === 'passed').length, fallaron: f.assertionResults.filter((a) => a.status === 'failed').length, ms: f.endTime - f.startTime };
  for (const a of f.assertionResults) if (a.status === 'failed') fallidos.push(`${nombre} > ${a.fullName}`);
}

const t1 = Date.now();
const p = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=4096', '--import', './perf/register.mjs', 'perf/perf.mjs', '--ciclo', String(n), ...extra], { cwd: root, stdio: 'inherit' });


const perfMs = Date.now() - t1;
let perf = null;
try { perf = JSON.parse(fs.readFileSync(path.join(root, `resultados/perf-ciclo-${n}.json`), 'utf8')); } catch { /* perf falló */ }

const resumen = {
  ciclo: n, timestamp: ts, suite_ms: suiteMs, perf_ms: perfMs, perf_exit: p.status,
  tests: { total: vit.numTotalTests, pasaron: vit.numPassedTests, fallaron: vit.numFailedTests },
  por_archivo: porArchivo, fallidos,
  perf: perf && perf.datasets.map((d) => ({
    filas: d.asistencias,
    json_mensual_seq_p50: d.secuencial.json_mensual.p50, json_mensual_seq_p95: d.secuencial.json_mensual.p95, json_mensual_app_p50: d.secuencial.json_mensual.app_p50,
    json_anual_seq_p95: d.secuencial.json_anual.p95,
    pdf_semanal_seq_p50: d.secuencial.pdf_semanal.p50, pdf_mensual_seq_p50: d.secuencial.pdf_mensual.p50,
    json_c10_p99: d.concurrente.json_mensual_c10.p99, json_c50_p99: d.concurrente.json_mensual_c50.p99, json_c100_p99: d.concurrente.json_mensual_c100.p99, json_c100_rps: d.concurrente.json_mensual_c100.rps,
    pdf_semanal_c10_p50: d.concurrente.pdf_semanal_c10.p50, pdf_semanal_c50_p99: d.concurrente.pdf_semanal_c50.p99,
    pdf_mensual_colegio_ms: d.pdf.mensual_colegio?.ms_total, pdf_mensual_colegio_pags: d.pdf.mensual_colegio?.paginas,
    pdf_anual_colegio_ms: d.pdf.anual_colegio?.ms_total, pdf_anual_colegio_pags: d.pdf.anual_colegio?.paginas, pdf_anual_colegio_mb: d.pdf.anual_colegio?.mb, pdf_anual_maxrss_mb: d.pdf.anual_colegio?.maxrss_mb,
  })),
};
fs.appendFileSync(path.join(root, 'resultados/ciclos.jsonl'), JSON.stringify(resumen) + '\n');
console.log(JSON.stringify({ ciclo: n, tests: resumen.tests, suite_ms: suiteMs, perf_ms: perfMs }, null, 0));
