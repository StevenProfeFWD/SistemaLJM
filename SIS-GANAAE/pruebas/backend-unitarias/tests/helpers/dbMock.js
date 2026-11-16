/**
 * Doble de prueba del export default de backend-node/src/db/knex.js.
 * Simula el query builder encadenable de Knex: registra cada llamada y
 * resuelve (thenable) con lo que devuelva el "resolver" configurado por el test.
 * NUNCA abre conexiones: no importa knex ni pg.
 */
export const llamadas = [];
let resolver = () => [];

export function setResolver(fn) {
  resolver = fn;
}

let rawHandler = (args) => ({ raw: args });
export const rawLlamadas = [];
export function setRawHandler(fn) {
  rawHandler = fn;
}

export function reset() {
  llamadas.length = 0;
  rawLlamadas.length = 0;
  if (typeof transacciones !== 'undefined') transacciones.length = 0;
  resolver = () => [];
  rawHandler = (args) => ({ raw: args });
}

function crearSub(registro) {
  const sub = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        return (...args) => {
          registro.ops.push({ op: `sub.${prop}`, args });
          for (const a of args) if (typeof a === 'function') a.call(crearSub(registro), crearSub(registro));
          return sub;
        };
      },
    }
  );
  return sub;
}

function crearBuilder(tabla) {
  const registro = { tabla, ops: [] };
  llamadas.push(registro);
  const builder = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (ok, ko) => {
            try {
              return Promise.resolve(resolver(registro)).then(ok, ko);
            } catch (e) {
              return Promise.reject(e).then(ok, ko);
            }
          };
        }
        if (prop === 'catch' || prop === 'finally') {
          return (...args) => Promise.resolve(resolver(registro))[prop](...args);
        }
        if (typeof prop === 'symbol') return undefined;
        return (...args) => {
          registro.ops.push({ op: prop, args });
          // Ejecuta callbacks (join/where con function) contra un sub-builder que registra 'sub.<op>'.
          for (const a of args) {
            if (typeof a === 'function') a.call(crearSub(registro), crearSub(registro));
          }
          return builder;
        };
      },
    }
  );
  return builder;
}

export const db = (tabla) => crearBuilder(tabla);
db.raw = (...args) => {
  rawLlamadas.push(args);
  return rawHandler(args);
};
db.fn = { now: () => 'now()' };
/** Transacción simulada: ejecuta el callback con el mismo doble (las consultas quedan registradas con trx=true). */
db.transaction = async (fn) => {
  const trx = (tabla) => {
    const b = crearBuilder(tabla);
    llamadas[llamadas.length - 1].trx = true;
    return b;
  };
  if (typeof fn !== 'function') {
    // Uso sin callback: const trx = await db.transaction(); ... trx.commit()/rollback()
    trx.commit = async () => transacciones.push('commit');
    trx.rollback = async () => transacciones.push('rollback');
    return trx;
  }
  return fn(trx);
};
export const transacciones = [];

/** Utilidades para inspeccionar las llamadas registradas. */
export const tieneOp = (reg, op) => reg.ops.some((o) => o.op === op);
export const argsDe = (reg, op) => reg.ops.filter((o) => o.op === op).map((o) => o.args);
