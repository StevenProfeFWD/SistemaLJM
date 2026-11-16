// Ejecuta las pruebas de la página EPI contra cada mutante y cuenta cuántas pruebas lo "matan".
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const desc = {
  M1: 'No reinicia el estudiante al cambiar de sección',
  M2: 'PDF usa los filtros actuales en vez de los del reporte mostrado',
  M3: 'Se elimina aria-expanded de los botones de sección',
  M4: 'Umbral de color verde cambia de >=90 a >90',
  M5: 'id_estudiante se envía aunque no haya sección',
  M6: 'Se ignora la cancelación de respuestas tardías de estudiantes',
  M7: 'Select Estudiante habilitado sin sección',
  M8: 'Mensual envía AAAA-MM en vez de AAAA-MM-01',
};
const archivos = ['tests/unit/ReportesEpi.componente.test.jsx', 'tests/unit/ReportesEpi.bordes.test.jsx', 'tests/unit/ReportesEpi.estado-oculto.test.jsx', 'tests/usabilidad/accesibilidad.test.jsx', 'tests/funcionales/flujo-epi.test.jsx'];
// Línea base: fallas conocidas con el código original (defectos documentados)
const correr = (env) => {
  const out = `resultados/mut-${env.MUTANTE || 'base'}.json`;
  spawnSync('npx', ['vitest', 'run', '--config', env.MUTANTE ? 'vitest.mutantes.config.js' : 'vitest.config.js', ...archivos, '--reporter=json', `--outputFile=${out}`], { shell: true, env: { ...process.env, ...env }, encoding: 'utf8' });
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  if (!j.numTotalTests) throw new Error('El mutante no ejecutó pruebas (error de compilación)');
  const f = new Set();
  for (const t of j.testResults) for (const a of t.assertionResults) if (a.status === 'failed') f.add(a.fullName);
  return f;
};
const base = correr({});
const lista = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(desc);
let previas = [];
try { previas = JSON.parse(fs.readFileSync('resultados/mutantes.json', 'utf8')); } catch {}
const filas = previas.filter((p) => !lista.includes(p.mutante));
for (const m of lista) {
  const f = correr({ MUTANTE: m });
  const nuevas = [...f].filter((x) => !base.has(x));
  filas.push({ mutante: m, descripcion: desc[m], muerto: nuevas.length > 0, pruebas_que_lo_detectan: nuevas.length, ejemplo: nuevas[0] || '' });
  console.log(m, nuevas.length, nuevas[0] || '');
}
filas.sort((a, b) => a.mutante.localeCompare(b.mutante));
fs.writeFileSync('resultados/mutantes.json', JSON.stringify(filas, null, 2));
