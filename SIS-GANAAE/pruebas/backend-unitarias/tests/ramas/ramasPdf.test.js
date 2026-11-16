/** Ciclo 9: ramas restantes de pdfService (valores por defecto '—' / '-' y color de condición desconocida). */
import { describe, it, expect } from 'vitest';
import {
  pipeReporteAsistenciaEpiPdf,
  pipeComprobanteOrientacionPdf,
  pipeReporteOrientacionFiltradoPdf,
  pipeReporteSustitucionesPdf,
} from '../../../../backend-node/src/services/pdfService.js';
import { generarPdf, extraerTexto } from '../helpers/pdf.js';

describe('pdfService — ramas de valores por defecto', () => {
  it('EPI: condición desconocida (permiso_especial) en el detalle usa color por defecto y se imprime', async () => {
    const reporte = {
      filtros: { periodo_label: 'Semanal', fecha_inicio: '2026-11-09', fecha_fin: '2026-11-15' },
      resumen_general: { total: 1, presentes: 0, tardias: 0, ausencias_justificadas: 0, ausencias_injustificadas: 0, porcentaje_asistencia: 0 },
      secciones: [],
      detalle_diario: [{ fecha: '2026-11-10', secciones: [{ nombre_seccion: 'A', registros: [{ nombre_completo: 'X', cedula: '1', estado: 'permiso_especial', condicion: 'Permiso especial', materias: ['M'] }] }] }],
      detalle_solo_incidencias: false,
    };
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, reporte));
    expect(todo).toContain('Permiso especial');
    // el resumen de la sección no cuenta estados fuera de los 4 conocidos → queda vacío
    expect(todo).toMatch(/Sección A\s+Estudiante/);
  });

  it('comprobante de orientación con campos vacíos → "-"', async () => {
    const { todo } = await extraerTexto(await generarPdf(pipeComprobanteOrientacionPdf, { id_estado_periodo: 1, tipo_estado: 'suspension', fecha_inicio: '2026-01-01' }));
    expect(todo).toMatch(/Nombre completo:\s*-/);
  });

  it('orientación filtrada: fila sin cédula ni nombre → "—"', async () => {
    const { todo } = await extraerTexto(await generarPdf(pipeReporteOrientacionFiltradoPdf, { filtros: {}, registros: [{ tipo_estado: 'suspension', fecha_inicio: '2026-01-01' }] }));
    expect(todo).toContain('—');
  });

  it('sustituciones: sin nombre de sustituto → "—"', async () => {
    const { todo } = await extraerTexto(
      await generarPdf(pipeReporteSustitucionesPdf, { anioLectivo: 2026, sustituciones: [{ nombre_titular: 'T', fecha_desde: '2026-01-01', fecha_hasta: '2026-01-02', estado: 'vigente', asignaciones: [] }] })
    );
    expect(todo).toContain('—');
  });
});
