import { vi } from 'vitest';

// Sustituye la conexión Knex real por un doble en memoria (ninguna prueba toca la BD).
vi.mock('../../../../backend-node/src/db/knex.js', async () => {
  const m = await import('./dbMock.js');
  return { default: m.db };
});
