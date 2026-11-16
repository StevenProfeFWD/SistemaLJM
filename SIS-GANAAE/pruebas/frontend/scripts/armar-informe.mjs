// Arma INFORME.md a partir de scripts/INFORME.plantilla.md y de los archivos de resultados/.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const r = (p) => fs.readFileSync(path.join('resultados', p), 'utf8');
execSync('node scripts/resumen.mjs', { stdio: 'inherit' });
const j = JSON.parse(r('ultimo.json'));
const ciclos = r('ciclos.jsonl').trim().split('\n');
const mut = JSON.parse(r('mutantes.json'));
const con = JSON.parse(r('contraste.json'));
const esc = (s) => String(s).replace(/\|/g, '\|');
const tMut = '| Mutante | Cambio introducido | ¿Detectado? | Pruebas nuevas que fallan | Ejemplo |\n|---|---|---|---:|---|\n'
  + mut.map((m) => `| ${m.mutante} | ${m.descripcion} | ${m.muerto ? 'Sí' : '**No**'} | ${m.pruebas_que_lo_detectan} | ${esc(m.ejemplo)} |`).join('\n') + '\n';
const tCon = '| Combinación | Texto | Fondo | Razón | Mínimo | ¿Cumple? |\n|---|---|---|---:|---:|---|\n'
  + con.map((c) => `| ${c.caso} | \`${c.fg}\` | \`${c.bg}\` | ${c.razon}:1 | ${c.minimo}:1 | ${c.cumple ? 'Sí' : '**No**'} |`).join('\n') + '\n';
const fin = process.argv[2] || new Date().toLocaleTimeString('es-CR', { hour12: false });
const LC = ciclos.map(JSON.parse);
const KK = { R_RENDER: 'render_inicial_ms', R_EXP: 'expandir_todo_ms', R_CON: 'contraer_todo_ms', R_FIL: 'cambio_filtro_expandido_ms' };
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const rangos = {}; let nMed = 0;
for (const [ph, k] of Object.entries(KK)) {
  const v = [];
  for (const l of LC) for (const m of [l.rendimiento_en_paralelo, l.rendimiento_aislado && l.rendimiento_aislado.medidas]) if (m && m[k] != null) v.push(m[k]);
  rangos[ph] = fmt(Math.min(...v)) + ' – ' + fmt(Math.max(...v)) + ' ms'; nMed = v.length;
}
const prof = LC.map((l) => l.rendimiento_aislado?.medidas?.profiler_cambio_filtro).filter(Boolean);
rangos.R_PROF = Math.min(...prof.map((x) => x.actual_ms)) + '-' + Math.max(...prof.map((x) => x.actual_ms)) + ' ms en jsdom, ' + prof.length + ' mediciones';
rangos.R_N = nMed;
let t = fs.readFileSync('scripts/INFORME.plantilla.md', 'utf8')
  .replaceAll('{{TOTAL}}', j.numTotalTests).replaceAll('{{PASAN}}', j.numPassedTests).replaceAll('{{FALLAN}}', j.numFailedTests)
  .replaceAll('{{FIN}}', fin).replaceAll('{{CICLOS}}', ciclos.length)
  .replace('{{TABLA_ARCHIVOS}}', r('tabla-archivos.md')).replace('{{TABLA_FALLIDAS}}', r('fallidas.md'))
  .replace('{{LISTA_PASARON}}', r('pasaron.md')).replace('{{TABLA_CICLOS}}', r('ciclos.md'))
  .replace('{{TABLA_MUTANTES}}', tMut).replace('{{TABLA_CONTRASTE}}', tCon);
for (const [k, v] of Object.entries(rangos)) t = t.replaceAll('{{' + k + '}}', v);
fs.writeFileSync('INFORME.md', t);
console.log('INFORME.md generado', j.numTotalTests, j.numPassedTests, j.numFailedTests);
