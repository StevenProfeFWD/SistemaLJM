/**
 * Genera tablas Markdown a partir de resultados/*.json(l) -> resultados/tablas.md
 * Uso: node perf/tablas.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'resultados');
const ciclos = fs.existsSync(path.join(dir, 'ciclos.jsonl'))
  ? fs.readFileSync(path.join(dir, 'ciclos.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  : [];
const perfs = fs.readdirSync(dir).filter((f) => /^perf-ciclo-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

let md = '';
md += '## Bitácora por ciclo\n\n| Ciclo | Inicio (UTC) | Tests | Pasaron | Fallaron | Suite (s) | Perf (s) | Datasets |\n|---|---|---|---|---|---|---|---|\n';
for (const c of ciclos) md += `| ${c.ciclo} | ${c.timestamp.slice(11, 19)} | ${c.tests.total} | ${c.tests.pasaron} | ${c.tests.fallaron} | ${(c.suite_ms / 1000).toFixed(0)} | ${(c.perf_ms / 1000).toFixed(0)} | ${(c.perf || []).map((p) => p.filas).join(', ')} |\n`;

md += '\n## Secuencial (ms) por ciclo y dataset\n\n| Ciclo | Filas | Endpoint | n | p50 | p95 | p99 | app p50 | app p95 | max |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const p of perfs.sort((a, b) => String(a.ciclo).localeCompare(String(b.ciclo), 'es', { numeric: true }))) {
  for (const d of p.datasets) for (const [k, v] of Object.entries(d.secuencial)) md += `| ${p.ciclo} | ${d.asistencias} | ${k} | ${v.n} | ${v.p50} | ${v.p95} | ${v.p99} | ${v.app_p50} | ${v.app_p95} | ${v.max} |\n`;
}
md += '\n## Concurrente (autocannon, caché del fake activa) por ciclo y dataset\n\n| Ciclo | Filas | Escenario | Conex. | Reqs | req/s | p50 | p90 | p97.5 | p99 | max | errores | timeouts | non2xx |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const p of perfs) {
  for (const d of p.datasets) for (const [k, v] of Object.entries(d.concurrente)) md += `| ${p.ciclo} | ${d.asistencias} | ${k} | ${v.connections} | ${v.req_total} | ${v.amount ? (v.req_total / v.wall_s).toFixed(1) : v.rps} | ${v.p50} | ${v.p90} | ${v.p97_5} | ${v.p99} | ${v.max} | ${v.errores} | ${v.timeouts} | ${v.non2xx} |\n`;
}
md += '\n## PDF de todo el colegio (peor caso)\n\n| Ciclo | Filas | Incidencias | Periodo | ms total | ms fake BD | ms app | MB | Páginas | maxRSS (MB) | ΔmaxRSS (MB) | Event loop max (ms) | Sonda max (ms) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const p of perfs) {
  for (const d of p.datasets) for (const [k, v] of Object.entries(d.pdf)) md += `| ${p.ciclo} | ${d.asistencias} | ${k.startsWith('anual') ? d.incidencias_anual : d.incidencias_mensual_marzo} | ${k} | ${v.ms_total} | ${v.ms_db_fake} | ${v.ms_app} | ${v.mb} | ${v.paginas} | ${v.maxrss_mb} | ${v.maxrss_delta_mb} | ${v.eventloop_max_ms} | ${v.sonda_max_ms} |\n`;
}

// Variabilidad entre ciclos (mismo dataset y métrica)
const series = new Map();
const push = (k, v) => { if (typeof v === 'number') { if (!series.has(k)) series.set(k, []); series.get(k).push(v); } };
for (const p of perfs) for (const d of p.datasets) {
  for (const [k, v] of Object.entries(d.secuencial)) { push(`${d.asistencias}|seq ${k} p50`, v.p50); push(`${d.asistencias}|seq ${k} p95`, v.p95); }
  for (const [k, v] of Object.entries(d.concurrente)) { push(`${d.asistencias}|conc ${k} p50`, v.p50); push(`${d.asistencias}|conc ${k} p99`, v.p99); }
  for (const [k, v] of Object.entries(d.pdf)) push(`${d.asistencias}|pdf ${k} ms`, v.ms_total);
}
const esc = fs.readdirSync(dir).filter((f) => /^escalado-ciclo-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
for (const e of esc) for (const f of e.filas) push(`escalado|${f.incidencias} incidencias ms`, f.ms_total);
md += `
## Variabilidad entre ciclos

| Dataset | Métrica | n ciclos | media | mín | máx | CV % |
|---|---|---|---|---|---|---|
`;
for (const [k, arr] of series) {
  if (arr.length < 2) continue;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
  const [ds, met] = k.split('|');
  md += `| ${ds} | ${met} | ${arr.length} | ${m.toFixed(1)} | ${Math.min(...arr)} | ${Math.max(...arr)} | ${m ? ((sd / m) * 100).toFixed(0) : 0} |
`;
}
md += `
## Barrido de escalado del PDF anual (todas las filas son incidencias)

| Ciclo | Incidencias | ms total | ms app | Páginas | MB | ms/página | RSS tras (MB) | ΔRSS (MB) | Δheap total (MB) | Event loop max (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
`;
for (const e of esc) for (const f of e.filas) md += `| ${e.ciclo} | ${f.incidencias} | ${f.ms_total} | ${f.ms_app} | ${f.paginas} | ${f.mb} | ${f.ms_por_pagina} | ${f.rss_mb} | ${f.rss_delta_mb} | ${f.heap_total_delta_mb} | ${f.eventloop_max_ms} |
`;
fs.writeFileSync(path.join(dir, 'tablas.md'), md);
console.log(md);
