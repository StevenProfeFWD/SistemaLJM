// Redirige backend-node/src/db/knex.js al fake en memoria (sin tocar la app).
import { register } from 'node:module';
import '../support/env.mjs';
register('./hooks.mjs', import.meta.url);
