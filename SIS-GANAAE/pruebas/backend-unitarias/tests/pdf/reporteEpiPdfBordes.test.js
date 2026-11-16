/** Ciclo 7: casos borde adicionales del PDF EPI (volumen, caracteres especiales, determinismo). */
import { describe, it, expect } from 'vitest';
import { pipeReporteAsistenciaEpiPdf } from '../../../../backend-node/src/services/pdfService.js';
import { generarPdf, extraerTexto } from '../helpers/pdf.js';

const tot = (p = 0, t = 0, j = 0, a = 0) => {
  const total = p + t + j + a;
  return {
    total,
    presentes: p,
    tardias: t,
    ausencias_justificadas: j,
    ausencias_injustificadas: a,
    otros: 0,
    porcentaje_asistencia: total ? Math.round(((p + t) / total) * 1000) / 10 : 0,
  };
};
const rep = ({ secciones = [], general = tot(), filtros = {}, detalle } = {}) => ({
  filtros: { periodo: 'semanal', periodo_label: 'Semanal', fecha_inicio: '2026-11-09', fecha_fin: '2026-11-15', ...filtros },
  resumen_general: general,
  secciones,
  ...(detalle ? { detalle_diario: detalle, detalle_solo_incidencias: true } : {}),
});
const sec = (nombre, materias) => ({ nombre_seccion: nombre, totales: tot(1), materias: materias.map((m) => ({ nombre_materia: m, totales: tot(1) })) });

describe('PDF EPI — volumen', () => {
  it('200 secciones × 1 materia: todas aparecen en el resumen y la numeración es consistente', async () => {
    const secciones = Array.from({ length: 200 }, (_, i) => sec(`S${String(i + 1).padStart(3, '0')}`, ['M']));
    const { paginas, textos, todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ secciones })));
    expect(paginas).toBeGreaterThan(10);
    expect(todo).toContain('S200');
    expect(todo).toContain('Total general');
    textos.forEach((t, i) => expect(t).toContain(`Página ${i + 1} de ${paginas}`));
  });

  it('sección sin materias (materias: []) solo dibuja encabezado y total', async () => {
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ secciones: [sec('Vacía', [])] })));
    expect(todo).toContain('Sección Vacía');
    expect(todo).toContain('Total sección Vacía');
  });

  it('detalle de 90 días × 3 secciones × 5 estudiantes se genera en tiempo razonable', async () => {
    const detalle = Array.from({ length: 90 }, (_, d) => ({
      fecha: new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10),
      secciones: ['7-1', '7-2', '7-3'].map((s) => ({
        nombre_seccion: s,
        registros: Array.from({ length: 5 }, (_, k) => ({
          nombre_completo: `Est ${k}`,
          cedula: `1-${k}`,
          estado: 'tardanza',
          condicion: 'Tardía',
          materias: ['Matemática', 'Español'],
        })),
      })),
    }));
    const t0 = Date.now();
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ detalle }));
    const ms = Date.now() - t0;
    const { paginas, todo } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThan(30);
    expect(todo).toContain('Martes 31 de marzo de 2026');
    expect(ms).toBeLessThan(20000);
  });
});

describe('PDF EPI — valores y caracteres especiales', () => {
  it('cifras grandes en tarjetas de resumen (1 000 000) se imprimen completas', async () => {
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ general: tot(999999, 1) })));
    expect(todo).toContain('999999');
    expect(todo).toContain('1000000');
    expect(todo).toContain('100%');
  });

  it('periodo_label ausente imprime "undefined" en la línea Periodo (robustez)', async () => {
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ filtros: { periodo_label: undefined } })));
    expect(todo).toContain('Periodo: undefined (09/11/2026 al 15/11/2026)');
  });

  it('fechas de filtro nulas → "—"', async () => {
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ filtros: { fecha_inicio: null, fecha_fin: '' } })));
    expect(todo).toContain('(— al —)');
  });

  it('caracteres fuera de Latin-1 (emoji, CJK, €) no rompen la generación con Roboto', async () => {
    const buf = await generarPdf(
      pipeReporteAsistenciaEpiPdf,
      rep({ secciones: [sec('7-1 😀', ['数学', 'Economía €', 'Ciencias\nNaturales'])] })
    );
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Economía €');
  });

  it('inyección de texto tipo HTML/SQL se imprime literal', async () => {
    const nombre = "<b>7-1</b>'; DROP TABLE seccion;--";
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ secciones: [sec(nombre, ['M'])] })));
    expect(todo).toContain("DROP TABLE seccion;--");
  });
});

describe('PDF EPI — determinismo (detección de flakiness)', () => {
  it('3 generaciones del mismo reporte producen el mismo número de páginas y el mismo texto (salvo la fecha de generación)', async () => {
    const secciones = Array.from({ length: 15 }, (_, i) => sec(`S${i}`, ['A', 'B', 'C', 'D']));
    const normal = (t) => t.replace(/Generado el [^—]+—/g, 'Generado el X —');
    const res = [];
    for (let i = 0; i < 3; i += 1) res.push(await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ secciones }))));
    expect(new Set(res.map((r) => r.paginas)).size).toBe(1);
    expect(new Set(res.map((r) => normal(r.todo))).size).toBe(1);
  });
});

describe('PDF EPI — desbordes verticales (relacionado con D-07)', () => {
  it('CORREGIDO O-14: nombre de sección muy largo se recorta en una sola línea dentro de la barra de 18 pt', async () => {
    const { extraerItems } = await import('../helpers/pdf.js');
    const largo = 'Sección con nombre extraordinariamente largo '.repeat(6).trim();
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ secciones: [sec(largo, ['M'])] }));
    const items = await extraerItems(buf);
    const lineasTitulo = items.filter((i) => i.x === 46 && /nombre|extraordinariamente|largo|Sección/.test(i.str));
    expect(lineasTitulo).toHaveLength(1);
    expect(lineasTitulo[0].str.endsWith('…')).toBe(true);
  });

  it('CORREGIDO: cédula muy larga en el detalle se recorta en una sola línea', async () => {
    const { extraerItems } = await import('../helpers/pdf.js');
    const detalle = [{ fecha: '2026-11-10', secciones: [{ nombre_seccion: 'A', registros: [{ nombre_completo: 'X', cedula: '1-2345-6789 '.repeat(8).trim(), estado: 'ausente', condicion: 'Ausencia injustificada', materias: ['M'] }] }] }];
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, rep({ detalle }));
    const items = await extraerItems(buf, 2);
    const ced = items.filter((i) => i.str.includes('1-2345-6789'));
    expect(ced).toHaveLength(1);
  });
});
