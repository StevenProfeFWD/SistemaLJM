/**
 * Pruebas de humo + caja blanca de los demás generadores PDF de pdfService
 * (no son del rol EPI, pero comparten helpers: cargarLogo, txt, formatFechaCr).
 */
import { describe, it, expect } from 'vitest';
import {
  pipeComprobanteMatriculaPdf,
  pipeReporteAsistenciaHijoPdf,
  pipeComprobanteOrientacionPdf,
  pipeReporteOrientacionFiltradoPdf,
  pipeReporteSustitucionesPdf,
} from '../../../../backend-node/src/services/pdfService.js';
import { generarPdf, extraerTexto, crearSumidero } from '../helpers/pdf.js';

const valido = (buf) => expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

describe('pipeComprobanteMatriculaPdf', () => {
  const matricula = {
    nombre_completo: 'Mora Solís Ana',
    cedula: '1-1234-5678',
    anio_curso_lectivo: 2026,
    ano_a_cursar: 'septimo',
    nombre_seccion: '7-1',
    fecha_matricula: '2026-02-01T12:00:00',
    estado: 'activa',
  };

  it('con tutor legal', async () => {
    const buf = await generarPdf(pipeComprobanteMatriculaPdf, {
      matricula,
      tutor: { nombre_completo: 'Pedro Mora', cedula: '1-1', telefono: '8888-8888', patria_potestad: true },
    });
    valido(buf);
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Mora Solís Ana');
    expect(todo).toContain('Tutor legal');
    expect(todo).toContain('8888-8888');
  });

  it('encargado sin patria potestad y matrícula con campos vacíos', async () => {
    const buf = await generarPdf(pipeComprobanteMatriculaPdf, {
      matricula: { nombre_completo: 'X' },
      tutor: { nombre_completo: 'Y', patria_potestad: false },
    });
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Encargado');
    expect(todo).toContain('Sin sección');
  });

  it('sin tutor → guiones', async () => {
    const buf = await generarPdf(pipeComprobanteMatriculaPdf, { matricula, tutor: null });
    valido(buf);
    const { todo } = await extraerTexto(buf);
    expect(todo).toMatch(/Parentesco:\s*-/);
  });
});

describe('pipeReporteAsistenciaHijoPdf', () => {
  const base = {
    estudiante: { nombre_completo: 'Ana', cedula: '1', nombre_seccion: '7-1', ano_a_cursar: 'septimo', anio_curso_lectivo: 2026 },
    rango: { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' },
    tutor_nombre: 'Pedro',
    resumen: {
      total_registros: 3,
      presentes: 1,
      tardias: 1,
      ausencias_totales: 1,
      ausencias_justificadas: 0,
      ausencias_injustificadas: 1,
      permisos_especiales: 0,
      suspendidos: 0,
      expulsados: 0,
      nivel_asistencia_pct: 33,
    },
  };

  it('sin registros', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaHijoPdf, { ...base, registros: [] });
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBe(1);
    expect(todo).toContain('No hay registros de asistencia en el periodo seleccionado.');
    expect(todo).toContain('Nivel general de asistencia: 33%');
    expect(todo).not.toContain('Permisos especiales');
  });

  it('muchos registros → varias páginas con "(cont.)" y estados especiales visibles', async () => {
    const registros = Array.from({ length: 60 }, (_, i) => ({
      fecha: '2026-03-02',
      nombre_materia: `Materia ${i}`,
      horario_leccion: 'L1 (07:00-07:40)',
      condicion: i % 2 ? 'Presente' : undefined,
      estado: 'ausente',
    }));
    const buf = await generarPdf(pipeReporteAsistenciaHijoPdf, {
      ...base,
      registros,
      tutor_nombre: null,
      resumen: { ...base.resumen, permisos_especiales: 1, suspendidos: 2, expulsados: 1 },
    });
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThanOrEqual(3);
    expect(todo).toContain('Detalle diario de asistencia (cont.)');
    expect(todo).toContain('Permisos especiales:');
    expect(todo).toContain('Suspendidos:');
    expect(todo).toContain('Expulsados:');
    expect(todo).toContain('Encargado');
    expect(todo).toContain('Materia 59');
  });

  it('registro sin fecha, materia, condición ni estado no rompe la generación', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaHijoPdf, {
      ...base,
      registros: [{ fecha: null, nombre_materia: null, horario_leccion: null }],
    });
    valido(buf);
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('—');
  });
});

describe('pipeComprobanteOrientacionPdf', () => {
  const reg = {
    id_estado_periodo: 15,
    nombre_completo: 'Luis',
    cedula: '2-2',
    nombre_seccion: '8-1',
    ano_a_cursar: 'octavo',
    tipo_estado: 'suspension',
    tipo_estado_label: 'Suspensión',
    fecha_inicio: '2026-04-01',
    fecha_fin: '2026-04-03',
    motivo: 'Motivo de prueba',
  };

  it('con fecha fin y motivo', async () => {
    const buf = await generarPdf(pipeComprobanteOrientacionPdf, reg);
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('15');
    expect(todo).toContain('01/04/2026');
    expect(todo).toContain('Motivo de prueba');
  });

  it('expulsión sin fecha fin, sin motivo, sin año a cursar, sin etiqueta', async () => {
    const buf = await generarPdf(pipeComprobanteOrientacionPdf, {
      ...reg,
      fecha_fin: null,
      motivo: null,
      ano_a_cursar: null,
      tipo_estado_label: null,
      tipo_estado: 'expulsion',
    });
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Indefinido / Expulsion definitiva');
    expect(todo).toContain('Sin motivo registrado.');
    expect(todo).toContain('expulsion');
  });
});

describe('pipeReporteOrientacionFiltradoPdf', () => {
  it('sin filtros ni registros', async () => {
    const buf = await generarPdf(pipeReporteOrientacionFiltradoPdf, { filtros: {}, registros: [] });
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Sin filtros adicionales (todos los registros)');
    expect(todo).toContain('No hay registros para los filtros aplicados.');
  });

  it('con filtros y 100 registros → paginación horizontal; motivo truncado a 120 caracteres', async () => {
    const registros = Array.from({ length: 100 }, (_, i) => ({
      cedula: `c${i}`,
      nombre_completo: `Est ${i}`,
      nombre_seccion: null,
      tipo_estado: 'permiso_institucional',
      fecha_inicio: '2026-01-01',
      fecha_fin: i % 2 ? '2026-01-05' : null,
      motivo: i === 0 ? 'M'.repeat(300) : null,
    }));
    const buf = await generarPdf(pipeReporteOrientacionFiltradoPdf, {
      filtros: { tipo_estado: 'permiso_institucional', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' },
      registros,
    });
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThan(1);
    expect(todo).toContain('Tipo: permiso_institucional | Desde: 01/01/2026 | Hasta: 31/12/2026');
    expect(todo).toContain('Total de registros: 100');
    expect(todo).not.toContain('M'.repeat(121));
  });
});

describe('pipeReporteSustitucionesPdf', () => {
  const s = (i, extra = {}) => ({
    nombre_titular: `Titular ${i}`,
    nombre_sustituto: `Sustituto ${i}`,
    fecha_desde: '2026-05-01',
    fecha_hasta: '2026-05-10',
    estado: ['vigente', 'finalizada', 'programada', 'otro'][i % 4],
    asignaciones: [{ nombre_materia: 'Física', nombre_seccion: '10-1' }],
    ...extra,
  });

  it('vacío con filtro de persona', async () => {
    const buf = await generarPdf(pipeReporteSustitucionesPdf, { anioLectivo: 2026, sustituciones: [], filtroPersona: 'Ana Núñez' });
    const { todo } = await extraerTexto(buf);
    expect(todo).toContain('Año lectivo: 2026');
    expect(todo).toContain('Filtro: Ana Núñez');
    expect(todo).toContain('No hay sustituciones registradas para el criterio indicado.');
  });

  it('50 sustituciones → varias páginas; etiquetas de estado; estado desconocido sin traducir', async () => {
    const lista = Array.from({ length: 50 }, (_, i) => s(i, i === 1 ? { asignaciones: [], nombre_titular: null } : {}));
    const buf = await generarPdf(pipeReporteSustitucionesPdf, { anioLectivo: 2026, sustituciones: lista });
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBeGreaterThan(1);
    expect(todo).toContain('Vigente');
    expect(todo).toContain('Finalizada');
    expect(todo).toContain('Programada');
    expect(todo).toContain('otro');
    expect(todo).toContain('Física (10-1)');
    expect(todo).not.toContain('Filtro:');
  });

  it('CORREGIDO D-11: asignaciones null/undefined ya no provocan TypeError con el stream abierto', async () => {
    for (const asignaciones of [undefined, null]) {
      const buf = await generarPdf(pipeReporteSustitucionesPdf, { anioLectivo: 2026, sustituciones: [s(0, { asignaciones })] });
      expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });
});

describe('expectativas correctas (antes it.fails; defectos corregidos)', () => {
  it('CORREGIDO D-11 (expectativa correcta): asignaciones ausentes deberían imprimirse como "—" sin lanzar', async () => {
    const buf = await generarPdf(pipeReporteSustitucionesPdf, {
      anioLectivo: 2026,
      sustituciones: [{ nombre_titular: 'T', nombre_sustituto: 'S', fecha_desde: '2026-01-01', fecha_hasta: '2026-01-02', estado: 'vigente' }],
    });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
