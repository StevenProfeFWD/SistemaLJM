// Lee resultados/ultimo.json (reporter json de vitest) y coverage/coverage-summary.json
// y agrega una fila a resultados/ciclos.csv.
import fs from 'node:fs';
const ciclo = process.argv[2] || '?';
const r = JSON.parse(fs.readFileSync('resultados/ultimo.json', 'utf8'));
let cov = { statements: { pct: NaN }, branches: { pct: NaN }, functions: { pct: NaN }, lines: { pct: NaN } };
let epi = { s: NaN, b: NaN };
try {
  const all = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
  cov = all.total;
  // Cobertura del alcance EPI (archivos objetivo del encargo)
  const objetivo = ['epiReportesService.js', 'pdfService.js', 'roles.js', 'verificarRoles.js', 'estadoAsistencia.js', 'epiController.js', 'epiRoutes.js'];
  let st = 0, sc = 0, bt = 0, bc = 0;
  for (const [f, v] of Object.entries(all)) {
    if (f === 'total') continue;
    if (objetivo.some((o) => f.split('\\').join('/').endsWith('/' + o))) {
      st += v.statements.total; sc += v.statements.covered; bt += v.branches.total; bc += v.branches.covered;
    }
  }
  epi = { s: +(100 * sc / st).toFixed(2), b: +(100 * bc / bt).toFixed(2) };
} catch {}
const dur = r.testResults.reduce((a, t) => Math.max(a, t.endTime), 0) - r.startTime;
const fila = [
  ciclo,
  new Date().toISOString(),
  r.numTotalTests,
  r.numPassedTests,
  r.numFailedTests,
  r.numPendingTests + (r.numTodoTests || 0),
  (dur / 1000).toFixed(2),
  cov.statements.pct,
  cov.branches.pct,
  cov.functions.pct,
  cov.lines.pct,
  epi.s,
  epi.b,
].join(',');
const csv = 'resultados/ciclos.csv';
if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'ciclo,timestamp,total,pasaron,fallaron,omitidas,duracion_s,stmts_pct,branches_pct,funcs_pct,lines_pct\n');
fs.appendFileSync(csv, fila + '\n');
// Lista de pruebas fallidas (para detectar flakiness entre corridas)
const fallidas = r.testResults.flatMap((t) => t.assertionResults.filter((a) => a.status === 'failed').map((a) => `${t.name.split(/[\/]tests[\/]/)[1]} :: ${a.fullName}`));
fs.writeFileSync(`resultados/fallidas-ciclo-${ciclo}.txt`, fallidas.join('\n'));
console.log(fila);
console.log(`fallidas: ${fallidas.length}`);
// Estado por prueba (para comparar corridas idénticas y detectar pruebas inestables)
const estados = {};
for (const t of r.testResults) for (const a of t.assertionResults) estados[`${t.name.split(/[\/]tests[\/]/)[1]} :: ${a.fullName}`] = a.status;
fs.writeFileSync(`resultados/estados-ciclo-${ciclo}.json`, JSON.stringify(estados, null, 0));
