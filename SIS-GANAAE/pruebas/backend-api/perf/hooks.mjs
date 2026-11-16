import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const FAKE = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../support/fakeDb.mjs')).href;
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (typeof r.url === 'string' && /backend-node\/src\/db\/knex\.js$/i.test(r.url)) return { url: FAKE, shortCircuit: true };
  return r;
}
