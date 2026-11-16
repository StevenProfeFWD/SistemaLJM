// Servidor de vista previa SOLO para pruebas de usabilidad (puerto 5199).
// Sirve la app real (frontend-reactjs) sin modificarla; sustituye src/config/api.js
// por un cliente simulado (navegador/apiSimulada.js). Nunca contacta un backend real.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(aqui, '../../../frontend-reactjs');
const NM = path.join(APP, 'node_modules');
const { default: react } = await import(pathToFileURL(path.join(NM, '@vitejs/plugin-react/dist/index.js')).href);
const { default: tailwindcss } = await import(pathToFileURL(path.join(NM, '@tailwindcss/vite/dist/index.mjs')).href);
const MOCK = path.join(aqui, 'apiSimulada.js').split(path.sep).join('/');

const sustituirApi = {
  name: 'sustituir-api-simulada',
  enforce: 'pre',
  async resolveId(source, importer, opts) {
    if (!importer || !/config[/\\]api(\.js)?$/.test(source)) return null;
    const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
    if (r && /src[\/]config[\/]api\.js$/.test(r.id)) return MOCK;
    return null;
  },
};

export default {
  root: APP,
  cacheDir: path.join(aqui, '.vite-cache'),
  plugins: [sustituirApi, react(), tailwindcss()],
  resolve: { alias: { '@': path.join(APP, 'src') } },
  server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [APP, path.resolve(aqui, '..')] } },
  preview: { port: 5199, strictPort: true, host: '127.0.0.1' },
};
