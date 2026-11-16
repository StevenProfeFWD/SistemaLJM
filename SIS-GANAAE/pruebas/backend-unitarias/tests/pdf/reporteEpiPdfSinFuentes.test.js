/**
 * Caja blanca de pdfService: rama sin fuentes Roboto (Helvetica + txt() sin tildes)
 * y rama de carga remota de logos (cargarLogo → axios). Se simula fs.existsSync = false.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import realFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('fs', async (importOriginal) => {
  const o = await importOriginal();
  const existsSync = vi.fn(() => false);
  return { ...o, existsSync, default: { ...o, existsSync } };
});

const { pipeReporteAsistenciaEpiPdf } = await import('../../../../backend-node/src/services/pdfService.js');
const { generarPdf, extraerTexto } = await import('../helpers/pdf.js');
const { peticiones, setManejador } = await import('../helpers/stubs/axios.js');

const aqui = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.resolve(aqui, '../../../../frontend-reactjs/public/images');

const tot = { total: 4, presentes: 3, tardias: 0, ausencias_justificadas: 0, ausencias_injustificadas: 1, otros: 0, porcentaje_asistencia: 75 };
const reporte = {
  filtros: { periodo_label: 'Anual', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', nombre_seccion: 'Niñez Única', nombre_materia: 'Educación Cívica', nombre_estudiante: 'ÁÉÍÓÚ áéíóú Ññ', cedula_estudiante: null },
  resumen_general: tot,
  secciones: [{ nombre_seccion: 'Niñez Única', totales: tot, materias: [{ nombre_materia: 'Educación Cívica', totales: tot }] }],
};

beforeEach(() => {
  peticiones.length = 0;
  setManejador(null);
});
afterEach(() => setManejador(null));

describe('pdfService sin fuentes TTF (fallback Helvetica)', () => {
  it('genera PDF válido y quita tildes/ñ con txt()', async () => {
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const { todo, paginas } = await extraerTexto(buf);
    expect(paginas).toBe(1);
    expect(todo).toContain('Benemerito Liceo Jose Marti');
    expect(todo).toContain('Ninez Unica');
    expect(todo).toContain('Educacion Civica');
    expect(todo).toContain('AEIOU aeiou Nn');
    expect(todo).toContain('Pagina 1 de 1');
    expect(todo).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/);
  });

  it('sin logos locales intenta 2 URLs remotas por logo y continúa si fallan', async () => {
    await generarPdf(pipeReporteAsistenciaEpiPdf, reporte);
    expect(peticiones).toEqual([
      'http://react-frontend:5173/images/logo-mep.png',
      'http://localhost:5173/images/logo-mep.png',
      'http://react-frontend:5173/images/logo-liceo.jpg',
      'http://localhost:5173/images/logo-liceo.jpg',
    ]);
  });

  it('usa el logo remoto cuando la primera URL responde (no intenta la segunda)', async () => {
    setManejador((url) => {
      const archivo = url.endsWith('.png') ? 'logo-mep.png' : 'logo-liceo.jpg';
      return Promise.resolve({ data: realFs.readFileSync(path.join(IMG, archivo)) });
    });
    const buf = await generarPdf(pipeReporteAsistenciaEpiPdf, reporte);
    expect(peticiones).toHaveLength(2);
    expect(buf.includes(Buffer.from('/Subtype /Image'))).toBe(true);
  });

  it('OBSERVACIÓN O-02: txt() no normaliza ü/Ü ni otros diacríticos con Helvetica', async () => {
    const r = { ...reporte, filtros: { ...reporte.filtros, nombre_estudiante: 'Güell Müller' } };
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, r));
    // WinAnsi sí contiene ü, por lo que se imprime correctamente; documenta que la tabla de reemplazo es parcial.
    expect(todo).toContain('Güell Müller');
  });
});

describe('pdfService sin fuentes TTF — detalle diario EPI', () => {
  it('detalle con tildes en Helvetica: "Miercoles", "Tardia", "Sección"→"Seccion"', async () => {
    const r = {
      ...reporte,
      detalle_diario: [{ fecha: '2026-11-11', secciones: [{ nombre_seccion: 'Niñez', registros: [{ nombre_completo: 'José Ñandú', cedula: '1', estado: 'tardanza', condicion: 'Tardía', materias: ['Educación Física'] }] }] }],
      detalle_solo_incidencias: true,
    };
    const { todo, paginas } = await extraerTexto(await generarPdf(pipeReporteAsistenciaEpiPdf, r));
    expect(paginas).toBe(2);
    expect(todo).toContain('Miercoles 11 de noviembre de 2026');
    expect(todo).toContain('Seccion Ninez');
    expect(todo).toContain('Jose Nandu');
    expect(todo).toContain('Tardia');
    expect(todo).toContain('Educacion Fisica');
  });
});
