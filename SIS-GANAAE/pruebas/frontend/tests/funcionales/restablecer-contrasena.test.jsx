/**
 * Restablecer contraseña desde el frontend:
 * - Administrador: pantalla /restablecer-contrasenas (profesores, orientadores, EPI y encargados).
 * - Super administrador: botón en Gestión de administradores (solo filas de administradores).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { DialogProvider } from '@/context/DialogContext';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeEach } from 'vitest';
import apiClient from '@/config/api';
import RestablecerContrasenas from '@/pages/admin/RestablecerContrasenas';
import GestionAdministradores from '@/pages/superadmin/GestionAdministradores';

const ADMIN = { id: 2, rol: 'administrador', nombre_completo: 'Admin' };
const SUPER = { id: 3, rol: 'super_administrador', nombre_completo: 'Super' };

const USUARIOS = [
  { id_persona: 20, nombre_completo: 'Ana Profesora', cedula: '1-1111-1111', correo: 'ana@x.cr', nombre_rol: 'profesor', rol_label: 'Profesor', activo: true, cuenta_activa: true, primer_login: false },
  { id_persona: 21, nombre_completo: 'Luis Encargado', cedula: '2-2222-2222', correo: 'luis@x.cr', nombre_rol: 'padre_de_familia', rol_label: 'Encargado', activo: true, cuenta_activa: true, primer_login: true },
];

const ADMINS = [
  { id_persona: 3, nombre_completo: 'Super Usuario', cedula: '3', correo: 's@x.cr', nombre_rol: 'super_administrador', activo: true, cuenta_activa: true },
  { id_persona: 30, nombre_completo: 'Carla Admin', cedula: '4', correo: 'c@x.cr', nombre_rol: 'administrador', activo: true, cuenta_activa: true },
];

function simularApi(user, { lista = USUARIOS, admins = ADMINS, errorPost = null } = {}) {
  apiClient.get.mockImplementation((url, cfg) => {
    if (url === '/personas/sesion') return Promise.resolve({ data: user });
    if (url === '/usuarios/restablecer-contrasena') {
      const q = cfg?.params?.q?.toLowerCase() || '';
      return Promise.resolve({ data: { usuarios: lista.filter((u) => u.nombre_completo.toLowerCase().includes(q)) } });
    }
    if (url === '/superadmin/administradores') return Promise.resolve({ data: { administradores: admins } });
    return Promise.reject(new Error(`Llamada HTTP no simulada: ${url}`));
  });
  apiClient.post.mockImplementation((url) => {
    if (errorPost) return Promise.reject(errorPost);
    const id = Number(url.split('/')[2]);
    return Promise.resolve({ data: { message: 'ok', id_persona: id } });
  });
}

/** Render con proveedores reales; la API simulada se configura ANTES de montar (la pantalla carga al montarse). */
function montar(ui, user, opts) {
  simularApi(user, opts);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <DialogProvider>{ui}</DialogProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

const llamadasRestablecer = () =>
  apiClient.post.mock.calls.filter(([url]) => /\/restablecer-contrasena$/.test(url));

describe('Administrador: pantalla Restablecer contraseñas', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
  });

  async function renderPantalla(opts) {
    montar(<RestablecerContrasenas />, ADMIN, opts);
    return screen.findByRole('heading', { name: 'Restablecer contraseñas' });
  }

  test('lista los usuarios con rol y estado de la cuenta, e informa la contraseña temporal', async () => {
    montar(<RestablecerContrasenas />, ADMIN);
    expect(await screen.findByText('Ana Profesora')).toBeInTheDocument();
    expect(screen.getByText('Luis Encargado')).toBeInTheDocument();
    expect(screen.getByText('Encargado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de cambio')).toBeInTheDocument();
    expect(screen.getByText(/«liceomarti»/)).toBeInTheDocument();
  });

  test('confirmar → POST al usuario correcto y aviso con la contraseña temporal', async () => {
    const user = userEvent.setup();
    await renderPantalla();
    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Ana Profesora' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(/Ana Profesora/)).toBeInTheDocument();
    expect(within(dlg).getByText(/liceomarti/)).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Restablecer' }));
    await waitFor(() => expect(llamadasRestablecer()).toEqual([['/usuarios/20/restablecer-contrasena']]));
    const aviso = await screen.findByRole('alertdialog', { name: 'Contraseña restablecida' });
    expect(within(aviso).getByText(/liceomarti/)).toBeInTheDocument();
  });

  test('cancelar no llama al servidor', async () => {
    const user = userEvent.setup();
    await renderPantalla();
    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Luis Encargado' }));
    const dlg = await screen.findByRole('alertdialog');
    await user.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(llamadasRestablecer()).toHaveLength(0);
  });

  test('error del servidor → se muestra su mensaje', async () => {
    const user = userEvent.setup();
    await renderPantalla({
      errorPost: { response: { status: 403, data: { message: 'No tiene permiso para restablecer la contraseña de este usuario' } } },
    });
    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Ana Profesora' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restablecer' }));
    expect(await screen.findByText('No tiene permiso para restablecer la contraseña de este usuario')).toBeInTheDocument();
  });

  test('buscar envía el texto al servidor', async () => {
    const user = userEvent.setup();
    await renderPantalla();
    await screen.findByText('Ana Profesora');
    await user.type(screen.getByLabelText('Nombre, cédula o correo'), 'luis');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(screen.queryByText('Ana Profesora')).toBeNull());
    expect(screen.getByText('Luis Encargado')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/usuarios/restablecer-contrasena', { params: { q: 'luis' } });
  });
});

describe('Super administrador: botón en Gestión de administradores', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
  });

  test('solo las filas de administradores tienen el botón (el super administrador está protegido)', async () => {
    montar(<GestionAdministradores />, SUPER);
    expect(await screen.findByRole('button', { name: 'Restablecer contraseña de Carla Admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restablecer contraseña de Super Usuario' })).toBeNull();
  });

  test('restablecer a un administrador llama al endpoint con su id', async () => {
    const user = userEvent.setup();
    montar(<GestionAdministradores />, SUPER);
    await user.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Carla Admin' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restablecer' }));
    await waitFor(() => expect(llamadasRestablecer()).toEqual([['/usuarios/30/restablecer-contrasena']]));
  });
});
