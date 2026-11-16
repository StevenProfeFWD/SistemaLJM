import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(here, '../../../backend-node');
export const SRC = path.join(BACKEND_DIR, 'src');
export const KNEX_MODULE = path.join(SRC, 'db', 'knex.js');
export const appUrl = (rel) => pathToFileURL(path.join(SRC, rel)).href;
/** require() resuelto desde backend-node/node_modules (sin modificar la app). */
export const requireApp = createRequire(path.join(BACKEND_DIR, 'package.json'));
