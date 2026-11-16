import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import apiClient from '@/config/api';
import { AuthProvider } from '@/context/AuthContext';
import { DialogProvider } from '@/context/DialogContext';

/** Configura la sesión simulada que devuelve GET /personas/sesion. */
export function simularSesion(user) {
  apiClient.get.mockImplementation((url) => {
    if (url === '/personas/sesion') {
      return user ? Promise.resolve({ data: user }) : Promise.reject({ response: { status: 401 } });
    }
    return Promise.reject(new Error(`Llamada HTTP no simulada: ${url}`));
  });
  apiClient.post.mockImplementation(() => Promise.resolve({ data: {} }));
}

export function UbicacionActual() {
  const loc = useLocation();
  return <div hidden data-testid="ubicacion">{loc.pathname}</div>;
}

export function renderConProveedores(ui, { user = { id: 1, rol: 'epi', nombre: 'Usuario EPI' }, ruta = '/epi/reportes' } = {}) {
  simularSesion(user);
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <AuthProvider>
        <DialogProvider>
          <Routes>
            <Route path="*" element={<>{ui}<UbicacionActual /></>} />
          </Routes>
        </DialogProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}
