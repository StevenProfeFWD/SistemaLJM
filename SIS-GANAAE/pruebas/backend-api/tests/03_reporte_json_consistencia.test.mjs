/**
 * Funcionales: forma de la respuesta, coherencia matemática (materias = sección =
 * general), fórmula del %, y exactitud contra un oráculo independiente que
 * cuenta directamente sobre los datos sembrados.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../backend-node/src/db/knex.js', async () => import('../support/fakeDb.mjs'));

import { preparar } from '../support/contexto.mjs';
import { cookiePara } from '../support/auth.mjs';
import { oraculoConteos } from '../support/seed.mjs';
import { setTables } from '../support/fakeDb.mjs';

const URL = '/api/epi/reporte-asistencia';
let app; let tablas; let cookie;
const get = (q) => request(app).get(URL).query(q).set('Cookie', cookie);

const CAMPOS_TOTALES = ['total', 'presentes', 'tardias', 'ausencias_justificadas', 'ausencias_injustificadas', 'otros', 'porcentaje_asistencia'];
const SUMABLES = CAMPOS_TOTALES.filter((c) => c !== 'porcentaje_asistencia');
const pct = (t) => (t.total > 0 ? Math.round(((t.presentes + t.tardias) / t.total) * 1000) / 10 : 0);

function verificarCoherencia(body) {
  const sumaGeneral = Object.fromEntries(SUMABLES.map((c) => [c, 0]));
  for (const s of body.secciones) {
    const sumaSec = Object.fromEntries(SUMABLES.map((c) => [c, 0]));
    for (const m of s.materias) {
      for (const c of SUMABLES) sumaSec[c] += m.totales[c];
      expect(m.totales.total).toBe(m.totales.presentes + m.totales.tardias + m.totales.ausencias_justificadas + m.totales.ausencias_injustificadas + m.totales.otros);
      expect(m.totales.porcentaje_asistencia).toBe(pct(m.totales));
    }
    for (const c of SUMABLES) expect(s.totales[c]).toBe(sumaSec[c]);
    expect(s.totales.porcentaje_asistencia).toBe(pct(s.totales));
    for (const c of SUMABLES) sumaGeneral[c] += s.totales[c];
  }
  for (const c of SUMABLES) expect(body.resumen_general[c]).toBe(sumaGeneral[c]);
  expect(body.resumen_general.porcentaje_asistencia).toBe(pct(body.resumen_general));
}

beforeAll(async () => { ({ app, tablas } = await preparar({ asistencias: 8000, seed: 7 })); cookie = cookiePara('epi'); });

describe('Forma de la respuesta', () => {
  it('contiene filtros, resumen_general, secciones[].materias[] y catalogos', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    const b = r.body;
    expect(Object.keys(b).sort()).toEqual(['catalogos', 'filtros', 'resumen_general', 'secciones']);
    expect(Object.keys(b.filtros).sort()).toEqual([
      'cedula_estudiante', 'fecha_fin', 'fecha_inicio', 'id_estudiante', 'id_materia', 'id_seccion',
      'nombre_estudiante', 'nombre_materia', 'nombre_seccion', 'periodo', 'periodo_label',
    ]);
    expect(Object.keys(b.resumen_general).sort()).toEqual([...CAMPOS_TOTALES].sort());
    expect(Array.isArray(b.secciones)).toBe(true);
    for (const s of b.secciones) {
      expect(s).toHaveProperty('id_seccion');
      expect(s).toHaveProperty('nombre_seccion');
      expect(Object.keys(s.totales).sort()).toEqual([...CAMPOS_TOTALES].sort());
      for (const m of s.materias) {
        expect(m).toHaveProperty('id_materia');
        expect(m).toHaveProperty('nombre_materia');
        for (const c of CAMPOS_TOTALES) expect(typeof m.totales[c]).toBe('number');
      }
    }
    expect(b.catalogos.secciones.length).toBe(tablas.seccion.length);
    expect(b.catalogos.materias.length).toBe(tablas.materia.length);
  });
  it('el JSON no incluye detalle_diario (solo el PDF)', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
    expect(r.body.detalle_diario).toBeUndefined();
  });
  it('secciones ordenadas por nombre con orden numérico (7-x antes que 10-x)', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
    const nombres = r.body.secciones.map((s) => s.nombre_seccion);
    const esperado = [...nombres].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    expect(nombres).toEqual(esperado);
    expect(nombres[0]).toBe('7-1');
  });
  it('materias dentro de cada sección ordenadas alfabéticamente (es)', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
    for (const s of r.body.secciones) {
      const n = s.materias.map((m) => m.nombre_materia);
      expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })));
    }
  });
  it('[CORREGIDO] catalogos.secciones debería estar en orden natural (7-1 … 11-3); hoy usa orden lexicográfico de BD (10-1 antes de 7-1)', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
    const n = r.body.catalogos.secciones.map((s) => s.nombre_seccion);
    expect(n[0]).toBe('7-1');
  });
  it('sección y materia sin asistencias no aparecen en secciones[] pero sí en catalogos', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
    expect(r.body.secciones.find((s) => s.id_seccion === 99)).toBeUndefined();
    expect(r.body.catalogos.secciones.find((s) => s.id_seccion === 99)).toBeTruthy();
    for (const s of r.body.secciones) expect(s.materias.find((m) => m.id_materia === 50)).toBeUndefined();
  });
});

describe('Coherencia matemática y oráculo', () => {
  const casos = [
    { periodo: 'anual', fecha_referencia: '2025-05-05' },
    { periodo: 'mensual', fecha_referencia: '2025-03-20' },
    { periodo: 'semanal', fecha_referencia: '2025-09-17' },
    { periodo: 'personalizado', fecha_inicio: '2025-02-01', fecha_fin: '2025-02-01' }, // sábado: sin datos
    { periodo: 'personalizado', fecha_inicio: '2025-04-01', fecha_fin: '2025-06-30' },
    { periodo: 'anual', fecha_referencia: '2025-05-05', id_seccion: 3 },
    { periodo: 'anual', fecha_referencia: '2025-05-05', id_materia: 2 },
    { periodo: 'anual', fecha_referencia: '2025-05-05', id_seccion: 3, id_materia: 2 },
    { periodo: 'anual', fecha_referencia: '2025-05-05', id_estudiante: 1005 },
    { periodo: 'anual', fecha_referencia: '2025-05-05', id_seccion: 1, id_materia: 4, id_estudiante: 1005 },
    { periodo: 'anual', fecha_referencia: '2025-05-05', id_seccion: 2, id_estudiante: 1005 }, // estudiante de otra sección => 0
    { periodo: 'anual', fecha_referencia: '2024-05-05' }, // año anterior: 1 registro
  ];
  for (const q of casos) {
    it(`coherencia + oráculo para ${JSON.stringify(q)}`, async () => {
      const r = await get(q);
      expect(r.status).toBe(200);
      verificarCoherencia(r.body);
      const o = oraculoConteos(tablas, {
        fecha_inicio: r.body.filtros.fecha_inicio, fecha_fin: r.body.filtros.fecha_fin,
        id_seccion: q.id_seccion ?? null, id_materia: q.id_materia ?? null, id_estudiante: q.id_estudiante ?? null,
      });
      expect(r.body.resumen_general.total).toBe(o.total);
      expect(r.body.resumen_general.presentes).toBe(o.presente);
      expect(r.body.resumen_general.tardias).toBe(o.tardanza);
      expect(r.body.resumen_general.ausencias_injustificadas).toBe(o.ausente);
      expect(r.body.resumen_general.ausencias_justificadas).toBe(o.justificado);
      expect(r.body.resumen_general.otros).toBe(0);
      for (const s of r.body.secciones) {
        expect(s.totales.total).toBe(o.porSeccion.get(s.id_seccion));
        for (const m of s.materias) expect(m.totales.total).toBe(o.porSecMat.get(`${s.id_seccion}|${m.id_materia}`));
      }
      if (q.id_seccion) expect(r.body.secciones.every((s) => s.id_seccion === q.id_seccion)).toBe(true);
      if (q.id_materia) expect(r.body.secciones.every((s) => s.materias.every((m) => m.id_materia === q.id_materia))).toBe(true);
    });
  }
  it('filtros nombre_* se completan cuando hay selección', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05', id_seccion: 1, id_materia: 2, id_estudiante: 1005 });
    expect(r.body.filtros.nombre_seccion).toBe('7-1');
    expect(r.body.filtros.nombre_materia).toBe(tablas.materia.find((m) => m.id_materia === 2).nombre_materia);
    const p = tablas.persona.find((x) => x.id_persona === 1005);
    expect(r.body.filtros.nombre_estudiante).toBe(p.nombre_completo);
    expect(r.body.filtros.cedula_estudiante).toBe(p.cedula);
  });
  it('id_estudiante que no es estudiante (id de un usuario administrador) => 200 sin exponer su nombre/cédula (DEF-06 corregido)', async () => {
    const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05', id_estudiante: 2 });
    expect(r.status).toBe(200);
    expect(r.body.resumen_general.total).toBe(0);
    expect(r.body.filtros.nombre_estudiante).toBeNull();
    expect(r.body.filtros.cedula_estudiante).toBeNull();
  });
});

describe('Fórmula de % y redondeo (datos controlados)', () => {
  function tablaPequena(estados) {
    const base = { ...tablas };
    base.asistencia = estados.map((e, i) => ({ id_asistencia: i + 1, id_persona_estudiante: 1001, id_profesor_materia_seccion: 1, fecha: '2025-03-03', estado: e }));
    return base;
  }
  const casos = [
    [['presente'], 100],
    [['ausente'], 0],
    [['tardanza'], 100],
    [['justificado'], 0],
    [['presente', 'ausente', 'ausente'], 33.3],
    [['presente', 'presente', 'ausente'], 66.7],
    [['presente', 'tardanza', 'ausente', 'justificado'], 50],
    [[...Array(999).fill('presente'), 'ausente'], 99.9],
    [[...Array(1999).fill('presente'), 'ausente'], 100], // 99.95 => 100.0 (redondeo half-up)
    [['presente', 'ausente', 'ausente', 'ausente', 'ausente', 'ausente', 'ausente'], 14.3],
  ];
  for (const [estados, esperado] of casos) {
    it(`${estados.length} registros (${[...new Set(estados)].join('+')}) => ${esperado}%`, async () => {
      setTables(tablaPequena(estados));
      try {
        const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-03-03', fecha_fin: '2025-03-03' });
        expect(r.body.resumen_general.porcentaje_asistencia).toBe(esperado);
        expect(r.body.secciones[0].totales.porcentaje_asistencia).toBe(esperado);
        expect(r.body.secciones[0].materias[0].totales.porcentaje_asistencia).toBe(esperado);
      } finally { setTables(tablas); }
    });
  }
  it('sin registros => porcentaje 0 (no NaN) y total 0', async () => {
    const r = await get({ periodo: 'personalizado', fecha_inicio: '2030-01-01', fecha_fin: '2030-01-31' });
    expect(r.body.resumen_general).toEqual({ total: 0, presentes: 0, tardias: 0, ausencias_justificadas: 0, ausencias_injustificadas: 0, otros: 0, porcentaje_asistencia: 0 });
    expect(r.body.secciones).toEqual([]);
  });
  it('[OBSERVACIÓN] un estado fuera del enum cae en "otros" y cuenta en el total (baja el %)', async () => {
    setTables(tablaPequena(['presente', 'permiso_especial']));
    try {
      const r = await get({ periodo: 'personalizado', fecha_inicio: '2025-03-03', fecha_fin: '2025-03-03' });
      expect(r.body.resumen_general.otros).toBe(1);
      expect(r.body.resumen_general.porcentaje_asistencia).toBe(50);
    } finally { setTables(tablas); }
  });
  it('fechas como objetos Date (como devuelve pg) se procesan igual', async () => {
    const t2 = { ...tablas, asistencia: tablas.asistencia.slice(0, 50).map((a) => ({ ...a, fecha: new Date(`${a.fecha}T00:00:00`) })) };
    setTables(t2);
    try {
      const r = await get({ periodo: 'anual', fecha_referencia: '2025-05-05' });
      expect(r.status).toBe(200);
    } finally { setTables(tablas); }
  });
});
