/** Casos borde adicionales (ciclo 3) de epiReportesService — caja blanca. */
import { describe, it, expect, beforeEach } from 'vitest';
import { obtenerReporteAsistenciaEpi } from '../../../../backend-node/src/services/epiReportesService.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import { setResolver, reset, llamadas } from '../helpers/dbMock.js';
import { resolverEpi, fila, filaDet } from '../helpers/epiFixtures.js';

const Q = { periodo: 'anual', fecha_referencia: '2026-06-15' };
beforeEach(() => reset());

describe('número de consultas emitidas (Promise.all)', () => {
  it.each([
    [{}, {}, 3],
    [{}, { incluirDetalle: true }, 4],
    [{ id_estudiante: 1 }, {}, 4],
    [{ id_estudiante: 1 }, { incluirDetalle: true }, 5],
  ])('query %j opciones %j → %i consultas', async (extra, opts, n) => {
    setResolver(resolverEpi());
    await obtenerReporteAsistenciaEpi({ ...Q, ...extra }, opts);
    expect(llamadas).toHaveLength(n);
  });
});

describe('más entradas de id', () => {
  it.each([[true], [false], [{}], [[]], ['NaN'], ['Infinity'], ['-0'], ['0x10']])('id_materia=%j', async (v) => {
    setResolver(resolverEpi());
    const res = await obtenerReporteAsistenciaEpi({ ...Q, id_materia: v }).catch((e) => e);
    // CORREGIDO D-13: arreglos y objetos ya no se convierten con String(); se rechazan con 400.
    expect(res).toBeInstanceOf(AppError);
    expect(res.statusCode).toBe(400);
  });

  it('CORREGIDO D-03: "+5" ya no se acepta (solo dígitos) → 400', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ ...Q, id_materia: '+5' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it('CORREGIDO (DEF-04 API): id Number.MAX_SAFE_INTEGER supera int4 → 400 (antes llegaba a la BD → 500)', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: Number.MAX_SAFE_INTEGER }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it('id = 2147483647 (máximo int4) se acepta; 2147483648 no', async () => {
    setResolver(resolverEpi());
    expect((await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 2147483647 })).filtros.id_seccion).toBe(2147483647);
    const e = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 2147483648 }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
  });

  it('CORREGIDO D-03: id 1e21 (Number) ya no se trunca a 1 → 400', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 1e21 }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });
});

describe('agregación: filas repetidas e identidad de sección', () => {
  it('filas repetidas (misma sección/materia/estado) se suman', async () => {
    setResolver(resolverEpi({ agregadas: [fila(1, 'A', 1, 'M', 'presente', '2'), fila(1, 'A', 1, 'M', 'presente', '3')] }));
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.secciones[0].materias).toHaveLength(1);
    expect(r.secciones[0].materias[0].totales.presentes).toBe(5);
  });

  it('mismo id con distinto nombre: prevalece el primer nombre visto', async () => {
    setResolver(
      resolverEpi({ agregadas: [fila(1, 'Primero', 1, 'M1', 'presente', '1'), fila(1, 'Segundo', 2, 'M2', 'presente', '1')] })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.secciones).toHaveLength(1);
    expect(r.secciones[0].nombre_seccion).toBe('Primero');
  });

  it('id 1 (number) y "1" (string) se tratan como secciones distintas (Map por identidad)', async () => {
    setResolver(resolverEpi({ agregadas: [fila(1, 'A', 1, 'M', 'presente', '1'), fila('1', 'A', 1, 'M', 'presente', '1')] }));
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.secciones).toHaveLength(2);
  });

  it('invariante: total general = Σ secciones = Σ materias = Σ categorías (200 filas pseudoaleatorias, semilla fija)', async () => {
    let semilla = 42;
    const rnd = (n) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % n;
    };
    const estados = ['presente', 'tardanza', 'ausente', 'justificado', 'permiso_especial'];
    const agregadas = Array.from({ length: 200 }, () => {
      const s = rnd(7);
      return fila(s, `S${s}`, rnd(9), 'M', estados[rnd(5)], String(rnd(50)));
    });
    setResolver(resolverEpi({ agregadas }));
    const r = await obtenerReporteAsistenciaEpi(Q);
    const sumSec = r.secciones.reduce((a, s) => a + s.totales.total, 0);
    const sumMat = r.secciones.reduce((a, s) => a + s.materias.reduce((b, m) => b + m.totales.total, 0), 0);
    const esperado = agregadas.reduce((a, f) => a + parseInt(f.cantidad, 10), 0);
    expect(r.resumen_general.total).toBe(esperado);
    expect(sumSec).toBe(esperado);
    expect(sumMat).toBe(esperado);
    const g = r.resumen_general;
    expect(g.presentes + g.tardias + g.ausencias_justificadas + g.ausencias_injustificadas + g.otros).toBe(g.total);
  });
});

describe('redondeo del porcentaje (punto flotante)', () => {
  it('CORREGIDO D-12: 201 de 400 = 50,25 % exacto se redondea half-up a 50.3', async () => {
    setResolver(
      resolverEpi({ agregadas: [fila(1, 'A', 1, 'M', 'presente', '201'), fila(1, 'A', 1, 'M', 'ausente', '199')] })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general.porcentaje_asistencia).toBe(50.3);
  });

  it('CORREGIDO D-12 (expectativa correcta): 203/400 = 50,75 % debería mostrarse 50.8', async () => {
    setResolver(
      resolverEpi({ agregadas: [fila(1, 'A', 1, 'M', 'presente', '203'), fila(1, 'A', 1, 'M', 'ausente', '197')] })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general.porcentaje_asistencia).toBe(50.8);
  });

  it('0 ≤ % ≤ 100 y como máximo 1 decimal (barrido de pares p/t)', async () => {
    for (let t = 1; t <= 150; t += 7) {
      for (let p = 0; p <= t; p += 3) {
        reset();
        setResolver(
          resolverEpi({
            agregadas: [fila(1, 'A', 1, 'M', 'presente', String(p)), fila(1, 'A', 1, 'M', 'ausente', String(t - p))],
          })
        );
        const { porcentaje_asistencia: pct } = (await obtenerReporteAsistenciaEpi(Q)).resumen_general;
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
        expect(Math.round(pct * 10) / 10).toBe(pct);
      }
    }
  });
});

describe('aislamiento entre llamadas concurrentes', () => {
  it('dos reportes simultáneos con filtros distintos no se mezclan', async () => {
    setResolver((reg) => {
      const filtroSec = reg.ops.find((o) => o.op === 'where' && o.args[0] === 'pms.id_seccion');
      if (reg.tabla === 'asistencia as a' && reg.ops.some((o) => o.op === 'groupBy')) {
        const id = filtroSec ? filtroSec.args[1] : 0;
        return [fila(id, `S${id}`, 1, 'M', 'presente', String(id * 10))];
      }
      return [];
    });
    const [a, b] = await Promise.all([
      obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 1 }),
      obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 2 }),
    ]);
    expect(a.resumen_general.total).toBe(10);
    expect(b.resumen_general.total).toBe(20);
  });
});

describe('detalle: casos adicionales', () => {
  it('mismo estudiante con incidencias el mismo día en dos secciones aparece una vez por sección', async () => {
    setResolver(
      resolverEpi({
        detalle: [
          filaDet('2026-06-01', 1, 'A', 'M1', 5, 'Eva', 'ausente'),
          filaDet('2026-06-01', 2, 'B', 'M2', 5, 'Eva', 'ausente'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    expect(r.detalle_diario[0].secciones.map((s) => s.registros.length)).toEqual([1, 1]);
  });

  it('materia null se agrega como null a la lista (no se filtra)', async () => {
    setResolver(resolverEpi({ detalle: [filaDet('2026-06-01', 1, 'A', null, 5, 'Eva', 'ausente')] }));
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    expect(r.detalle_diario[0].secciones[0].registros[0].materias).toEqual([null]);
  });

  it('estado con espacios (" ausente ") no se normaliza: queda como estado desconocido', async () => {
    setResolver(resolverEpi({ detalle: [filaDet('2026-06-01', 1, 'A', 'M', 5, 'Eva', ' ausente ')] }));
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    const reg = r.detalle_diario[0].secciones[0].registros[0];
    expect(reg.estado).toBe(' ausente ');
    expect(reg.condicion).toBe(' ausente ');
  });
});

describe('parámetros como arreglo (qs "extended" de Express: ?x[]=valor)', () => {
  it('CORREGIDO D-13: fecha_referencia=["2026-03-10"] ya no revienta con TypeError (→ 500): es AppError 400', async () => {
    setResolver(resolverEpi());
    const err = await obtenerReporteAsistenciaEpi({ periodo: 'semanal', fecha_referencia: ['2026-03-10'] }).catch((e) => e);
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
  });

  it('CORREGIDO D-13 (expectativa correcta): un arreglo debería rechazarse con AppError 400 o ignorarse', async () => {
    setResolver(resolverEpi());
    const res = await obtenerReporteAsistenciaEpi({ periodo: 'semanal', fecha_referencia: ['2026-03-10'] }).catch((e) => e);
    const rechazado = res instanceof AppError && res.statusCode === 400;
    const ignorado = res?.filtros?.periodo === 'semanal';
    expect(rechazado || ignorado).toBe(true);
  });

  it('CORREGIDO D-13b: personalizado con fecha_inicio=["2026-01-01"] → 400 y no llega a whereBetween', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ periodo: 'personalizado', fecha_inicio: ['2026-01-01'], fecha_fin: '2026-01-31' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
    expect(llamadas.find((x) => x.tabla === 'asistencia as a')).toBeUndefined();
  });

  it('CORREGIDO: periodo como arreglo → 400 (antes caía en mensual en silencio)', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ periodo: ['anual'], fecha_referencia: '2026-03-10' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });
});

describe('rendimiento con volúmenes grandes (BD simulada)', () => {
  it('100 000 filas agregadas se procesan en < 3 s', async () => {
    const { obtenerReporteAsistenciaEpi: rep } = await import('../../../../backend-node/src/services/epiReportesService.js');
    const agregadas = [];
    for (let i = 0; i < 100000; i += 1) agregadas.push(fila(i % 80, `S${i % 80}`, i % 30, `M${i % 30}`, ['presente', 'ausente', 'tardanza', 'justificado'][i % 4], '1'));
    setResolver(resolverEpi({ agregadas }));
    const t0 = Date.now();
    const r = await rep(Q);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.resumen_general.total).toBe(100000);
    expect(r.resumen_general.porcentaje_asistencia).toBe(50);
  });

  it('listarEstudiantesSeccionEpi con 10 000 estudiantes (5 000 duplicados entre fuentes)', async () => {
    const { listarEstudiantesSeccionEpi } = await import('../../../../backend-node/src/services/epiReportesService.js');
    const est = (i) => ({ id_estudiante: i, nombre_completo: `Estudiante ${i}`, cedula: String(i) });
    setResolver(
      resolverEpi({
        matriculados: Array.from({ length: 7500 }, (_, i) => est(i)),
        conAsistencia: Array.from({ length: 7500 }, (_, i) => est(i + 2500)),
      })
    );
    const t0 = Date.now();
    const r = await listarEstudiantesSeccionEpi(1, { anio: 2026 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.estudiantes).toHaveLength(10000);
    expect(r.estudiantes[1].nombre_completo).toBe('Estudiante 1');
    expect(r.estudiantes[2].nombre_completo).toBe('Estudiante 2'); // orden numérico natural
  });
});

describe('expectativas correctas de defectos (antes it.fails; el defecto ya está corregido)', () => {
  it('CORREGIDO D-03 (expectativa correcta): id_seccion="5abc" debería rechazarse con AppError 400', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: '5abc' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
  });
});
