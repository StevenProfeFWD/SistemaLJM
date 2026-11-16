import { vi } from 'vitest';
const s = {
  getReporteAsistenciaEpi: vi.fn(),
  getEstudiantesSeccionEpi: vi.fn(),
  descargarReporteAsistenciaEpiPdf: vi.fn(),
  guardarBlob: vi.fn(),
};
export default s;
export const { getReporteAsistenciaEpi, getEstudiantesSeccionEpi, descargarReporteAsistenciaEpiPdf, guardarBlob } = s;
