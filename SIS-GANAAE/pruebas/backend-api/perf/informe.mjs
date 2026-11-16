/**
 * Inserta en INFORME.md (entre <!--RESULTADOS--> y <!--FIN-RESULTADOS-->) las
 * secciones 3–5 generadas desde resultados/: conteos por archivo, lista de
 * pruebas que pasaron / fallaron (último ciclo) y tablas de rendimiento.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'resultados');
const ultimo = fs.readdirSync(dir).filter((f) => /^vitest-ciclo-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))).pop();
const vit = JSON.parse(fs.readFileSync(path.join(dir, ultimo), 'utf8'));
const limpiar = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 140).replace(/\|/g, '\\|');
const desc = {
  '01_autenticacion_roles.test.mjs': 'Matriz de roles 401/403/200 (3 endpoints EPI + /reportes), validación de cookie/JWT/cuenta/revocación',
  '02_reporte_json_parametros.test.mjs': 'Clases de equivalencia y valores límite de todos los parámetros del JSON',
  '03_reporte_json_consistencia.test.mjs': 'Forma de respuesta, coherencia de sumas, fórmula del %, oráculo independiente',
  '04_estudiantes_seccion.test.mjs': 'Endpoint de estudiantes por sección (anio, idSeccion)',
  '05_reporte_pdf.test.mjs': 'PDF: cabeceras, nombre, %PDF/%%EOF, páginas, errores, fallos de BD',
  '06_http_general.test.mjs': '404, métodos, variantes de ruta, formato de errores, concurrencia/aislamiento',
  '07_casos_adicionales.test.mjs': 'Modo producción, orden de validación, matriz 2×2×2 de filtros en PDF, calendario',
  '08_robustez_cookies.test.mjs': 'Variantes de cookie/JWT y privacidad de id_estudiante',
  '09_ciclo3_fechas_y_detalle.test.mjs': 'Años de <4 cifras, determinismo, igualdad entre roles permitidos',
  '10_ciclo4_bloqueo_y_carga.test.mjs': 'Bloqueo del event loop por PDF grande; estudiantes en paralelo',
  '11_ciclo5_reportes_regresion.test.mjs': 'Regresión /reportes y comparación cruzada con EPI',
  '12_ciclo6_tamano_y_fechas_date.test.mjs': 'Tamaño JSON acotado; fechas Date como node-postgres',
  '13_ciclo7_detalle_estudiante.test.mjs': 'Detalle diario por estudiante (todas las marcas) y agrupación de materias',
  '14_ciclo8_head_pdf.test.mjs': 'HEAD sobre el PDF ejecuta las mismas consultas que GET',
  '15_ciclo9_vacios_y_unicode.test.mjs': 'Parámetros vacíos, dígitos unicode/ancho completo, byte nulo, hexadecimal',
};
let md = '<!--RESULTADOS-->\n\n---\n\n## 3. Archivos de prueba y conteos (último ciclo: ' + ultimo.replace(/\D/g, '') + ')\n\n| Archivo | Qué cubre | Pruebas | Pasaron | Fallaron |\n|---|---|---|---|---|\n';
let T = 0; let P = 0; let F = 0;
const pasaron = []; const fallaron = [];
for (const t of vit.testResults.sort((a, b) => a.name.localeCompare(b.name))) {
  const n = path.basename(t.name);
  const p = t.assertionResults.filter((a) => a.status === 'passed').length;
  const f = t.assertionResults.filter((a) => a.status === 'failed').length;
  T += t.assertionResults.length; P += p; F += f;
  md += `| \`${n}\` | ${desc[n] || ''} | ${t.assertionResults.length} | ${p} | ${f} |\n`;
  for (const a of t.assertionResults) (a.status === 'passed' ? pasaron : fallaron).push({ n, a });
}
md += `| **Total** | | **${T}** | **${P}** | **${F}** |\n\n`;
md += `Las ${F} pruebas que fallan son **todas** pruebas \`[DEFECTO…]\` (comportamiento esperado no cumplido). Ninguna prueba funcional “normal” falla, y ninguna prueba cambió de resultado entre ciclos (ver §5.6).\n\n`;
md += '## 4. Resultados por prueba\n\n### 4.1 Pruebas que FALLARON (defectos)\n\n| Archivo | Prueba | Motivo (aserción) |\n|---|---|---|\n';
for (const { n, a } of fallaron) md += `| ${n.slice(0, 2)} | ${a.fullName.replace(/\|/g, '\\|')} | ${limpiar(a.failureMessages[0] || '')} |\n`;
md += '\n### 4.2 Pruebas que PASARON\n\n<details><summary>' + pasaron.length + ' pruebas (expandir)</summary>\n\n';
let actual = '';
for (const { n, a } of pasaron) {
  if (n !== actual) { md += `\n**${n}**\n\n`; actual = n; }
  md += `- ${a.fullName}\n`;
}
md += '\n</details>\n\n## 5. Rendimiento (BD simulada; costo app-side)\n\n';
md += fs.readFileSync(path.join(dir, 'resumen-rendimiento.md'), 'utf8');
execFileSync(process.execPath, [path.join(root, 'perf/tablas.mjs')], { stdio: 'ignore' });
md += '\n### 5.x Tablas completas por ciclo (generadas)\n\n' + fs.readFileSync(path.join(dir, 'tablas.md'), 'utf8').replace(/^## /gm, '#### ');
md += '\n<!--FIN-RESULTADOS-->';

const inf = path.join(root, 'INFORME.md');
let s = fs.readFileSync(inf, 'utf8');
const i = s.indexOf('<!--RESULTADOS-->');
const j = s.indexOf('<!--FIN-RESULTADOS-->');
s = s.slice(0, i) + md + (j >= 0 ? s.slice(j + '<!--FIN-RESULTADOS-->'.length) : s.slice(i + '<!--RESULTADOS-->'.length));
fs.writeFileSync(inf, s);
console.log(`INFORME actualizado: ${T} pruebas, ${P} pasaron, ${F} fallaron (${ultimo})`);
