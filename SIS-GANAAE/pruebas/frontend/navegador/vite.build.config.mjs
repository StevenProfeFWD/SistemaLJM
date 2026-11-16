// Build de medición de tamaño (sin simulación): idéntico a la config de la app pero con salida en esta carpeta.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(aqui, '../../../frontend-reactjs');
const NM = path.join(APP, 'node_modules');
const { default: react } = await import(pathToFileURL(path.join(NM, '@vitejs/plugin-react/dist/index.js')).href);
const { default: tailwindcss } = await import(pathToFileURL(path.join(NM, '@tailwindcss/vite/dist/index.mjs')).href);
export default {
  root: APP,
  cacheDir: path.join(aqui, '.vite-cache-build'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(APP, 'src') } },
  build: { outDir: path.join(aqui, '..', 'resultados', 'build'), emptyOutDir: true, reportCompressedSize: true },
  logLevel: 'info',
};
