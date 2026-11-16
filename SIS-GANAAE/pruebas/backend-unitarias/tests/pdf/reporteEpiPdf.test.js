import { describe, it, expect, beforeEach } from 'vitest';
import { pipeReporteAsistenciaEpiPdf } from '../../../../backend-node/src/services/pdfService.js';
import { obtenerReporteAsistenciaEpi } from '../../../../backend-node/src/services/epiReportesService.js';
import { setResolver, reset } from '../helpers/dbMock.js';
import { resolverEpi, fila, filaDet } from '../helpers/epiFixtures.js';
import { generarPdf, extraerTexto, extraerItems } from '../helpers/pdf.js';
import { peticiones } from '../helpers/stubs/axios.js';

const tot = (p = 0, t = 0, j = 0, a = 0, o = 0) => {
  const total = p + t + j + a + o;
  return {
    total,
    presentes: p,
    tardias: t,
    ausencias_justificadas: j,
    ausencias_injustificadas: a,
    otros: o,
    porcentaje_asistencia: total ? Math.round(((p + t) / total) * 1000) / 10 : 0,
  };
};

const filtrosBase = {
  periodo: 'mensual',
  periodo_label: 'Mensual',
  fecha_inicio: '2026-03-01',
  fecha_fin: '2026-03-31',
  id_seccion: null,
  id_materia: null,
  id_estudiante: null,
  nombre_seccion: null,
  nombre_materia: null,
  nombre_estudiante: null,
  cedula_estudiante: null,
};

function reporte({ secciones = [], filtros = {}, detalle, soloIncidencias } = {}) {
  const r = {
    filtros: { ...filtrosBase, ...filtros },
    resumen_general: tot(),
    secciones,
    catalogos: { secciones: [], materias: [] },
  };
  if (detalle !== undefined) {
    r.detalle_diario = detalle;
    r.detalle_solo_incidencias = soloIncidencias;
  }
  return r;
}

const seccion = (nombre, nMaterias, nombreMateria = (i) => `Materia ${i + 1}`) => ({
  id_seccion: nombre,
  nombre_seccion: nombre,
  totales: tot(10 * nMaterias, nMaterias, 0, nMaterias),
  materias: Array.from({ length: nMaterias }, (_, i) => ({
    id_materia: i,
    nombre_materia: nombreMateria(i),
    totales: tot(10, 1, 0, 1),
  })),
});

const esPdfValido = (buf) => {
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buf.subarray(-8).toString('latin1')).toMatch(/%%EOF\s*$/);
};

beforeEach(() => reset());

describe('pipeReporteAsistenciaEpiPdf — validez del documento', () => {
  it('reporte vacío (0 secciones): PDF válido de 1 página con mensaje de "sin registros"', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte());
    esPdfValido(buf);
    const { paginas, todo } = await extraerTexto(buf);
    expect(paginas).toBe(1);
    expect(todo).toContain('No hay registros de asistencia para el periodo y filtros seleccionados.');
    expect(todo).toContain('Página 1 de 1');
    expect(todo).toContain('Todas las secciones');
    expect(todo).toContain('Todas las materias');
    expect(todo).toContain('01/03/2026');
    expect(todo).not.toContain('Resumen por sección');
    expect(todo).not.toContain('Detalle diario de asistencia');
  });

  it('usa logos locales: no realiza peticiones HTTP', async () => {
    peticiones.length = 0;
    await generarPdf(pipeReporteAsistenciaEpiPdf, reporte());
    expect(peticiones).toEqual([]);
  });

  it('conserva tildes y ñ (fuente Roboto embebida)', async () => {
    const buf = await generarPdf(
      pipeReporteAsistenciaEpiPdf,
      reporte({
        filtros: { nombre_seccion: 'Niñez-1', nombre_materia: 'Educación Física', nombre_estudiante: 'José Núñez Íñiguez', cedula_estudiante: '1-0234-0567' },
        secciones: [seccion('Niñez-1', 1, () => 'Educación Física')],
      })
    );
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Benemérito Liceo José Martí');
    expect(todo).toContain('Niñez-1');
    expect(todo).toContain('Educación Física');
    expect(todo).toContain('José Núñez Íñiguez (1-0234-0567)');
    expect(todo).toContain('Tardías');
  });

  it('estudiante sin cédula: no imprime paréntesis vacíos', async () => {
    const buf = await generarPdf(
      pipeReporteAsistenciaEpiPdf,
      reporte({ filtros: { nombre_estudiante: 'Ana Solís', cedula_estudiante: null } })
    );
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Ana Solís');
    expect(todo).not.toContain('Ana Solís (');
  });

  it('1 sección: contiene título de sección, materias y fila de total, sin "Resumen por sección"', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ secciones: [seccion('7-1', 3)] }));
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBe(1);
    expect(todo).toContain('Sección 7-1');
    expect(todo).toContain('Materia 1');
    expect(todo).toContain('Materia 3');
    expect(todo).toContain('Total sección 7-1');
    expect(todo).not.toContain('Resumen por sección');
  });

  it('2+ secciones: incluye "Resumen por sección" y "Total general"', async () => {
    const buf = await generarPdf(
      pipeReporteAsistenciaEpiPdf,
      reporte({ secciones: [seccion('7-1', 2), seccion('7-2', 2)] })
    );
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Resumen por sección');
    expect(todo).toContain('Total general');
  });

  it('el número de páginas crece con los datos y cada página tiene "Página X de Y"', async () => {
    const conteos = [];
    for (const n of [1, 5, 20, 60]) {
      const secs = Array.from({ length: n }, (_, i) => seccion(`S-${i + 1}`, 8));
      const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ secciones: secs }));
      esPdfValido(buf);
      const { paginas, textos } = await extraerTexto(buf);
      conteos.push(paginas);
      textos.forEach((t, i) => expect(t).toContain(`Página ${i + 1} de ${paginas}`));
    }
    expect(conteos[0]).toBe(1);
    for (let i = 1; i < conteos.length; i += 1) expect(conteos[i]).toBeGreaterThanOrEqual(conteos[i - 1]);
    expect(conteos[3]).toBeGreaterThan(conteos[0]);
  });

  it('nombres de materia muy largos: el PDF se genera en 1 página', async () => {
    const largo = 'Matemática '.repeat(60);
    const buf = await generarPdf(
      pipeReporteAsistenciaEpiPdf,
      reporte({ secciones: [seccion('7-1', 3, () => largo)] })
    );
    esPdfValido(buf);
    const { paginas, todo } = await extraerTexto(buf);
    expect(paginas).toBe(1);
    expect(todo).toContain('Matemática');
  });

  it('CORREGIDO D-07: el nombre largo se recorta con "…" en una sola línea y queda por encima de "Total sección"', async () => {
    const largo = 'Matemática '.repeat(60).trim();
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ secciones: [seccion('7-1', 1, () => largo)] }));
    const items = await extraerItems(buf);
    const lineas = items.filter((i) => i.str.startsWith('Matemática') && i.x < 60);
    const total = items.find((i) => i.str.startsWith('Total sección'));
    expect(lineas).toHaveLength(1);
    expect(lineas[0].str.endsWith('…')).toBe(true);
    expect(lineas[0].y).toBeGreaterThan(total.y); // coordenadas PDF: y crece hacia arriba
  });

  it('CORREGIDO D-07 (expectativa correcta): el nombre de materia debería ocupar una sola línea dentro de su celda', async () => {
    const largo = 'Matemática '.repeat(60).trim();
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ secciones: [seccion('7-1', 1, () => largo)] }));
    const items = await extraerItems(buf);
    const lineas = items.filter((i) => i.str.startsWith('Matemática') && i.x < 60);
    expect(lineas.length).toBe(1);
  });

  it('valores nulos/indefinidos en nombres no rompen la generación', async () => {
    const sec = seccion(null, 1, () => null);
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ secciones: [sec, seccion(undefined, 1)] }));
    esPdfValido(buf);
    const { todo } = await extraerTexto(buf);
    // nombre null se imprime como texto "null" en el título (template literal)
    expect(todo).toContain('Sección null');
  });

  it('una sección con 80 materias (no cabe en una página) se divide entre páginas', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ secciones: [seccion('Grande', 80)] }));
    const { paginas, todo } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThanOrEqual(2);
    expect(todo).toContain('Materia 80');
    expect(todo).toContain('Total sección Grande');
  });
});

describe('pipeReporteAsistenciaEpiPdf — detalle diario', () => {
  const reg = (nombre, estado, materias, cedula = '1-1') => ({
    id_estudiante: nombre,
    nombre_completo: nombre,
    cedula,
    estado,
    condicion: { ausente: 'Ausencia injustificada', tardanza: 'Tardía', justificado: 'Ausencia justificada', presente: 'Presente' }[estado] || estado,
    materias,
  });

  it('detalle vacío con soloIncidencias → página extra con mensaje de "no se registraron tardías"', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle: [], soloIncidencias: true }));
    const { paginas, todo } = await extraerTexto(buf);
    expect(paginas).toBe(2);
    expect(todo).toContain('Detalle diario de asistencia');
    expect(todo).toContain('No se registraron tardías ni ausencias en el periodo.');
    expect(todo).toContain('Página 2 de 2');
  });

  it('detalle vacío para estudiante (soloIncidencias=false) → "Sin marcas en el periodo."', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle: [], soloIncidencias: false }));
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Sin marcas en el periodo.');
    expect(todo).toContain('Todas las marcas de asistencia del estudiante');
  });

  it('detalle_solo_incidencias ausente (undefined) se trata como solo incidencias', async () => {
    const r = reporte();
    r.detalle_diario = [];
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, r));
    expect(todo).toContain('No se registraron tardías ni ausencias en el periodo.');
  });

  it('imprime fecha larga en español, sección, resumen singular/plural, estudiantes y materias', async () => {
    const detalle = [
      {
        fecha: '2026-03-04',
        secciones: [
          {
            nombre_seccion: '8-2',
            registros: [
              reg('María Fernández', 'ausente', ['Español', 'Matemática']),
              reg('Pedro Ñanco', 'ausente', ['Música']),
              reg('Luis Araya', 'tardanza', ['Inglés']),
              reg('Sofía', 'justificado', ['Física']),
              reg('Tomás', 'presente', ['Arte']),
            ],
          },
        ],
      },
    ];
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: false }));
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Miércoles 4 de marzo de 2026');
    expect(todo).toContain('Sección 8-2');
    expect(todo).toMatch(/1 tardía · 2 ausencias injustificadas · 1 ausencia justificada · 1 presente/);
    expect(todo).toContain('María Fernández');
    expect(todo).toContain('Pedro Ñanco');
    expect(todo).toContain('Español, Matemática');
    expect(todo).toContain('Ausencia injustificada');
  });

  it('muchos estudiantes en un día → continúa en páginas nuevas con "(continuación)"', async () => {
    const registros = Array.from({ length: 120 }, (_, i) => reg(`Estudiante ${i + 1}`, 'ausente', ['Matemática']));
    const detalle = [{ fecha: '2026-03-02', secciones: [{ nombre_seccion: '9-1', registros }] }];
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: true }));
    const { paginas, textos, todo } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThanOrEqual(3);
    expect(todo).toContain('(continuación)');
    expect(todo).toContain('Estudiante 120');
    textos.forEach((t, i) => expect(t).toContain(`Página ${i + 1} de ${paginas}`));
  });

  it('CORREGIDO D-06: fecha vacía en el detalle (fecha null en BD → "") se imprime como "Sin fecha"', async () => {
    const detalle = [{ fecha: '', secciones: [{ nombre_seccion: 'A', registros: [reg('X', 'ausente', ['M'])] }] }];
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: true }));
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Sin fecha');
    expect(todo).not.toContain('undefined');
  });

  it('estudiante sin nombre ni cédula → "—"; materias vacías', async () => {
    const detalle = [
      { fecha: '2026-03-06', secciones: [{ nombre_seccion: 'A', registros: [{ ...reg(null, 'ausente', []), cedula: null }] }] },
    ];
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: true }));
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('—');
    expect(todo).toContain('Viernes 6 de marzo de 2026');
  });

  it('lista de materias muy larga en una fila de detalle: el PDF se genera y la paginación se mantiene coherente', async () => {
    const materias = Array.from({ length: 300 }, (_, i) => `Materia con nombre extenso número ${i + 1}`);
    const detalle = [{ fecha: '2026-03-02', secciones: [{ nombre_seccion: 'A', registros: [reg('Z', 'presente', materias)] }] }];
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: false }));
    esPdfValido(buf);
    const { paginas, textos } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThanOrEqual(2);
    textos.forEach((t, i) => expect(t).toContain(`Página ${i + 1} de ${paginas}`));
  });

  it('domingo y año bisiesto en fecha larga', async () => {
    const detalle = [
      { fecha: '2026-03-01', secciones: [] },
      { fecha: '2024-02-29', secciones: [] },
    ];
    const { todo } = await extraerTexto(
      await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: true }))
    );
    expect(todo).toContain('Domingo 1 de marzo de 2026');
    expect(todo).toContain('Jueves 29 de febrero de 2024');
  });
});

describe('integración servicio → PDF (BD simulada)', () => {
  it('el reporte producido por obtenerReporteAsistenciaEpi se convierte en PDF con los datos', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, '7-1', 1, 'Ciencias', 'presente', '8'),
          fila(1, '7-1', 1, 'Ciencias', 'ausente', '2'),
          fila(2, '7-2', 1, 'Ciencias', 'tardanza', '5'),
        ],
        detalle: [filaDet('2026-03-03', 1, '7-1', 'Ciencias', 9, 'Gabriela Chacón', 'ausente')],
        secciones: [{ id_seccion: 1, nombre_seccion: '7-1' }],
      })
    );
    const r = await obtenerReporteAsistenciaEpi(
      { periodo: 'mensual', fecha_referencia: '2026-03-15', id_seccion: 1 },
      { incluirDetalle: true }
    );
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, r);
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBe(2);
    expect(todo).toContain('Mensual (01/03/2026 al 31/03/2026)');
    expect(todo).toContain('Sección 7-1');
    expect(todo).toContain('Gabriela Chacón');
    expect(todo).toContain('86.7%'); // 13/15
    expect(todo).toContain('Martes 3 de marzo de 2026');
  });
});

describe('expectativas correctas de defectos PDF (antes it.fails; corregidos)', () => {
  it('CORREGIDO D-06 (expectativa correcta): una fecha vacía en el detalle no debería imprimir "undefined"', async () => {
    const detalle = [{ fecha: '', secciones: [{ nombre_seccion: 'A', registros: [] }] }];
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, reporte({ detalle, soloIncidencias: true })));
    expect(todo).not.toContain('undefined');
  });
});
