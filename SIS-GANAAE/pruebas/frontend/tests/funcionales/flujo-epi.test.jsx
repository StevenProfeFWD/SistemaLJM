/**
 * Pruebas funcionales (flujos de usuario de punta a punta en jsdom con user-event).
 * Se usa la configuración real de rutas (Routing.jsx) y de proveedores; todas las
 * llamadas HTTP están simuladas.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));
vi.mock('@/services/personaServices', () => ({
  default: { postUsuarios: vi.fn() },
}));

import epi from '@/services/epiServices';
import personaServicio from '@/services/personaServices';
import apiClient from '@/config/api';
import Routing from '@/routes/Routing';
import { AuthProvider } from '@/context/AuthContext';
import { DialogProvider } from '@/context/DialogContext';
import { reporte, seccion, totales, CATALOGOS, ESTUDIANTES_7_1 } from '../helpers/fixtures';
import { fijarFecha } from '../helpers/pagina';

const USUARIO_EPI = { id: 77, rol: 'epi', nombre_completo: 'Usuaria EPI de Prueba' };

/** Backend simulado con estado: la respuesta depende de los parámetros recibidos. */
function backendSimulado() {
  epi.getReporteAsistenciaEpi.mockReset().mockImplementation((p) => {
    const filtros = {
      periodo: p.periodo,
      periodo_label: { semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual', personalizado: 'Personalizado' }[p.periodo],
      fecha_inicio: p.periodo === 'personalizado' ? p.fecha_inicio : p.fecha_referencia,
      fecha_fin: p.periodo === 'personalizado' ? p.fecha_fin : (p.periodo === 'mensual' ? `${p.fecha_referencia.slice(0, 7)}-30` : p.fecha_referencia),
      nombre_seccion: p.id_seccion ? CATALOGOS.secciones.find((s) => String(s.id_seccion) === p.id_seccion)?.nombre_seccion : null,
      nombre_materia: null,
      nombre_estudiante: p.id_estudiante ? ESTUDIANTES_7_1.estudiantes.find((e) => String(e.id_estudiante) === p.id_estudiante)?.nombre_completo : null,
    };
    const secciones = p.id_seccion
      ? [seccion(Number(p.id_seccion), filtros.nombre_seccion, [['Matemáticas', 10]], p.id_estudiante ? totales(18, 1, 0, 1) : totales(95, 0, 3, 2))]
      : [seccion(1, '7-1'), seccion(2, '8-2', [['Ciencias', 12]], totales(70, 5, 5, 20))];
    return Promise.resolve(reporte({ filtros, secciones, resumen_general: secciones[0].totales }));
  });
  epi.getEstudiantesSeccionEpi.mockReset().mockResolvedValue(ESTUDIANTES_7_1);
  epi.descargarReporteAsistenciaEpiPdf.mockReset().mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  epi.guardarBlob.mockReset();
}

let sesionActiva = null;
function montarApp(ruta) {
  apiClient.get.mockImplementation((url) => (url === '/personas/sesion'
    ? (sesionActiva ? Promise.resolve({ data: sesionActiva }) : Promise.reject({ response: { status: 401 } }))
    : Promise.reject(new Error(`no simulado ${url}`))));
  apiClient.post.mockResolvedValue({ data: {} });
  window.history.pushState({}, '', ruta);
  return render(<AuthProvider><DialogProvider><Routing /></DialogProvider></AuthProvider>);
}

beforeEach(() => {
  fijarFecha();
  backendSimulado();
  sesionActiva = null;
});
afterEach(() => vi.useRealTimers());

describe('Flujo principal EPI', () => {
  test('EPI genera reporte mensual → filtra sección → elige estudiante → descarga PDF', async () => {
    sesionActiva = USUARIO_EPI;
    const user = userEvent.setup();
    montarApp('/epi/reportes');

    // 1. La página carga el reporte del mes en curso
    await screen.findByRole('button', { name: /Sección 7-1/ }, { timeout: 8000 });
    expect(epi.getReporteAsistenciaEpi).toHaveBeenLastCalledWith({ periodo: 'mensual', fecha_referencia: '2026-11-01' });

    // 2. Elige octubre y genera
    const mes = screen.getByLabelText('Mes');
    await user.clear(mes);
    await user.type(mes, '2026-10');
    expect(screen.getByText(/Cambió los filtros/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Generar reporte/ }));
    await waitFor(() => expect(epi.getReporteAsistenciaEpi).toHaveBeenLastCalledWith({ periodo: 'mensual', fecha_referencia: '2026-10-01' }));
    await screen.findByText(/01\/10\/2026 al 30\/10\/2026/);

    // 3. Filtra por sección 7-1
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await user.click(screen.getByRole('button', { name: /Generar reporte/ }));
    await screen.findByText(/· Sección 7-1/);
    expect(screen.queryByRole('button', { name: /Sección 8-2/ })).toBeNull();

    // 4. Elige estudiante
    const est = screen.getByLabelText('Estudiante');
    await waitFor(() => expect(est).toBeEnabled());
    await screen.findByRole('option', { name: 'Ana Prueba Uno · 100000001' });
    await user.selectOptions(est, '501');
    await user.click(screen.getByRole('button', { name: /Generar reporte/ }));
    await screen.findByText(/Estudiante: Ana Prueba Uno/);
    const esperado = { periodo: 'mensual', fecha_referencia: '2026-10-01', id_seccion: '1', id_estudiante: '501' };
    expect(epi.getReporteAsistenciaEpi).toHaveBeenLastCalledWith(esperado);

    // 5. Expande y revisa detalle por materia
    await user.click(screen.getByRole('button', { name: /Sección 7-1/ }));
    expect(screen.getByText('Matemáticas', { selector: 'td span' })).toBeInTheDocument();

    // 6. Descarga PDF con los mismos parámetros
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.guardarBlob).toHaveBeenCalledTimes(1));
    expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalledWith(esperado);
    expect(epi.guardarBlob.mock.calls[0][1]).toBe('reporte_asistencia_epi_mensual_2026-10-01_2026-10-30.pdf');
  }, 20000);

  test('Login de usuario EPI redirige a /epi/reportes y muestra solo su menú', async () => {
    const user = userEvent.setup();
    personaServicio.postUsuarios.mockImplementation(async () => {
      sesionActiva = USUARIO_EPI;
      return { usuario: { primer_login: false, nombre_completo: USUARIO_EPI.nombre_completo } };
    });
    montarApp('/login');
    await user.type(await screen.findByLabelText(/correo/i), 'epi@example.test');
    const pass = document.querySelector('input[type="password"]');
    await user.type(pass, 'clave-de-prueba');
    await user.click(screen.getByRole('button', { name: /iniciar sesi[oó]n|ingresar/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/epi/reportes'), { timeout: 5000 });
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' }, { timeout: 8000 });
    await waitFor(() => expect(within(nav).getAllByRole('link')).toHaveLength(1));
  }, 20000);

  test('Periodo anual 2025 sin registros → aviso "Sin datos" al intentar PDF cuando no hay registros', async () => {
    sesionActiva = USUARIO_EPI;
    const user = userEvent.setup();
    montarApp('/epi/reportes');
    await screen.findByRole('button', { name: /Sección 7-1/ }, { timeout: 8000 });
    epi.getReporteAsistenciaEpi.mockResolvedValueOnce(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0), filtros: { periodo: 'anual', periodo_label: 'Anual', fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31' } }));
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    await user.selectOptions(screen.getByLabelText('Año'), '2025');
    await user.click(screen.getByRole('button', { name: /Generar reporte/ }));
    await screen.findByText(/No hay registros de asistencia/);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Sin datos');
    expect(epi.descargarReporteAsistenciaEpiPdf).not.toHaveBeenCalled();
  }, 20000);

  test('Rango personalizado inválido: el mensaje del backend se muestra y el PDF queda deshabilitado', async () => {
    sesionActiva = USUARIO_EPI;
    const user = userEvent.setup();
    montarApp('/epi/reportes');
    await screen.findByRole('button', { name: /Sección 7-1/ }, { timeout: 8000 });
    epi.getReporteAsistenciaEpi.mockRejectedValueOnce({ response: { status: 400, data: { error: 'La fecha de inicio no puede ser posterior a la fecha de fin' } } });
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    const desde = screen.getByLabelText('Desde');
    await user.clear(desde);
    await user.type(desde, '2026-12-01');
    await user.click(screen.getByRole('button', { name: /Generar reporte/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('posterior a la fecha de fin');
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
  }, 20000);

  test('Profesor que escribe /epi/reportes en la barra es enviado a /login sin consultar el reporte', async () => {
    sesionActiva = { id: 5, rol: 'profesor' };
    montarApp('/epi/reportes');
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 8000 });
    expect(epi.getReporteAsistenciaEpi).not.toHaveBeenCalled();
  });

  test('Cerrar sesión desde el menú EPI llama a /personas/logout y vuelve a /login', async () => {
    sesionActiva = USUARIO_EPI;
    const user = userEvent.setup();
    montarApp('/epi/reportes');
    await screen.findByRole('button', { name: /Sección 7-1/ }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(apiClient.post).toHaveBeenCalledWith('/personas/logout');
  }, 20000);
});
