/**
 * Fake en memoria del módulo Knex (`backend-node/src/db/knex.js`).
 * Implementa el subconjunto de la API de Knex usado por los middlewares y
 * servicios bajo prueba: join / leftJoin (hash join), where / whereIn /
 * whereNot / whereBetween, select con alias, distinct, groupBy + count,
 * orderBy, first, raw, insert().onConflict().ignore(), del().
 *
 * Emula dos comportamientos de PostgreSQL (documentado en INFORME.md):
 *  - Un entero fuera de rango int4 en un filtro de columna id_* => error 22003.
 *  - Una fecha inválida (p. ej. 2025-02-30) en whereBetween sobre `fecha` => error 22008.
 *
 * Mide el tiempo propio consumido (stats.ms) para poder restarlo en las
 * pruebas de rendimiento (costo app-side).
 */

export const state = {
  tables: {},
  indexes: new Map(), // `${table}.${col}` -> Map(value -> rows[])
  revoked: new Set(),
  failNext: null, // Error a lanzar en la próxima consulta (fallo de BD simulado)
  failTable: null, // { table, error }: falla toda consulta cuya tabla base coincida
  delayMs: 0,     // latencia artificial por consulta
  cache: false,   // memoiza resultados (perf: aísla el costo app-side del costo del fake)
  cacheMap: new Map(),
};

export const stats = { queries: 0, ms: 0, log: [] , logEnabled: false };

const INT4_MAX = 2147483647;

function pgError(message, code) {
  const e = new Error(message);
  e.code = code; // string, como pg
  return e;
}

export function setTables(tables) {
  state.tables = tables;
  state.indexes = new Map();
  state.cacheMap = new Map();
}

function getIndex(table, col) {
  const key = `${table}.${col}`;
  let idx = state.indexes.get(key);
  if (!idx) {
    idx = new Map();
    for (const r of state.tables[table] || []) {
      const v = r[col];
      let arr = idx.get(v);
      if (!arr) idx.set(v, (arr = []));
      arr.push(r);
    }
    state.indexes.set(key, idx);
  }
  return idx;
}

function parseTableRef(ref) {
  const m = String(ref).trim().split(/\s+as\s+/i);
  return { table: m[0], alias: m[1] || m[0] };
}

function parseColRef(ref) {
  const [expr, as] = String(ref).trim().split(/\s+as\s+/i);
  const parts = expr.split('.');
  const col = parts.length > 1 ? parts[1] : parts[0];
  const alias = parts.length > 1 ? parts[0] : null;
  return { alias, col, out: as || col };
}

const DATE_RE = /^(\d{4,})-(\d{2})-(\d{2})$/;
function validarFechaPg(v) {
  const s = String(v);
  const m = DATE_RE.exec(s);
  if (!m) throw pgError(`invalid input syntax for type date: "${s}"`, '22007');
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y, mo - 1, d);
  if (y === 0) throw pgError(`date/time field value out of range: "${s}"`, '22008'); // PG no tiene año 0
  if (mo < 1 || mo > 12 || d < 1 || dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) {
    throw pgError(`date/time field value out of range: "${s}"`, '22008');
  }
}

function validarEnteroPg(col, v) {
  if (/^id_|_id$|^id$|anio/.test(col) && typeof v === 'number' && Math.abs(v) > INT4_MAX) {
    throw pgError(`value "${v}" is out of range for type integer`, '22003');
  }
}

class Builder {
  constructor(tableRef) {
    const { table, alias } = parseTableRef(tableRef);
    this.base = { table, alias };
    this.joins = [];
    this.wheres = [];
    this.selects = null;
    this.groups = null;
    this.countAs = null;
    this.isDistinct = false;
    this.orders = [];
    this.isFirst = false;
    this.op = 'select';
  }
  join(t, c1, c2) { this.joins.push({ ...parseTableRef(t), c1, c2, left: false }); return this; }
  innerJoin(t, c1, c2) { return this.join(t, c1, c2); }
  leftJoin(t, c1, c2) { this.joins.push({ ...parseTableRef(t), c1, c2, left: true }); return this; }
  where(a, b, c) {
    if (a && typeof a === 'object') {
      for (const [k, v] of Object.entries(a)) this.wheres.push({ kind: 'eq', col: k, val: v });
    } else if (c !== undefined) {
      this.wheres.push({ kind: 'op', col: a, op: b, val: c });
    } else {
      this.wheres.push({ kind: 'eq', col: a, val: b });
    }
    return this;
  }
  andWhere(...a) { return this.where(...a); }
  whereNot(a, b) { this.wheres.push({ kind: 'neq', col: a, val: b }); return this; }
  whereIn(col, vals) { this.wheres.push({ kind: 'in', col, vals: new Set(vals) }); return this; }
  whereBetween(col, [lo, hi]) { this.wheres.push({ kind: 'between', col, lo, hi }); return this; }
  select(...cols) { this.selects = (this.selects || []).concat(cols.flat()); return this; }
  distinct(...cols) { this.isDistinct = true; return this.select(...cols); }
  groupBy(...cols) { this.groups = cols.flat(); return this; }
  count(expr) { this.countAs = parseColRef(expr).out; return this; }
  orderBy(col, dir = 'asc') { this.orders.push({ col, dir: String(dir).toLowerCase() }); return this; }
  first(...cols) { this.isFirst = true; if (cols.length) this.select(...cols); return this; }
  limit(n) { this.lim = n; return this; }
  del() { this.op = 'del'; return this; }
  insert(row) { this.op = 'insert'; this.row = row; return this; }
  onConflict() { return this; }
  ignore() { return this; }
  merge() { return this; }

  then(res, rej) {
    const run = async () => {
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      const t0 = performance.now();
      try {
        stats.queries++;
        if (state.failNext) { const e = state.failNext; state.failNext = null; throw e; }
        if (state.failTable && state.failTable.table === this.base.table) throw state.failTable.error;
        if (state.cache && this.op === 'select' && this.base.table !== 'jwt_revocado') {
          const k = this._key();
          if (state.cacheMap.has(k)) return state.cacheMap.get(k);
          const v = this._exec();
          state.cacheMap.set(k, v);
          return v;
        }
        return this._exec();
      } finally {
        const dt = performance.now() - t0;
        stats.ms += dt;
        if (stats.logEnabled) stats.log.push({ table: this.base.table, ms: dt });
      }
    };
    return run().then(res, rej);
  }
  catch(rej) { return this.then(undefined, rej); }

  _key() {
    return JSON.stringify({ b: this.base, j: this.joins, w: this.wheres.map((w) => (w.vals ? { ...w, vals: [...w.vals] } : w)), s: this.selects, g: this.groups, c: this.countAs, d: this.isDistinct, o: this.orders, f: this.isFirst, l: this.lim });
  }

  _resolver() {
    const single = this.joins.length === 0;
    return (row, ref) => {
      const { alias, col } = parseColRef(ref);
      const a = alias || (single ? this.base.alias : null);
      if (a) return row[a]?.[col];
      for (const k of Object.keys(row)) if (row[k] && col in row[k]) return row[k][col];
      return undefined;
    };
  }

  _exec() {
    const { table, alias } = this.base;
    if (this.op === 'insert') {
      if (table === 'jwt_revocado') state.revoked.add(String(this.row.jti));
      return [];
    }
    if (table === 'jwt_revocado') {
      const w = this.wheres.find((x) => x.col === 'jti');
      if (this.op === 'del') return 0;
      return w && state.revoked.has(String(w.val)) ? { jti: w.val } : undefined;
    }
    if (!state.tables[table]) throw pgError(`relation "${table}" does not exist`, '42P01');
    const get = this._resolver();

    // Validaciones estilo PostgreSQL sobre parámetros
    for (const w of this.wheres) {
      const col = parseColRef(w.col).col;
      if (w.kind === 'between' && col === 'fecha') { validarFechaPg(w.lo); validarFechaPg(w.hi); }
      if (w.kind === 'eq' || w.kind === 'neq') validarEnteroPg(col, w.val);
    }

    // Predicados aplicables a la tabla base antes de los joins (optimización)
    const preds = this.wheres.map((w) => {
      const p = parseColRef(w.col);
      const a = p.alias || (this.joins.length === 0 ? alias : null);
      return { ...w, a, c: p.col };
    });
    const test = (w, v) => {
      switch (w.kind) {
        case 'eq': return v == w.val; // eslint-disable-line eqeqeq
        case 'neq': return v != w.val; // eslint-disable-line eqeqeq
        case 'in': return w.vals.has(v);
        case 'between': {
          const s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString().slice(0, 10) : v;
          return s >= w.lo && s <= w.hi;
        }
        case 'op': {
          if (w.op === '<') return v < w.val;
          if (w.op === '>') return v > w.val;
          if (w.op === '<=') return v <= w.val;
          if (w.op === '>=') return v >= w.val;
          if (w.op === '=') return v == w.val; // eslint-disable-line eqeqeq
          return true;
        }
        default: return true;
      }
    };

    // Índice directo si hay igualdad sobre la tabla base
    let baseRows = state.tables[table];
    const eqBase = preds.find((w) => w.kind === 'eq' && w.a === alias);
    if (eqBase) baseRows = getIndex(table, eqBase.c).get(eqBase.val) || getIndex(table, eqBase.c).get(Number(eqBase.val)) || [];
    const basePreds = preds.filter((w) => w.a === alias);
    const otherPreds = preds.filter((w) => w.a !== alias);

    let rows = [];
    for (const r of baseRows) {
      let ok = true;
      for (const w of basePreds) if (!test(w, r[w.c])) { ok = false; break; }
      if (ok) rows.push({ [alias]: r });
    }

    for (const j of this.joins) {
      const p1 = parseColRef(j.c1); const p2 = parseColRef(j.c2);
      const [mine, other] = p1.alias === j.alias ? [p1, p2] : [p2, p1];
      const idx = getIndex(j.table, mine.col);
      const myPreds = otherPreds.filter((w) => w.a === j.alias);
      const next = [];
      for (const row of rows) {
        const v = row[other.alias]?.[other.col];
        const matches = idx.get(v) || [];
        let any = false;
        for (const m of matches) {
          let ok = true;
          for (const w of myPreds) if (!test(w, m[w.c])) { ok = false; break; }
          if (ok) { any = true; next.push({ ...row, [j.alias]: m }); }
        }
        if (!any && j.left) next.push({ ...row, [j.alias]: {} });
      }
      rows = next;
    }
    // predicados restantes no asociados a alias conocido
    const rest = otherPreds.filter((w) => !this.joins.some((j) => j.alias === w.a));
    if (rest.length) rows = rows.filter((row) => rest.every((w) => test(w, get(row, w.col))));

    if (this.op === 'del') return rows.length;

    let out;
    if (this.groups) {
      const groups = new Map();
      for (const row of rows) {
        const key = this.groups.map((g) => get(row, g)).join('\u0001');
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { row, n: 0 }));
        g.n++;
      }
      out = [];
      for (const { row, n } of groups.values()) {
        const o = {};
        for (const s of this.selects || []) o[parseColRef(s).out] = get(row, s);
        if (this.countAs) o[this.countAs] = String(n); // pg devuelve bigint como string
        out.push(o);
      }
    } else if (this.countAs) {
      out = [{ [this.countAs]: String(rows.length) }];
    } else {
      const sels = this.selects && this.selects.length ? this.selects : null;
      out = rows.map((row) => {
        if (!sels) return { ...row[alias] };
        const o = {};
        for (const s of sels) o[parseColRef(s).out] = get(row, s);
        return o;
      });
      if (this.isDistinct) {
        const seen = new Set();
        out = out.filter((o) => { const k = JSON.stringify(o); if (seen.has(k)) return false; seen.add(k); return true; });
      }
    }

    if (this.orders.length) {
      const keys = this.orders.map((o) => ({ k: parseColRef(o.col).out, ...o }));
      out.sort((a, b) => {
        for (const { k, dir } of keys) {
          const x = a[k]; const y = b[k];
          if (x === y) continue;
          const c = x < y ? -1 : 1;
          return dir === 'desc' ? -c : c;
        }
        return 0;
      });
    }
    if (this.lim != null) out = out.slice(0, this.lim);
    if (this.isFirst) return out[0];
    return out;
  }
}

function db(tableRef) { return new Builder(tableRef); }
db.raw = async () => ({ rows: [] });
db.fn = { now: () => new Date().toISOString() };
db.destroy = async () => {};

export default db;
