/**
 * Pruebas de rendimiento (app-side, BD simulada en memoria).
 * Uso: node --expose-gc --import ./perf/register.mjs perf/perf.mjs --ciclo 1 [--tamanos 10000,100000,500000] [--rapido]
 *
 * - Secuencial: latencia p50/p95/p99 de endpoints JSON y PDF; se resta el tiempo
 *   propio del fake (stats.ms) para estimar el costo de la aplicación.
 * - Concurrente: autocannon (10/50/100 conexiones) con caché del fake activada,
 *   de modo que se mide Express + agregación + serialización + PDF (no la BD).
 * - PDF grande: tiempo, tamaño, páginas, heap y RSS pico, bloqueo del event loop.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';
import { setTables, state, stats } from '../support/fakeDb.mjs';
import { generarDatos } from '../support/seed.mjs';
import { crearApp } from '../support/app.mjs';
import { cookiePara } from '../support/auth.mjs';
import { contarPaginas } from '../support/pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const CICLO = args.ciclo || 'x';
const TAMANOS = String(args.tamanos || '10000,100000,500000').split(',').map(Number);
const RAPIDO = Boolean(args.rapido);
const PUERTO = Number(args.puerto || 4510);
const DUR = Number(args.duracion || (RAPIDO ? 3 : 5));

const COOKIE = cookiePara('epi');
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0; };
const r1 = (x) => Math.round(x * 10) / 10;
const mb = (b) => r1(b / 1048576);

function pedir(ruta) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = http.get({ host: '127.0.0.1', port: PUERTO, path: ruta, agent: false, headers: { Cookie: COOKIE } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ms: performance.now() - t0, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(600000);
  });
}

async function secuencial(ruta, n) {
  const tot = []; const app = []; let status = new Set();
  for (let i = 0; i < n; i++) {
    const db0 = stats.ms;
    const r = await pedir(ruta);
    status.add(r.status);
    tot.push(r.ms); app.push(r.ms - (stats.ms - db0));
  }
  return { n, status: [...status], p50: r1(pct(tot, 50)), p95: r1(pct(tot, 95)), p99: r1(pct(tot, 99)), app_p50: r1(pct(app, 50)), app_p95: r1(pct(app, 95)), app_p99: r1(pct(app, 99)), max: r1(Math.max(...tot)) };
}

async function concurrente(ruta, connections, duration, amount) {
  const opts = { url: `http://127.0.0.1:${PUERTO}${ruta}`, connections, headers: { Cookie: COOKIE }, timeout: 300 };
  if (amount) opts.amount = amount; else opts.duration = duration;
  const t0 = performance.now();
  const res = await autocannon(opts);
  return {
    connections, duration: amount ? null : duration, amount: amount || null, wall_s: r1((performance.now() - t0) / 1000), req_total: res.requests.total, rps: r1(res.requests.average),
    p50: res.latency.p50, p90: res.latency.p90, p97_5: res.latency.p97_5, p99: res.latency.p99, max: res.latency.max,
    errores: res.errors, timeouts: res.timeouts, non2xx: res.non2xx,
  };
}

async function pdfGrande(ruta) {
  global.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  const rss0 = process.resourceUsage().maxRSS;
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  // petición ligera en paralelo para medir el impacto del bloqueo del event loop
  const sonda = []; let sonda_err = 0;
  let corriendo = true;
  const sondear = async () => {
    await new Promise((r) => setTimeout(r, 50));
    while (corriendo) { try { const r = await pedir('/api/epi/secciones/1/estudiantes?anio=2025'); sonda.push(r.ms); } catch (e) { sonda_err++; } await new Promise((x) => setTimeout(x, 100)); }
  };
  const ps = sondear();
  const db0 = stats.ms;
  const r = await pedir(ruta);
  const heapDespues = process.memoryUsage().heapUsed;
  corriendo = false; await ps;
  h.disable();
  const rss1 = process.resourceUsage().maxRSS;
  return {
    status: r.status, ms_total: r1(r.ms), ms_db_fake: r1(stats.ms - db0), ms_app: r1(r.ms - (stats.ms - db0)),
    bytes: r.body.length, mb: mb(r.body.length), paginas: contarPaginas(r.body),
    heap_delta_mb: mb(heapDespues - heap0), maxrss_mb: r1(rss1 / 1024), maxrss_delta_mb: r1((rss1 - rss0) / 1024),
    eventloop_max_ms: r1(h.max / 1e6), sonda_max_ms: r1(Math.max(0, ...sonda)), sonda_n: sonda.length, sonda_errores: sonda_err,
  };
}

function contarIncidencias(tablas, desde, hasta) {
  let n = 0;
  for (const a of tablas.asistencia) if (a.fecha >= desde && a.fecha <= hasta && a.estado !== 'presente') n++;
  return n;
}

async function main() {
  const inicio = new Date();
  const app = await crearApp();
  const server = http.createServer(app);
  server.keepAliveTimeout = 120000; server.headersTimeout = 125000; server.requestTimeout = 0;
  process.on('unhandledRejection', (e) => console.error('unhandledRejection', e?.message));
  await new Promise((r) => server.listen(PUERTO, '127.0.0.1', r));
  const salida = { ciclo: CICLO, inicio: inicio.toISOString(), node: process.version, nota: 'BD simulada en memoria: se mide costo app-side', datasets: [] };

  const RUTAS_JSON = {
    json_mensual: '/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-03-15',
    json_anual: '/api/epi/reporte-asistencia?periodo=anual&fecha_referencia=2025-03-15',
    json_anual_filtrado: '/api/epi/reporte-asistencia?periodo=anual&fecha_referencia=2025-03-15&id_seccion=3&id_materia=2',
    estudiantes: '/api/epi/secciones/1/estudiantes?anio=2025',
  };
  const RUTAS_PDF = {
    pdf_semanal: '/api/epi/reporte-asistencia/pdf?periodo=semanal&fecha_referencia=2025-03-12',
    pdf_mensual: '/api/epi/reporte-asistencia/pdf?periodo=mensual&fecha_referencia=2025-03-15',
    pdf_anual_seccion: '/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-15&id_seccion=3',
    pdf_anual_estudiante: '/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-15&id_estudiante=1005',
  };

  for (const n of TAMANOS) {
    const t0 = performance.now();
    const tablas = generarDatos({ asistencias: n, seed: 42 });
    setTables(tablas);
    state.cache = false;
    const ds = { asistencias: n, seed_ms: r1(performance.now() - t0), incidencias_anual: contarIncidencias(tablas, '2025-01-01', '2025-12-31'), incidencias_mensual_marzo: contarIncidencias(tablas, '2025-03-01', '2025-03-31'), secuencial: {}, concurrente: {}, pdf: {} };
    console.log(`[${new Date().toISOString()}] [ciclo ${CICLO}] dataset ${n} filas (incidencias anual=${ds.incidencias_anual})`);

    const reps = n >= 500000 ? (RAPIDO ? 5 : 10) : (RAPIDO ? 10 : 30);
    for (const [k, ruta] of Object.entries(RUTAS_JSON)) ds.secuencial[k] = await secuencial(ruta, reps);
    const repsPdf = n >= 500000 ? 3 : (RAPIDO ? 3 : 8);
    for (const [k, ruta] of Object.entries(RUTAS_PDF)) ds.secuencial[k] = await secuencial(ruta, repsPdf);

    // Concurrencia (caché del fake activa => costo app-side)
    state.cache = true;
    for (const c of [10, 50, 100]) ds.concurrente[`json_mensual_c${c}`] = await concurrente(RUTAS_JSON.json_mensual, c, DUR);
    ds.concurrente.json_anual_c50 = await concurrente(RUTAS_JSON.json_anual, 50, DUR);
    ds.concurrente.pdf_semanal_c10 = await concurrente(RUTAS_PDF.pdf_semanal, 10, null, RAPIDO ? 20 : 30);
    ds.concurrente.pdf_semanal_c50 = await concurrente(RUTAS_PDF.pdf_semanal, 50, null, 50);
    if (n <= 100000) ds.concurrente.pdf_mensual_c10 = await concurrente(RUTAS_PDF.pdf_mensual, 10, null, 20);
    state.cache = false;

    // PDF de todo el colegio (peor caso): mensual siempre; anual si n <= --anual-max
    ds.pdf.mensual_colegio = await pdfGrande('/api/epi/reporte-asistencia/pdf?periodo=mensual&fecha_referencia=2025-03-15');
    console.log(`  PDF mensual colegio: ${ds.pdf.mensual_colegio.ms_total} ms, ${ds.pdf.mensual_colegio.paginas} págs, ${ds.pdf.mensual_colegio.mb} MB, maxRSS ${ds.pdf.mensual_colegio.maxrss_mb} MB`);
    if (n <= Number(args['anual-max'] || 100000)) {
      ds.pdf.anual_colegio = await pdfGrande('/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-15');
      console.log(`  PDF anual colegio: ${ds.pdf.anual_colegio.ms_total} ms, ${ds.pdf.anual_colegio.paginas} págs, ${ds.pdf.anual_colegio.mb} MB, maxRSS ${ds.pdf.anual_colegio.maxrss_mb} MB`);
    }
    salida.datasets.push(ds);
    state.cacheMap = new Map();
    global.gc?.();
  }

  salida.fin = new Date().toISOString();
  server.close();
  const out = path.resolve(here, '../resultados', `perf-ciclo-${CICLO}.json`);
  fs.writeFileSync(out, JSON.stringify(salida, null, 2));
  console.log(`Resultados en ${out}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
