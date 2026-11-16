/**
 * Casos agregados en ciclos posteriores: modo producción del errorHandler,
 * combinaciones de filtros en PDF, cabeceras, límites de calendario.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { binParser, contarPaginas, esPdfValido } from '../support/pdf.mjs';
import { setTables, state } from '../support/fakeDb.mjs';

let app; let tablas; let cookie;
const envOriginal = process.env.NODE_ENV;
beforeAll(async () => { ({ app, tablas } = await preparar({ asistencias: 5000, seed: 21 })); cookie = cookiePara('epi'); });
afterEach(() => { process.env.NODE_ENV = envOriginal; state.failTable = null; });

describe('errorHandler en NODE_ENV=production', () => {
  it('500 de BD => mensaje genérico "Error interno del servidor"', async () => {
    process.env.NODE_ENV = 'production';
    state.failTable = { table: 'asistencia', error: new Error('password authentication failed for user "x"') };
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-03-01').set('Cookie', cookie);
    expect(r.status).toBe(500);
    expect(r.body.message).toBe('Error interno del servidor');
  });
  it('404 => "Ruta no encontrada" sin eco de la URL', async () => {
    process.env.NODE_ENV = 'production';
    const r = await request(app).get('/api/epi/xyz?secreto=1');
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Ruta no encontrada');
  });
  it('400 de validación conserva su mensaje en producción', async () => {
    process.env.NODE_ENV = 'production';
    const r = await request(app).get('/api/epi/reporte-asistencia?id_materia=-3').set('Cookie', cookie);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('id_materia inválido');
  });
});

describe('Orden de validación', () => {
  it('sin sesión + parámetros inválidos => 401 (la autenticación va antes que la validación)', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?id_seccion=abc&periodo=personalizado');
    expect(r.status).toBe(401);
  });
  it('rol no autorizado + parámetros inválidos => 403', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?id_seccion=abc').set('Cookie', cookiePara('orientador'));
    expect(r.status).toBe(403);
  });
  it('personalizado inválido Y id inválido => 400 por fechas (primera validación)', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=personalizado&id_seccion=abc').set('Cookie', cookie);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/fecha/i);
  });
});

describe('PDF: combinaciones de filtros (matriz 2x2x2)', () => {
  const combos = [];
  for (const s of [null, 2]) for (const m of [null, 3]) for (const e of [null, 1031]) combos.push({ s, m, e });
  for (const { s, m, e } of combos) {
    it(`sección=${s ?? '-'} materia=${m ?? '-'} estudiante=${e ?? '-'} => PDF válido`, async () => {
      const q = { periodo: 'mensual', fecha_referencia: '2025-05-10' };
      if (s) q.id_seccion = s; if (m) q.id_materia = m; if (e) q.id_estudiante = e;
      const r = await request(app).get('/api/epi/reporte-asistencia/pdf').query(q).set('Cookie', cookie).buffer(true).parse(binParser);
      expect(r.status).toBe(200);
      expect(esPdfValido(r.body)).toBe(true);
      expect(contarPaginas(r.body)).toBeGreaterThanOrEqual(2);
    });
  }
  it('PDF y JSON con mismos filtros reportan el mismo periodo (filename = filtros JSON)', async () => {
    const q = { periodo: 'semanal', fecha_referencia: '2025-07-04', id_seccion: 5 };
    const j = await request(app).get('/api/epi/reporte-asistencia').query(q).set('Cookie', cookie);
    const p = await request(app).get('/api/epi/reporte-asistencia/pdf').query(q).set('Cookie', cookie).buffer(true).parse(binParser);
    expect(p.headers['content-disposition']).toContain(`${j.body.filtros.periodo}_${j.body.filtros.fecha_inicio}_${j.body.filtros.fecha_fin}`);
  });
});

describe('Límites de calendario', () => {
  it('semanal con referencia 2024-02-29 (bisiesto) => 26-feb a 3-mar', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=semanal&fecha_referencia=2024-02-29').set('Cookie', cookie);
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2024-02-26', fecha_fin: '2024-03-03' });
  });
  it('semanal con referencia 2025-12-31 => 29-dic-2025 a 4-ene-2026', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=semanal&fecha_referencia=2025-12-31').set('Cookie', cookie);
    expect(r.body.filtros).toMatchObject({ fecha_inicio: '2025-12-29', fecha_fin: '2026-01-04' });
  });
  it('anual con año 9999 => 200 sin datos', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=anual&fecha_referencia=9999-06-01').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.filtros.fecha_fin).toBe('9999-12-31');
  });
  it('anual con año 0000 => no 500', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia?periodo=anual&fecha_referencia=0000-06-01').set('Cookie', cookie);
    expect(r.status).toBeLessThan(500);
  });
  it('registro en el último segundo del rango (fecha = fecha_fin) se incluye', async () => {
    const t2 = { ...tablas, asistencia: [{ id_asistencia: 1, id_persona_estudiante: 1001, id_profesor_materia_seccion: 1, fecha: '2025-03-31', estado: 'ausente' }, { id_asistencia: 2, id_persona_estudiante: 1001, id_profesor_materia_seccion: 1, fecha: '2025-04-01', estado: 'ausente' }, { id_asistencia: 3, id_persona_estudiante: 1001, id_profesor_materia_seccion: 1, fecha: '2025-02-28', estado: 'ausente' }] };
    setTables(t2);
    try {
      const r = await request(app).get('/api/epi/reporte-asistencia?periodo=mensual&fecha_referencia=2025-03-10').set('Cookie', cookie);
      expect(r.body.resumen_general.total).toBe(1);
    } finally { setTables(tablas); }
  });
});

describe('Cabeceras de seguridad en el PDF', () => {
  it('[OBSERVACIÓN] PDF con datos personales sin Cache-Control: no-store', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia/pdf?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookie).buffer(true).parse(binParser);
    expect(r.headers['cache-control']).toBeUndefined();
  });
  it('[OBSERVACIÓN] filename del Content-Disposition sin comillas (RFC 6266 recomienda filename="…")', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia/pdf?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookie).buffer(true).parse(binParser);
    expect(r.headers['content-disposition']).toMatch(/filename=[^"]/);
  });
  it('PDF no envía Content-Length (streaming chunked)', async () => {
    const r = await request(app).get('/api/epi/reporte-asistencia/pdf?periodo=semanal&fecha_referencia=2025-03-12').set('Cookie', cookie).buffer(true).parse(binParser);
    expect(r.headers['content-length']).toBeUndefined();
  });
});
