// Rellena las tablas generadas de INFORME.md a partir de resultados/ (re-ejecutable).
// Requiere: node scripts/lista-pruebas.mjs y node scripts/tabla-cobertura.mjs > resultados/tabla-cobertura.md
import fs from 'node:fs';

const lista = fs.readFileSync('resultados/lista-pruebas.md', 'utf8');
const [tablaArchivos, detalle] = lista.split('\n### Detalle de cada prueba\n');
const cobertura = fs.readFileSync('resultados/tabla-cobertura.md', 'utf8').trim();

const csv = fs.readFileSync('resultados/ciclos.csv', 'utf8').trim().split('\n').slice(1);
const fmtHora = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const inicio = new Date('2026-11-14T18:55:10-06:00');
let ciclos =
  '| Ciclo | Fin (hora local) | Min. desde inicio | Total | Pasaron | Fallaron | Omitidas | Duración (s) | % Sent. global | % Ramas global | % Sent. EPI | % Ramas EPI |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for (const l of csv) {
  const [c, ts, t, p, f, o, dur, st, br, , , es, eb] = l.split(',');
  const min = Math.round((new Date(ts) - inicio) / 60000);
  ciclos += `| ${c} | ${fmtHora(ts)} | ${min} | ${t} | ${p} | ${f} | ${o} | ${dur} | ${st} | ${br} | ${es || 'n/d'} | ${eb || 'n/d'} |\n`;
}
ciclos +=
  '\n"Pasaron" incluye las pruebas `it.fails` (13 en la versión final), que Vitest cuenta como aprobadas porque su aserción falla mientras el defecto exista. "% EPI" = archivos del alcance EPI (sección 5.1); se empezó a medir en el ciclo 7. Las variaciones del % global se deben a que la cobertura solo incluye los archivos cargados: al probar módulos nuevos entran archivos dependientes aún no probados.';

let inf = fs.readFileSync('INFORME.md', 'utf8');
const poner = (marca, contenido) => {
  const re = new RegExp(`<!-- ${marca} -->[\\s\\S]*?<!-- /${marca} -->|<!-- ${marca} -->`);
  inf = inf.replace(re, `<!-- ${marca} -->\n${contenido.trim()}\n<!-- /${marca} -->`);
};
poner('TABLA_ARCHIVOS', tablaArchivos);
poner('TABLA_COBERTURA', cobertura);
poner('TABLA_CICLOS', ciclos);
poner('ANEXO_LISTA', detalle);
fs.writeFileSync('INFORME.md', inf);
console.log('INFORME.md actualizado');
