/** Ciclo 6: pruebas dirigidas a ramas no cubiertas en ciclos anteriores (caja blanca). */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { pipeReporteAsistenciaHijoPdf } from '../../../../backend-node/src/services/pdfService.js';
import { obtenerReporteAsistenciaEpi } from '../../../../backend-node/src/services/epiReportesService.js';
import { cookieClearOptions } from '../../../../backend-node/src/utils/cookieOptions.js';
import { aplicarFiltroAsignacionesProfesor } from '../../../../backend-node/src/utils/sustitucionHelper.js';
import { validarSeguridadEntorno } from '../../../../backend-node/src/utils/validateEnv.js';
import { setResolver, reset } from '../helpers/dbMock.js';
import { resolverEpi, fila, filaDet } from '../helpers/epiFixtures.js';
import { generarPdf, extraerTexto } from '../helpers/pdf.js';

const ENV = ['NODE_ENV', 'JWT_SECRET', 'COOKIE_ENCRYPTION_KEY', 'FRONTEND_ORIGIN', 'CORS_ORIGIN'];
let backup;
beforeEach(() => {
  reset();
  backup = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  ENV.forEach((k) => delete process.env[k]);
});
afterEach(() => {
  ENV.forEach((k) => (backup[k] === undefined ? delete process.env[k] : (process.env[k] = backup[k])));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('pdfService.pipeReporteAsistenciaHijoPdf — salto de página antes del resumen', () => {
  it.each([8, 10, 12, 14, 16, 18, 20])('%i registros: PDF válido y el resumen siempre aparece', async (n) => {
    const reporte = {
      estudiante: { nombre_completo: 'A' },
      rango: { fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' },
      registros: Array.from({ length: n }, () => ({ fecha: '2026-03-02', nombre_materia: 'M', estado: 'presente' })),
      resumen: { total_registros: n, presentes: n, tardias: 0, ausencias_totales: 0, ausencias_justificadas: 0, ausencias_injustificadas: 0, nivel_asistencia_pct: 100 },
    };
    const { todo } = await extraerTexto(await generarPdf(pipeReporteAsistenciaHijoPdf, reporte));
    expect(todo).toContain('Resumen estadistico del periodo');
  });
});

describe('epiReportesService.compararNombre — combinaciones de nulos', () => {
  it('ordena secciones con nombre null/undefined/"" en ambas posiciones del comparador', async () => {
    setResolver(
      resolverEpi({
        agregadas: [
          fila(1, 'B', 1, 'M', 'presente', '1'),
          fila(2, null, 1, null, 'presente', '1'),
          fila(3, 'A', 1, 'M', 'presente', '1'),
          fila(4, undefined, 1, undefined, 'presente', '1'),
          fila(5, '', 1, 'Z', 'presente', '1'),
          fila(5, '', 2, null, 'presente', '1'),
        ],
        detalle: [
          filaDet('2026-06-01', 1, 'B', 'M', 1, 'Zoe', 'ausente'),
          filaDet('2026-06-01', 2, null, 'M', 2, null, 'ausente'),
          filaDet('2026-06-01', 2, null, 'M', 3, 'Al', 'ausente'),
        ],
      })
    );
    const r = await obtenerReporteAsistenciaEpi({ periodo: 'anual', fecha_referencia: '2026-01-01' }, { incluirDetalle: true });
    expect(r.secciones.slice(-2).map((s) => s.nombre_seccion)).toEqual(['A', 'B']);
    expect(r.detalle_diario[0].secciones.map((s) => s.nombre_seccion)).toEqual([null, 'B']);
  });
});

describe('cookieOptions / sustitucionHelper / validateEnv — ramas restantes', () => {
  it('cookieClearOptions en desarrollo', () => {
    expect(cookieClearOptions()).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
  });

  it('aplicarFiltroAsignacionesProfesor sin fecha usa hoy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 3, 9));
    const vistos = [];
    const sub = new Proxy({}, {
      get: (_t, p) => (...a) => {
        vistos.push([p, ...a]);
        if (typeof a[0] === 'function') a[0].call(sub);
        return sub;
      },
    });
    aplicarFiltroAsignacionesProfesor({ andWhere: (fn) => fn.call(sub) }, 1);
    expect(vistos).toContainEqual(['where', 's.fecha_desde', '<=', '2026-02-03']);
  });

  it('validateEnv: valor por defecto exacto de ≥16 chars se detecta por la comparación literal', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.JWT_SECRET = 'clave-cifrado-cookies-32-chars-minimo';
    process.env.COOKIE_ENCRYPTION_KEY = 'q1w2e3r4t5y6u7i8o9p0';
    validarSeguridadEntorno();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
