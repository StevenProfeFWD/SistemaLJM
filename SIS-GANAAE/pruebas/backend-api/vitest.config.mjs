import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./support/env.mjs'],
    include: ['tests/**/*.test.mjs'],
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: 'forks',
    // Los archivos se ejecutan uno a la vez: las pruebas de rendimiento (p. ej. 10_ciclo4) miden latencias
    // y no deben competir por CPU con otros archivos de la misma suite.
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: { json: './resultados/ultimo-vitest.json' },
  },
});
