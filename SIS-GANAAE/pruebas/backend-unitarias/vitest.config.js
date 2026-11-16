import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendSrc = path.resolve(here, '../../backend-node/src');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/helpers/setup.js'],
    testTimeout: 120000, // PDF pesados: hasta ~30 s bajo contención de CPU (ver INFORME, ciclo 22)
    pool: 'forks',
    coverage: {
      provider: 'v8',
      allowExternal: true,
      reportOnFailure: true,
      all: false,
      include: [`${backendSrc.split(path.sep).join('/')}/**/*.js`],
      exclude: ['**/node_modules/**', '**/tests/**'],
      reporter: ['text', 'json-summary', 'json', 'html'],
      reportsDirectory: path.resolve(here, 'coverage'),
    },
  },
  resolve: {
    alias: [
      { find: /^axios$/, replacement: path.resolve(here, 'tests/helpers/stubs/axios.js') },
      { find: /^knex$/, replacement: path.resolve(here, 'tests/helpers/stubs/prohibido.js') },
      { find: /^dotenv$/, replacement: path.resolve(here, 'tests/helpers/stubs/dotenv.js') },
      { find: /^nodemailer$/, replacement: path.resolve(here, 'tests/helpers/stubs/nodemailer.js') },
      { find: /^pg$/, replacement: path.resolve(here, 'tests/helpers/stubs/prohibido.js') },
    ],
  },
  server: {
    fs: { allow: [path.resolve(here, '../..')] },
  },
});
