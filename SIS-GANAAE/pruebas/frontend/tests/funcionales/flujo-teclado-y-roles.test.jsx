/**
 * Flujos funcionales adicionales: operación completa solo con teclado y acceso de
 * administrador / super administrador desde su menú.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import apiClient from '@/config/api';
import Routing from '@/routes/Routing';
import { AuthProvider } from '@/context/AuthContext';
import { DialogProvider } from '@/context/DialogContext';
import { fijarFecha, configurarServiciosPorDefecto } from '../helpers/pagina';

function montar(ruta, user) {
  apiClient.get.mockImplementation((url) => (url === '/personas/sesion'
    ? Promise.resolve({ data: user })
    : Promise.reject(new Error(`no simulado ${url}`))));
  apiClient.post.mockResolvedValue({ data: {} });
  window.history.pushState({}, '', ruta);
  return render(<AuthProvider><DialogProvider><Routing /></DialogProvider></AuthProvider>);
}

beforeEach(() => {
  fijarFecha();
  configurarServiciosPorDefecto();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('Operación solo con teclado', () => {
  test('cambiar a Anual, elegir 2025, sección 8-2, generar con Enter y expandir con Espacio', async () => {
    const user = userEvent.setup();
    montar('/epi/reportes', { id: 1, rol: 'epi' });
    await screen.findByRole('button', { name: /Sección 7-1/ }, { timeout: 8000 });

    // Tipo de reporte (enfocar y elegir con teclado)
    const tipo = screen.getByLabelText('Tipo de reporte');
    tipo.focus();
    await user.selectOptions(tipo, 'anual'); // user-event emula la elección por teclado/ratón del <select> nativo
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Año'));
    await user.selectOptions(document.activeElement, '2025');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Sección'));
    await user.selectOptions(document.activeElement, '2');
    // Enter sobre un <select> no envía formularios (HTML: envío implícito solo desde campos de texto);
    // se avanza con Tab hasta "Generar reporte" y se pulsa Enter.
    for (let i = 0; i < 4 && !/Generar reporte/.test(document.activeElement.textContent); i++) await user.tab();
    expect(document.activeElement).toHaveTextContent('Generar reporte');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(epi.getReporteAsistenciaEpi).toHaveBeenLastCalledWith({ periodo: 'anual', fecha_referencia: '2025-01-01', id_seccion: '2' }));

    // Ir a la tabla con Tab y expandir con Espacio
    const btnSec = await screen.findByRole('button', { name: /Sección 7-1/ });
    btnSec.focus();
    await user.keyboard(' ');
    expect(btnSec).toHaveAttribute('aria-expanded', 'true');
  }, 20000);

  test('el enlace "Saltar al contenido principal" no está en Routing (vive en App.jsx): la ruta EPI depende de App para tenerlo', async () => {
    montar('/epi/reportes', { id: 1, rol: 'epi' });
    await screen.findByRole('heading', { level: 1 }, { timeout: 8000 });
    expect(document.getElementById('main-content')).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('link', { name: /Saltar al contenido/ })).toBeNull();
  });
});

describe('Acceso desde menús de otros roles', () => {
  test('super administrador navega desde su menú a "Reportes de asistencia (EPI)"', async () => {
    const user = userEvent.setup();
    apiClient.get.mockImplementation((url) => (url === '/personas/sesion'
      ? Promise.resolve({ data: { id: 2, rol: 'super_administrador' } })
      : Promise.resolve({ data: {} })));
    window.history.pushState({}, '', '/notificaciones');
    render(<AuthProvider><DialogProvider><Routing /></DialogProvider></AuthProvider>);
    // C10: tiempo de espera ampliado a 15 s — falló 1 vez en C9 por carga de la máquina (3/3 en aislado).
    const link = await screen.findByRole('link', { name: /Reportes de asistencia \(EPI\)/ }, { timeout: 15000 });
    await user.click(link);
    await waitFor(() => expect(window.location.pathname).toBe('/epi/reportes'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reportes de asistencia' }, { timeout: 15000 })).toBeInTheDocument();
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalled();
  }, 40000);

  test('administrador ve el enlace EPI en SidebarAdmin y la pantalla carga', async () => {
    const user = userEvent.setup();
    montar('/epi/reportes', { id: 3, rol: 'administrador' });
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' }, { timeout: 8000 });
    const link = await within(nav).findByRole('link', { name: /Reportes de asistencia \(EPI\)/ });
    await user.click(link);
    expect(window.location.pathname).toBe('/epi/reportes');
    await screen.findByRole('button', { name: /Sección 7-1/ });
  }, 20000);
});

describe('Rutas no permitidas para EPI con sesión activa', () => {
  test('[OBSERVACIÓN] EPI que abre /inicio termina en el formulario de login aunque su sesión sigue activa (sin aviso de "no autorizado")', async () => {
    montar('/inicio', { id: 1, rol: 'epi' });
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 8000 });
    expect(await screen.findByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
    expect(screen.queryByText(/no autorizado|sin permiso|acceso denegado/i)).toBeNull();
    // La sesión no se cerró: no hubo POST /personas/logout
    expect(apiClient.post).not.toHaveBeenCalledWith('/personas/logout');
  });
});
