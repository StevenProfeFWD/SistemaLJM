/**
 * Ciclo 7: con id_estudiante el detalle diario del PDF incluye TODAS las marcas
 * (también "Presente"); sin él, solo incidencias. Se verifica por tamaño/páginas
 * con datos controlados.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { setTables } from '../support/fakeDb.mjs';
import { binParser, contarPaginas, esPdfValido } from '../support/pdf.mjs';
import { diasLectivos } from '../support/seed.mjs';

let app; let tablas; let cookie;
beforeAll(async () => { ({ app, tablas } = await preparar({ asistencias: 1000, seed: 1 })); cookie = cookiePara('epi'); });

describe('Detalle diario por estudiante', () => {
  it('estudiante con 200 días "presente": con id_estudiante el PDF tiene más páginas que sin él', async () => {
    const dias = diasLectivos().slice(0, 200);
    const asistencia = dias.map((f, i) => ({ id_asistencia: i + 1, id_persona_estudiante: 1003, id_profesor_materia_seccion: 1 + (i % 8), fecha: f, estado: 'presente' }));
    setTables({ ...tablas, asistencia });
    try {
      const q = '/api/epi/reporte-asistencia/pdf?periodo=anual&fecha_referencia=2025-03-01';
      const sin = await request(app).get(q).set('Cookie', cookie).buffer(true).parse(binParser);
      const con = await request(app).get(`${q}&id_estudiante=1003`).set('Cookie', cookie).buffer(true).parse(binParser);
      expect(esPdfValido(con.body)).toBe(true);
      expect(contarPaginas(sin.body)).toBe(2); // sin incidencias: resumen + "no se registraron…"
      expect(contarPaginas(con.body)).toBeGreaterThan(2);
    } finally { setTables(tablas); }
  });
  it('mismo estudiante + misma fecha + mismo estado en 8 materias => una sola fila (materias agrupadas)', async () => {
    const asistencia = Array.from({ length: 8 }, (_, i) => ({ id_asistencia: i + 1, id_persona_estudiante: 1003, id_profesor_materia_seccion: 1 + i, fecha: '2025-03-03', estado: 'ausente' }));
    const asistencia2 = Array.from({ length: 8 }, (_, i) => ({ id_asistencia: i + 1, id_persona_estudiante: 1003 + i, id_profesor_materia_seccion: 1, fecha: '2025-03-03', estado: 'ausente' }));
    setTables({ ...tablas, asistencia });
    const a = await request(app).get('/api/epi/reporte-asistencia/pdf?periodo=personalizado&fecha_inicio=2025-03-03&fecha_fin=2025-03-03').set('Cookie', cookie).buffer(true).parse(binParser);
    setTables({ ...tablas, asistencia: asistencia2 });
    const b = await request(app).get('/api/epi/reporte-asistencia/pdf?periodo=personalizado&fecha_inicio=2025-03-03&fecha_fin=2025-03-03').set('Cookie', cookie).buffer(true).parse(binParser);
    setTables(tablas);
    // 1 fila con 8 materias vs 8 filas: el segundo PDF debe ser mayor
    expect(b.body.length).toBeGreaterThan(a.body.length);
  });
});
