// Uso: node scripts/comparar-ciclos.mjs A B → lista pruebas comunes cuyo estado difiere (inestables).
import fs from 'node:fs';
const [a, b] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(`resultados/estados-ciclo-${a}.json`, 'utf8'));
const B = JSON.parse(fs.readFileSync(`resultados/estados-ciclo-${b}.json`, 'utf8'));
const comunes = Object.keys(A).filter((k) => k in B);
const difieren = comunes.filter((k) => A[k] !== B[k]);
console.log(`comunes=${comunes.length} difieren=${difieren.length}`);
difieren.forEach((k) => console.log(`  ${k}: ${A[k]} -> ${B[k]}`));
