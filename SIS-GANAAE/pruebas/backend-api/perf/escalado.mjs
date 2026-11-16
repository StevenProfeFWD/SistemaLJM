/**
 * Barrido de escalado del PDF: genera datasets donde TODAS las filas son incidencias
 * (ausente/tardanza/justificado) para encontrar dónde el PDF supera ~5 s y cómo crece
 * la memoria. Además mide el costo fijo de un PDF vacío.
 * Uso: node --expose-gc --import ./perf/register.mjs perf/escalado.mjs --ciclo N [--incidencias 2500,5000,...]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { setTables, stats } from '../support/fakeDb.mjs';
import { generarDatos } from '../support/seed.mjs';
import { crearApp } from '../support/app.mjs';
import { cookiePara } from '../support/auth.mjs';
import { contarPaginas } from '../support/pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const CICLO = arg('ciclo', 'x');
const LISTA = String(arg('incidencias', '0,2500,5000,10000,20000,40000,80000')).split(',').map(Number);
const PUERTO = 4512;
const COOKIE = cookiePara('epi');
const r1 = (x) => Math.round(x * 10) / 10;

const pedir = (ruta) => new Promise((resolve, reject) => {
  const t0 = performance.now();
  http.get({ host: '127.0.0.1', port: PUERTO, path: ruta, agent: false, headers: { Cookie: COOKIE } }, (res) => {
    const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, ms: performance.now() - t0, body: Buffer.concat(c) }));
  }).on('error', reject);
});

const app = await crearApp();
const server = http.createServer(app);
server.keepAliveTimeout = 120000; server.requestTimeout = 0;
await new Promise((r) => server.listen(PUERTO, '127.0.0.1', r));
const out = { ciclo: CICLO, inicio: new Date().toISOString(), filas: [] };

for (const n of LISTA) {
  const t = generarDatos({ asistencias: Math.max(n, 1), seed: 5 });
  const est = ['ausente', 'tardanza', 'justificado'];
  t.asistencia = t.asistencia.slice(0, n).map((a, i) => ({ ...a, estado: est[i % 3] }));
  setTables(t);
  global.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  const peak0 = v8.getHeapStatistics().total_heap_size;
  const rss0 = process.memoryUsage().rss;
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  // muestreo de memoria fuera del event loop no es posible; se registra al terminar
  const db0 = stats.ms;
  const r = await pedir('/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-15');
  h.disable();
  const mem = process.memoryUsage();
  const fila = {
    incidencias: n, status: r.status, ms_total: r1(r.ms), ms_fake: r1(stats.ms - db0), ms_app: r1(r.ms - (stats.ms - db0)),
    paginas: contarPaginas(r.body), mb: r1(r.body.length / 1048576),
    heap_tras_mb: r1((mem.heapUsed - heap0) / 1048576), heap_total_mb: r1(mem.heapTotal / 1048576), heap_total_delta_mb: r1((v8.getHeapStatistics().total_heap_size - peak0) / 1048576),
    rss_mb: r1(mem.rss / 1048576), rss_delta_mb: r1((mem.rss - rss0) / 1048576), maxrss_mb: r1(process.resourceUsage().maxRSS / 1024),
    eventloop_max_ms: r1(h.max / 1e6), ms_por_pagina: r1(r.ms / Math.max(1, contarPaginas(r.body))),
  };
  out.filas.push(fila);
  console.log(JSON.stringify(fila));
  if (r.ms > 120000) { console.log('corte: > 120 s'); break; }
}
server.close();
fs.writeFileSync(path.resolve(here, '../resultados', `escalado-ciclo-${CICLO}.json`), JSON.stringify(out, null, 2));
process.exit(0);
