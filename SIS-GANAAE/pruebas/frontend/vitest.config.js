import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../../frontend-reactjs');
const APP_NM = path.join(APP, 'node_modules');

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  resolve: {
    // Una sola copia de React / router (la de la app) para evitar "Invalid hook call".
    alias: [
      { find: /^react$/, replacement: path.join(APP_NM, 'react/index.js') },
      { find: /^react\/jsx-runtime$/, replacement: path.join(APP_NM, 'react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.join(APP_NM, 'react/jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: path.join(APP_NM, 'react-dom/index.js') },
      { find: /^react-dom\/client$/, replacement: path.join(APP_NM, 'react-dom/client.js') },
      { find: /^react-dom\/test-utils$/, replacement: path.join(APP_NM, 'react-dom/test-utils.js') },
      { find: /^react-router-dom$/, replacement: path.join(APP_NM, 'react-router-dom/dist/index.mjs') },
      { find: /^react-router\/dom$/, replacement: path.join(APP_NM, 'react-router/dist/development/dom-export.mjs') },
      { find: /^react-router$/, replacement: path.join(APP_NM, 'react-router/dist/development/index.mjs') },
      { find: /^@\//, replacement: path.join(APP, 'src') + '/' },
    ],
  },
  server: { fs: { allow: [path.resolve(__dirname, '../..')] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/helpers/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    server: { deps: { inline: [/@testing-library/, /lucide-react/, /react-router/] } },
    testTimeout: 15000,
    // Archivos uno a la vez: tests/rendimiento mide tiempos de render y no debe competir por CPU
    // con el resto de la suite (antes daba fallos intermitentes que no eran defectos).
    fileParallelism: false,
    css: false,
  },
});
