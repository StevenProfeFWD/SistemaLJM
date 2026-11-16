import { describe, it, expect, beforeEach } from 'vitest';
import { obtenerReporteAsistenciaEpi } from '../../../../backend-node/src/services/epiReportesService.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import { setResolver, reset, llamadas } from '../helpers/dbMock.js';
import { resolverEpi, fila, filaDet, tieneOp, argsDe } from '../helpers/epiFixtures.js';

const Q = { periodo: 'personalizado', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' };
const consultaAgregada = () => llamadas.find((r) => r.tabla === 'asistencia as a' && tieneOp(r, 'groupBy'));
const consultaDetalle = () =>
  llamadas.find((r) => r.tabla === 'asistencia as a' && !tieneOp(r, 'groupBy') && tieneOp(r, 'select'));

beforeEach(() => reset());

describe('obtenerReporteAsistenciaEpi — estructura y caso vacío', () => {
  it('sin filas devuelve totales en cero y 0 % (sin división por cero)', async () => {
    setResolver(resolverEpi());
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general).toEqual({
      total: 0,
      presentes: 0,
      tardias: 0,
      ausencias_justificadas: 0,
      ausencias_injustificadas: 0,
      otros: 0,
      porcentaje_asistencia: 0,
    });
    expect(r.secciones).toEqual([]);
    expect(r.filtros).toMatchObject({
      periodo: 'personalizado',
      periodo_label: 'Personalizado',
      fecha_inicio: '2026-03-01',
      fecha_fin: '2026-03-31',
      id_seccion: null,
      id_materia: null,
      id_estudiante: null,
      nombre_seccion: null,
      nombre_materia: null,
      nombre_estudiante: null,
      cedula_estudiante: null,
    });
    expect(r).not.toHaveProperty('detalle_diario');
    expect(r).not.toHaveProperty('detalle_solo_incidencias');
  });

  it('query por defecto ({}) usa periodo mensual del mes actual', async () => {
    setResolver(resolverEpi());
    const r = await obtenerReporteAsistenciaEpi();
    expect(r.filtros.periodo).toBe('mensual');
    expect(r.filtros.periodo_label).toBe('Mensual');
  });

  it('devuelve los catálogos de secciones y materias', async () => {
    const secciones = [{ id_seccion: 1, nombre_seccion: '7-1' }];
    const materias = [{ id_materia: 2, nombre_materia: 'Español' }];
    setResolver(resolverEpi({ secciones, materias }));
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.catalogos).toEqual({ secciones, materias });
  });
});

describe('obtenerReporteAsistenciaEpi — agregación (caja blanca de sumarEstado/cerrarTotales)', () => {
  it('suma por estado, materia y sección; % = (presentes+tardías)/total con 1 decimal', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, '7-1', 10, 'Matemática', 'presente', '7'),
          fila(1, '7-1', 10, 'Matemática', 'tardanza', '2'),
          fila(1, '7-1', 10, 'Matemática', 'justificado', '1'),
          fila(1, '7-1', 11, 'Español', 'ausente', '3'),
          fila(1, '7-1', 11, 'Español', 'presente', '0'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general).toEqual({
      total: 13,
      presentes: 7,
      tardias: 2,
      ausencias_justificadas: 1,
      ausencias_injustificadas: 3,
      otros: 0,
      porcentaje_asistencia: 69.2, // 9/13 = 69.23
    });
    const sec = r.secciones[0];
    expect(sec.totales.total).toBe(13);
    // materias ordenadas por nombre (Español antes de Matemática)
    expect(sec.materias.map((m) => m.nombre_materia)).toEqual(['Español', 'Matemática']);
    expect(sec.materias[0].totales.porcentaje_asistencia).toBe(0);
    expect(sec.materias[1].totales.porcentaje_asistencia).toBe(90);
    expect(sec.materias[1]).toEqual({
      id_materia: 10,
      nombre_materia: 'Matemática',
      totales: expect.objectContaining({ total: 10, presentes: 7, tardias: 2, ausencias_justificadas: 1 }),
    });
  });

  it.each([
    [1, 3, 33.3],
    [2, 3, 66.7],
    [1, 6, 16.7],
    [1, 8, 12.5],
    [1, 1000, 0.1],
    [1, 2001, 0],
    [999, 1000, 99.9],
    [1999, 2000, 100], // 99.95 → redondea a 100
    [5, 5, 100],
  ])('%i presentes de %i → %s %%', async (pres, total, pct) => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, 'A', 1, 'M', 'presente', String(pres)),
          fila(1, 'A', 1, 'M', 'ausente', String(total - pres)),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general.porcentaje_asistencia).toBe(pct);
  });

  it('estados desconocidos, nulos y en mayúsculas', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, 'A', 1, 'M', 'PRESENTE', '2'),
          fila(1, 'A', 1, 'M', 'Tardanza', '1'),
          fila(1, 'A', 1, 'M', 'permiso_especial', '4'),
          fila(1, 'A', 1, 'M', null, '1'),
          fila(1, 'A', 1, 'M', 'suspendido', '2'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general).toMatchObject({ total: 10, presentes: 2, tardias: 1, otros: 7 });
    // los "otros" cuentan en el denominador del %
    expect(r.resumen_general.porcentaje_asistencia).toBe(30);
  });

  it('cantidad no numérica o nula se toma como 0; cantidad numérica (no string) también funciona', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, 'A', 1, 'M', 'presente', 'abc'),
          fila(1, 'A', 1, 'M', 'presente', null),
          fila(1, 'A', 1, 'M', 'presente', undefined),
          fila(1, 'A', 1, 'M', 'presente', 4),
          fila(1, 'A', 1, 'M', 'ausente', '1.9'), // parseInt → 1
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general.total).toBe(5);
    expect(r.resumen_general.presentes).toBe(4);
    expect(r.resumen_general.ausencias_injustificadas).toBe(1);
  });

  it('cantidad negativa no se valida (se resta del total) — comportamiento documentado', async () => {
    setResolver(
      resolverEpi({
        agregadas: [fila(1, 'A', 1, 'M', 'presente', '5'), fila(1, 'A', 1, 'M', 'ausente', '-5')],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general.total).toBe(0);
    expect(r.resumen_general.porcentaje_asistencia).toBe(0);
  });

  it('cantidades grandes (bigint de COUNT como string) se suman sin pérdida', async () => {
    setResolver(
      resolverEpi({
        agregadas: [fila(1, 'A', 1, 'M', 'presente', '2147483647'), fila(1, 'A', 1, 'M', 'tardanza', '2147483647')],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.resumen_general.total).toBe(4294967294);
    expect(r.resumen_general.porcentaje_asistencia).toBe(100);
  });

  it('volumen alto: 60 secciones × 25 materias × 4 estados (6 000 filas) agrega correctamente', async () => {
    const agregadas = [];
    for (let s = 1; s <= 60; s += 1) {
      for (let m = 1; m <= 25; m += 1) {
        agregadas.push(fila(s, `S-${s}`, m, `Materia ${m}`, 'presente', '3'));
        agregadas.push(fila(s, `S-${s}`, m, `Materia ${m}`, 'tardanza', '1'));
        agregadas.push(fila(s, `S-${s}`, m, `Materia ${m}`, 'ausente', '1'));
        agregadas.push(fila(s, `S-${s}`, m, `Materia ${m}`, 'justificado', '1'));
      }
    }
    setResolver(resolverEpi({ agregadas }));
    const t0 = performance.now();
    const r = await obtenerReporteAsistenciaEpi(Q);
    const ms = performance.now() - t0;
    expect(r.secciones).toHaveLength(60);
    expect(r.secciones.every((s) => s.materias.length === 25)).toBe(true);
    expect(r.resumen_general.total).toBe(60 * 25 * 6);
    expect(r.resumen_general.porcentaje_asistencia).toBe(66.7);
    // orden natural: S-2 antes que S-10
    expect(r.secciones.slice(0, 3).map((s) => s.nombre_seccion)).toEqual(['S-1', 'S-2', 'S-3']);
    expect(r.secciones[0].materias[1].nombre_materia).toBe('Materia 2');
    expect(ms).toBeLessThan(2000);
  });

  it('ordena secciones con collation española y numérica (7-2 < 7-10 < 10-1)', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(3, '10-1', 1, 'M', 'presente', '1'),
          fila(2, '7-10', 1, 'M', 'presente', '1'),
          fila(1, '7-2', 1, 'M', 'presente', '1'),
          fila(4, null, 1, 'M', 'presente', '1'), // sección sin nombre
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.secciones.map((s) => s.nombre_seccion)).toEqual([null, '7-2', '7-10', '10-1']);
  });

  it('el porcentaje de la sección no es el promedio de % por materia sino ponderado por registros', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, 'A', 1, 'M1', 'presente', '1'), // M1: 100 %
          fila(1, 'A', 2, 'M2', 'presente', '1'),
          fila(1, 'A', 2, 'M2', 'ausente', '9'), // M2: 10 %
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q);
    expect(r.secciones[0].totales.porcentaje_asistencia).toBe(18.2); // 2/11
  });
});

describe('obtenerReporteAsistenciaEpi — filtros e ids (parseEntero)', () => {
  it('aplica filtros de sección, materia y rango en la consulta agregada', async () => {
    setResolver(
      resolverEpi({
        secciones: [{ id_seccion: 5, nombre_seccion: '8-3' }],
        materias: [{ id_materia: 9, nombre_materia: 'Ciencias' }],
      })
    );
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: '5', id_materia: 9 });
    const reg = consultaAgregada();
    expect(argsDe(reg, 'whereBetween')).toEqual([['a.fecha', ['2026-03-01', '2026-03-31']]]);
    expect(argsDe(reg, 'where')).toEqual([
      ['pms.id_seccion', 5],
      ['pms.id_materia', 9],
    ]);
    expect(r.filtros).toMatchObject({ id_seccion: 5, id_materia: 9, nombre_seccion: '8-3', nombre_materia: 'Ciencias' });
  });

  it('sin filtros no agrega cláusulas where', async () => {
    setResolver(resolverEpi());
    await obtenerReporteAsistenciaEpi(Q);
    expect(argsDe(consultaAgregada(), 'where')).toEqual([]);
  });

  it('id de sección filtrado que no existe en el catálogo → nombre_seccion null', async () => {
    setResolver(resolverEpi({ secciones: [{ id_seccion: 1, nombre_seccion: '7-1' }] }));
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 99 });
    expect(r.filtros.nombre_seccion).toBeNull();
  });

  it('RIESGO: si el catálogo trae id_seccion como string (p.ej. columna bigint en pg) no se encuentra el nombre', async () => {
    setResolver(resolverEpi({ secciones: [{ id_seccion: '5', nombre_seccion: '8-3' }] }));
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: 5 });
    expect(r.filtros.nombre_seccion).toBeNull(); // comparación estricta ===
  });

  it.each([
    ['id_seccion', '0'],
    ['id_seccion', -1],
    ['id_seccion', 'abc'],
    ['id_materia', '-10'],
    ['id_materia', 0],
    ['id_estudiante', 'x1'],
    ['id_estudiante', "' OR 1=1 --"],
    ['id_seccion', NaN],
  ])('%s=%s inválido → AppError 400 sin consultar la BD', async (campo, valor) => {
    setResolver(resolverEpi());
    const err = await obtenerReporteAsistenciaEpi({ ...Q, [campo]: valor }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(`${campo} inválido`);
    expect(llamadas).toHaveLength(0);
  });

  it.each([null, undefined, '', '   '])('id vacío (%s) se ignora (sin filtro)', async (valor) => {
    setResolver(resolverEpi());
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: valor });
    expect(r.filtros.id_seccion).toBeNull();
  });

  it.each([
    ['5abc'],
    ['1 OR 1=1'],
    ['1.9'],
    ['1e3'],
    [['3', '4']], // ?id_seccion=3&id_seccion=4 (Express genera array)
  ])(
    'CORREGIDO D-03: parseEntero rechaza entradas parcialmente numéricas (%j) con AppError 400',
    async (valor) => {
      setResolver(resolverEpi());
      const e = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: valor }).catch((x) => x);
      expect(e).toBeInstanceOf(AppError);
      expect(e.statusCode).toBe(400);
    }
  );

  it('espacios alrededor de un id válido se toleran ("  7  " → 7)', async () => {
    setResolver(resolverEpi());
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: '  7  ' });
    expect(r.filtros.id_seccion).toBe(7);
    expect(argsDe(consultaAgregada(), 'where')[0]).toEqual(['pms.id_seccion', 7]);
  });

  it('CORREGIDO (DEF-04 API): id muy grande (> int4 de PostgreSQL) → 400 en lugar de llegar a la BD', async () => {
    setResolver(resolverEpi());
    const e = await obtenerReporteAsistenciaEpi({ ...Q, id_seccion: '99999999999' }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
  });

  it('el error de periodo se lanza antes que el de ids', async () => {
    const err = await obtenerReporteAsistenciaEpi({ periodo: 'personalizado', id_seccion: 'x' }).catch((e) => e);
    expect(err.message).toMatch(/AAAA-MM-DD/);
  });
});

describe('obtenerReporteAsistenciaEpi — estudiante seleccionado', () => {
  it('filtra por estudiante y carga nombre/cédula', async () => {
    setResolver(resolverEpi({ persona: { nombre_completo: 'Ana Pérez', cedula: '1-1111-1111' } }));
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_estudiante: '42' });
    expect(argsDe(consultaAgregada(), 'where')).toContainEqual(['a.id_persona_estudiante', 42]);
    const per = llamadas.find((x) => x.tabla === 'persona');
    // CORREGIDO (DEF-06 API): solo se busca entre personas con rol estudiante (privacidad).
    expect(argsDe(per, 'where')).toEqual([[{ id_persona: 42, nombre_rol: 'estudiante' }]]);
    expect(argsDe(per, 'first')).toEqual([['nombre_completo', 'cedula']]);
    expect(r.filtros).toMatchObject({ id_estudiante: 42, nombre_estudiante: 'Ana Pérez', cedula_estudiante: '1-1111-1111' });
  });

  it('estudiante inexistente → nombre y cédula null', async () => {
    setResolver(resolverEpi({ persona: undefined }));
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_estudiante: 7 });
    expect(r.filtros.nombre_estudiante).toBeNull();
    expect(r.filtros.cedula_estudiante).toBeNull();
  });

  it('sin estudiante no consulta la tabla persona', async () => {
    setResolver(resolverEpi());
    await obtenerReporteAsistenciaEpi(Q);
    expect(llamadas.some((x) => x.tabla === 'persona')).toBe(false);
  });
});

describe('obtenerReporteAsistenciaEpi — detalle diario (construirDetalleDiario)', () => {
  it('incluirDetalle=false no ejecuta la consulta de detalle', async () => {
    setResolver(resolverEpi());
    await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: false });
    expect(consultaDetalle()).toBeUndefined();
  });

  it('sin estudiante: solo incidencias (whereIn tardanza/ausente/justificado) y detalle_solo_incidencias=true', async () => {
    setResolver(resolverEpi());
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    const det = consultaDetalle();
    expect(argsDe(det, 'whereIn')).toEqual([['a.estado', ['tardanza', 'ausente', 'justificado']]]);
    expect(argsDe(det, 'join').map((a) => a[0])).toContain('persona as est');
    expect(argsDe(det, 'orderBy')).toEqual([
      ['a.fecha', 'asc'],
      ['mat.nombre_materia', 'asc'],
    ]);
    expect(r.detalle_diario).toEqual([]);
    expect(r.detalle_solo_incidencias).toBe(true);
  });

  it('con estudiante: todas las marcas (sin whereIn) y detalle_solo_incidencias=false', async () => {
    setResolver(resolverEpi({ persona: { nombre_completo: 'X', cedula: null } }));
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_estudiante: 3 }, { incluirDetalle: true });
    expect(tieneOp(consultaDetalle(), 'whereIn')).toBe(false);
    expect(r.detalle_solo_incidencias).toBe(false);
  });

  it('agrupa fecha → sección → estudiante+estado y acumula materias sin duplicar', async () => {
    setResolver(
      resolverEpi({
        detalle: [
          filaDet('2026-03-03', 1, '7-1', 'Matemática', 10, 'Zoe Mora', 'ausente'),
          filaDet('2026-03-03', 1, '7-1', 'Español', 10, 'Zoe Mora', 'ausente'),
          filaDet('2026-03-03', 1, '7-1', 'Español', 10, 'Zoe Mora', 'ausente'), // duplicada
          filaDet('2026-03-03', 1, '7-1', 'Inglés', 10, 'Zoe Mora', 'tardanza'),
          filaDet('2026-03-03', 1, '7-1', 'Inglés', 11, 'Ana Ruiz', 'tardanza'),
          filaDet('2026-03-03', 1, '7-1', 'Inglés', 12, 'Beto Díaz', 'justificado'),
          filaDet('2026-03-03', 2, '10-1', 'Física', 20, 'Carlos', 'ausente'),
          filaDet('2026-03-03', 3, '7-2', 'Física', 30, 'Dora', 'ausente'),
          filaDet('2026-03-02', 1, '7-1', 'Música', 11, 'Ana Ruiz', 'ausente'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    expect(r.detalle_diario.map((d) => d.fecha)).toEqual(['2026-03-02', '2026-03-03']);
    const dia = r.detalle_diario[1];
    expect(dia.secciones.map((s) => s.nombre_seccion)).toEqual(['7-1', '7-2', '10-1']);
    const regs = dia.secciones[0].registros;
    // orden: ausente(0), tardanza(1) por nombre, justificado(2)
    expect(regs.map((x) => `${x.nombre_completo}|${x.estado}`)).toEqual([
      'Zoe Mora|ausente',
      'Ana Ruiz|tardanza',
      'Zoe Mora|tardanza',
      'Beto Díaz|justificado',
    ]);
    expect(regs[0]).toEqual({
      id_estudiante: 10,
      nombre_completo: 'Zoe Mora',
      cedula: '1-10',
      estado: 'ausente',
      condicion: 'Ausencia injustificada',
      materias: ['Matemática', 'Español'],
    });
    expect(regs[1].condicion).toBe('Tardía');
    expect(regs[3].condicion).toBe('Ausencia justificada');
  });

  it('etiquetas de condición para todos los estados conocidos y desconocidos; orden con desconocidos al final', async () => {
    const estados = ['expulsado', 'presente', 'permiso_especial', 'suspendido', 'ESTADO_RARO', null, 'Ausente'];
    setResolver(
      resolverEpi({
        persona: { nombre_completo: 'E', cedula: 'c' },
        detalle: estados.map((e, i) => filaDet('2026-03-05', 1, 'A', `M${i}`, 1, 'E', e)),
      })
    );
    const r = await obtenerReporteAsistenciaEpi({ ...Q, id_estudiante: 1 }, { incluirDetalle: true });
    const regs = r.detalle_diario[0].secciones[0].registros;
    const mapa = Object.fromEntries(regs.map((x) => [x.estado, x.condicion]));
    expect(mapa).toEqual({
      ausente: 'Ausencia injustificada',
      presente: 'Presente',
      expulsado: 'Expulsado',
      permiso_especial: 'Permiso especial',
      suspendido: 'Suspendido',
      estado_raro: 'estado_raro',
      '': '',
    });
    expect(regs[0].estado).toBe('ausente');
    expect(regs[1].estado).toBe('presente');
  });

  it('fechas Date se convierten con hora local; fechas string con hora se truncan; null → ""', async () => {
    setResolver(
      resolverEpi({
        detalle: [
          filaDet(new Date(2026, 2, 9), 1, 'A', 'M', 1, 'E', 'ausente'),
          filaDet('2026-03-10T06:00:00.000Z', 1, 'A', 'M', 1, 'E', 'ausente'),
          filaDet(null, 1, 'A', 'M', 2, 'F', 'ausente'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    expect(r.detalle_diario.map((d) => d.fecha)).toEqual(['', '2026-03-09', '2026-03-10']);
  });

  it('nombres nulos de estudiante se ordenan primero sin lanzar error', async () => {
    setResolver(
      resolverEpi({
        detalle: [
          filaDet('2026-03-03', 1, 'A', 'M', 1, 'Beto', 'ausente'),
          filaDet('2026-03-03', 1, 'A', 'M', 2, null, 'ausente'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    expect(r.detalle_diario[0].secciones[0].registros.map((x) => x.nombre_completo)).toEqual([null, 'Beto']);
  });

  it('volumen alto de detalle: 20 000 filas', async () => {
    const detalle = [];
    for (let i = 0; i < 20000; i += 1) {
      const dia = String((i % 28) + 1).padStart(2, '0');
      detalle.push(filaDet(`2026-02-${dia}`, i % 10, `S${i % 10}`, `M${i % 7}`, i % 500, `Est ${i % 500}`, 'ausente'));
    }
    setResolver(resolverEpi({ detalle }));
    const r = await obtenerReporteAsistenciaEpi(Q, { incluirDetalle: true });
    expect(r.detalle_diario).toHaveLength(28);
    const totalRegs = r.detalle_diario.reduce(
      (acc, d) => acc + d.secciones.reduce((a, s) => a + s.registros.length, 0),
      0
    );
    expect(totalRegs).toBeGreaterThan(0);
    expect(totalRegs).toBeLessThanOrEqual(20000);
  });
});

describe('obtenerReporteAsistenciaEpi — errores de BD', () => {
  it('propaga el error si una consulta falla', async () => {
    setResolver((reg) => {
      if (reg.tabla === 'seccion') throw new Error('conexión perdida');
      return [];
    });
    await expect(obtenerReporteAsistenciaEpi(Q)).rejects.toThrow('conexión perdida');
  });
});
