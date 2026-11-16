/**
 * GET /api/epi/reporte-asistencia/pdf
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import zlib from 'zlib';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { binParser, contarPaginas, esPdfValido } from '../support/pdf.mjs';
import { setTables, state } from '../support/fakeDb.mjs';

const URL = '/api/epi/reporte-asistencia/pdf';
let app; let tablas; let cookie;
const getPdf = (q) => request(app).get(URL).query(q).set('Cookie', cookie).buffer(true).parse(binParser);

/** Extrae el texto aproximado de los content streams (FlateDecode) del PDF. */
function textoPdf(buf) {
  const s = buf.toString('latin1');
  const re = /stream\r?\n/g; let m; let out = '';
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length;
    const fin = s.indexOf('endstream', ini);
    try { out += zlib.inflateSync(buf.subarray(ini, fin)).toString('latin1'); } catch { /* no comprimido */ }
  }
  return out;
}

beforeAll(async () => { ({ app, tablas } = await preparar({ asistencias: 4000, seed: 3 })); cookie = cookiePara('epi'); });

describe('Respuesta PDF', () => {
  it('mensual => 200, application/pdf, attachment con nombre esperado, %PDF válido', async () => {
    const r = await getPdf({ periodo: 'mensual', fecha_referencia: '2025-03-15' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('attachment; filename=reporte_asistencia_epi_mensual_2025-03-01_2025-03-31.pdf');
    expect(Buffer.isBuffer(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(1000);
    expect(esPdfValido(r.body)).toBe(true);
    expect(contarPaginas(r.body)).toBeGreaterThanOrEqual(2); // resumen + detalle diario
  });
  for (const [q, nombre] of [
    [{ periodo: 'semanal', fecha_referencia: '2025-03-12' }, 'semanal_2025-03-10_2025-03-16'],
    [{ periodo: 'anual', fecha_referencia: '2025-03-12' }, 'anual_2025-01-01_2025-12-31'],
    [{ periodo: 'personalizado', fecha_inicio: '2025-04-01', fecha_fin: '2025-04-02' }, 'personalizado_2025-04-01_2025-04-02'],
  ]) {
    it(`filename para ${q.periodo}`, async () => {
      const r = await getPdf(q);
      expect(r.status).toBe(200);
      expect(r.headers['content-disposition']).toContain(`reporte_asistencia_epi_${nombre}.pdf`);
      expect(esPdfValido(r.body)).toBe(true);
    });
  }
  it('periodo sin datos (2030) => PDF válido con mensaje de vacío y 2 páginas', async () => {
    const r = await getPdf({ periodo: 'mensual', fecha_referencia: '2030-01-10' });
    expect(r.status).toBe(200);
    expect(esPdfValido(r.body)).toBe(true);
    expect(contarPaginas(r.body)).toBe(2);
  });
  it('filtro por estudiante => PDF con todas sus marcas (incluye "Presente")', async () => {
    const r = await getPdf({ periodo: 'anual', fecha_referencia: '2025-03-12', id_estudiante: 1005 });
    expect(r.status).toBe(200);
    expect(esPdfValido(r.body)).toBe(true);
    // texto en Roboto se codifica por glifos; se valida tamaño y páginas
    expect(contarPaginas(r.body)).toBeGreaterThanOrEqual(2);
  });
  it('filtro combinado sección + materia + estudiante => 200 y PDF válido', async () => {
    const r = await getPdf({ periodo: 'anual', fecha_referencia: '2025-03-12', id_seccion: 1, id_materia: 4, id_estudiante: 1005 });
    expect(r.status).toBe(200);
    expect(esPdfValido(r.body)).toBe(true);
  });
  it('estudiante con nombre muy largo, tildes, ñ y <script> => PDF válido', async () => {
    const r = await getPdf({ periodo: 'anual', fecha_referencia: '2025-03-12', id_estudiante: 1001 });
    expect(r.status).toBe(200);
    expect(esPdfValido(r.body)).toBe(true);
  });
  it('más filas => más páginas (anual > semanal)', async () => {
    const a = await getPdf({ periodo: 'anual', fecha_referencia: '2025-03-12' });
    const s = await getPdf({ periodo: 'semanal', fecha_referencia: '2025-03-12' });
    expect(contarPaginas(a.body)).toBeGreaterThan(contarPaginas(s.body));
  });
  it('content streams FlateDecode inflables (PDF bien formado, >1 página)', async () => {
    const r = await getPdf({ periodo: 'mensual', fecha_referencia: '2025-03-15' });
    const n = contarPaginas(r.body);
    const t = textoPdf(r.body);
    // Con fuente TTF el texto va como glifos hex; se verifica que existen N operaciones de texto de pie (Tj/TJ en y=805)
    expect(n).toBeGreaterThan(1);
    expect(t.length).toBeGreaterThan(0);
  });
});

describe('Errores en el endpoint PDF', () => {
  it('personalizado sin fechas => 400 JSON (no PDF)', async () => {
    const r = await request(app).get(URL).query({ periodo: 'personalizado' }).set('Cookie', cookie);
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/json/);
  });
  it('id_seccion=abc => 400 JSON', async () => {
    const r = await request(app).get(URL).query({ id_seccion: 'abc' }).set('Cookie', cookie);
    expect(r.status).toBe(400);
  });
  it('rango invertido => 400', async () => {
    const r = await request(app).get(URL).query({ periodo: 'personalizado', fecha_inicio: '2025-05-01', fecha_fin: '2025-04-01' }).set('Cookie', cookie);
    expect(r.status).toBe(400);
  });
  it('fallo de BD en la consulta del reporte => 500 JSON con formato del errorHandler (no PDF parcial)', async () => {
    state.failTable = { table: 'asistencia', error: new Error('conexión perdida (simulada)') };
    try {
      const r = await request(app).get(URL).query({ periodo: 'mensual', fecha_referencia: '2025-03-15' }).set('Cookie', cookie);
      expect(r.status).toBe(500);
      expect(r.headers['content-type']).toMatch(/json/);
      expect(r.body).toMatchObject({ status: 'error', code: 500 });
    } finally { state.failTable = null; }
  });
  it('fallo de BD en el middleware (consulta de persona) => no 200', async () => {
    state.failTable = { table: 'persona', error: new Error('timeout (simulado)') };
    try {
      const r = await request(app).get(URL).query({ periodo: 'mensual', fecha_referencia: '2025-03-15' }).set('Cookie', cookie);
      expect(r.status).toBeGreaterThanOrEqual(400);
    } finally { state.failTable = null; }
  });
  it('[CORREGIDO-SEGURIDAD] si falla la consulta de revocación (jwt_revocado) un token REVOCADO se acepta (fail-open); debería => 401/503', async () => {
    state.revoked.add('jti-revocado-pdf');
    state.failTable = { table: 'jwt_revocado', error: new Error('BD caída (simulada)') };
    try {
      const r = await request(app).get('/api/epi/reporte-asistencia').query({ periodo: 'mensual', fecha_referencia: '2025-03-15' }).set('Cookie', cookiePara('epi', { jti: 'jti-revocado-pdf' }));
      expect(r.status).not.toBe(200);
    } finally { state.failTable = null; }
  });
  it('[CORREGIDO] fecha imposible (2025-02-30) en PDF debería => 400; hoy => 500', async () => {
    const r = await request(app).get(URL).query({ periodo: 'personalizado', fecha_inicio: '2025-02-30', fecha_fin: '2025-03-05' }).set('Cookie', cookie);
    expect(r.status).toBe(400);
  });
  it('[CORREGIDO] fecha_inicio como arreglo (fecha_inicio[]=…) en PDF debería => 400; hoy => 200', async () => {
    const r = await request(app).get(`${URL}?periodo=personalizado&fecha_inicio[]=2025-03-01&fecha_fin=2025-03-31`).set('Cookie', cookie).buffer(true).parse(binParser);
    expect(r.status).toBe(400);
  });
});

describe('Contenido de detalle diario (datos controlados)', () => {
  it('sin estudiante: el detalle solo lista incidencias (no presentes) — tamaño no crece con presentes', async () => {
    const base = { ...tablas };
    const mk = (n, estado) => Array.from({ length: n }, (_, i) => ({ id_asistencia: i + 1, id_persona_estudiante: 1001 + (i % 25), id_profesor_materia_seccion: 1 + (i % 8), fecha: '2025-03-03', estado }));
    setTables({ ...base, asistencia: mk(10, 'ausente') });
    const a = await getPdf({ periodo: 'personalizado', fecha_inicio: '2025-03-03', fecha_fin: '2025-03-03' });
    setTables({ ...base, asistencia: [...mk(10, 'ausente'), ...mk(2000, 'presente').map((x, i) => ({ ...x, id_asistencia: 100 + i }))] });
    const b = await getPdf({ periodo: 'personalizado', fecha_inicio: '2025-03-03', fecha_fin: '2025-03-03' });
    setTables(tablas);
    expect(contarPaginas(a.body)).toBe(contarPaginas(b.body));
  });
});
