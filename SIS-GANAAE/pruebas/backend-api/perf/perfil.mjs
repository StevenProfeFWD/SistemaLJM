/** Perfil CPU rápido de un endpoint (uso: node --cpu-prof --import ./perf/register.mjs perf/perfil.mjs <ruta> <n> <filas>) */
import http from 'node:http';
import { setTables, state } from '../support/fakeDb.mjs';
import { generarDatos } from '../support/seed.mjs';
import { crearApp } from '../support/app.mjs';
import { cookiePara } from '../support/auth.mjs';
const [ruta, n = '50', filas = '10000'] = process.argv.slice(2);
setTables(generarDatos({ asistencias: Number(filas) }));
state.cache = true;
const app = await crearApp();
const server = http.createServer(app);
await new Promise((r) => server.listen(4511, '127.0.0.1', r));
const cookie = cookiePara('epi');
const pedir = () => new Promise((res) => http.get({ host: '127.0.0.1', port: 4511, path: ruta, headers: { Cookie: cookie } }, (r) => { r.resume(); r.on('end', res); }));
await pedir();
const t0 = performance.now();
for (let i = 0; i < Number(n); i++) await pedir();
console.log(`${n} peticiones: ${((performance.now() - t0) / Number(n)).toFixed(2)} ms/pet`);
server.close();
