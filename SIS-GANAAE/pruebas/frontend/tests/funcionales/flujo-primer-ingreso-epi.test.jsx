/**
 * Flujo funcional: primer ingreso de un usuario EPI (primer_login=true) →
 * cambio de contraseña obligatorio → aterriza en /epi/reportes (rutaInicioPorRol).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));
vi.mock('@/services/personaServices', () => ({ default: { postUsuarios: vi.fn(), updateUsuarios: vi.fn() } }));

import personaServicio from '@/services/personaServices';
import apiClient from '@/config/api';
import Routing from '@/routes/Routing';
import { AuthProvider } from '@/context/AuthContext';
import { DialogProvider } from '@/context/DialogContext';
import { configurarServiciosPorDefecto } from '../helpers/pagina';

let sesion = null;
beforeEach(() => {
  configurarServiciosPorDefecto();
  sesion = null;
  apiClient.get.mockImplementation((url) => (url === '/personas/sesion'
    ? (sesion ? Promise.resolve({ data: sesion }) : Promise.reject({ response: { status: 401 } }))
    : Promise.reject(new Error(`no simulado ${url}`))));
  apiClient.post.mockResolvedValue({ data: {} });
});

test('primer ingreso EPI: login → cambiar contraseña → /epi/reportes', async () => {
  const user = userEvent.setup();
  personaServicio.postUsuarios.mockResolvedValue({ usuario: { id: 88, primer_login: true, nombre_completo: 'EPI Nuevo', rol: 'epi' } });
  personaServicio.updateUsuarios.mockImplementation(async () => { sesion = { id: 88, rol: 'epi' }; return { respuesta: true }; });
  window.history.pushState({}, '', '/login');
  render(<AuthProvider><DialogProvider><Routing /></DialogProvider></AuthProvider>);

  await user.type(await screen.findByLabelText(/correo/i), 'nuevo.epi@example.test');
  await user.type(document.querySelector('input[type="password"]'), 'temporal-123');
  await user.click(screen.getByRole('button', { name: /iniciar sesi[oó]n/i }));

  await waitFor(() => expect(decodeURIComponent(window.location.pathname)).toBe('/cambiar-contraseña'), { timeout: 5000 });
  await user.type(await screen.findByLabelText('Nueva contraseña', {}, { timeout: 5000 }), 'NuevaClave2026');
  await user.type(screen.getByLabelText('Confirmar contraseña'), 'NuevaClave2026');
  await user.click(screen.getByRole('button', { name: /^(guardar|cambiar|actualizar)/i }));

  await waitFor(() => expect(window.location.pathname).toBe('/epi/reportes'), { timeout: 5000 });
  expect(personaServicio.updateUsuarios).toHaveBeenCalledWith({ contrasena_hash: 'NuevaClave2026' }, 88);
  expect(await screen.findByRole('heading', { level: 1, name: 'Reportes de asistencia' }, { timeout: 8000 })).toBeInTheDocument();
}, 25000);
