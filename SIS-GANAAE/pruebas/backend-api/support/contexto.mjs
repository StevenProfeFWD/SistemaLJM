/** Inicializa datos + app para un archivo de pruebas. */
import { setTables, state } from './fakeDb.mjs';
import { generarDatos } from './seed.mjs';
import { crearApp } from './app.mjs';

export async function preparar(opts = { asistencias: 3000 }) {
  const tablas = generarDatos(opts);
  setTables(tablas);
  state.revoked.clear();
  state.failNext = null;
  state.failTable = null;
  state.delayMs = 0;
  const app = await crearApp();
  return { app, tablas };
}
