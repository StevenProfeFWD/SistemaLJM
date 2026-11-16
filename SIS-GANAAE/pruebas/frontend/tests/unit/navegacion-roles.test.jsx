/**
 * Pruebas unitarias de navegación por rol: rutasPorRol, menú lateral (mainBar),
 * guardia de rutas (Protected_Routes + configuración real de Routing.jsx) y opción
 * de rol "epi" en RegistroPersonas.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import { rutaInicioPorRol } from '@/lib/rutasPorRol';
import MainBar from '@/components/side-bar/mainBar';
import ProtectedRoute from '@/routes/Protected_Routes';
import Routing from '@/routes/Routing';
import RegistroPersonas from '@/components/register-data/RegistroPersonas';
import { AuthProvider } from '@/context/AuthContext';
import { DialogProvider } from '@/context/DialogContext';
import { renderConProveedores, simularSesion } from '../helpers/render';
import { reporte } from '../helpers/fixtures';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

beforeEach(() => {
  epi.getReporteAsistenciaEpi.mockReset().mockResolvedValue(reporte());
  epi.getEstudiantesSeccionEpi.mockReset().mockResolvedValue({ estudiantes: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('rutaInicioPorRol (src/lib/rutasPorRol.js)', () => {
  test.each([
    ['epi', '/epi/reportes'],
    ['orientador', '/panel-orientador'],
    ['super_administrador', '/panel-super-admin'],
    ['administrador', '/inicio'],
    ['profesor', '/inicio'],
    ['padre_de_familia', '/inicio'],
    [undefined, '/inicio'],
    ['EPI', '/inicio'],
  ])('rol %s → %s', (rol, ruta) => {
    expect(rutaInicioPorRol(rol)).toBe(ruta);
  });
});

describe('Menú lateral por rol (mainBar.jsx)', () => {
  const enlaces = async () => {
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    return within(nav).queryAllByRole('link');
  };

  test('EPI ve únicamente "Reportes de asistencia" → /epi/reportes', async () => {
    renderConProveedores(<MainBar />, { user: { id: 9, rol: 'epi' } });
    await waitFor(async () => expect(await enlaces()).toHaveLength(1));
    const [link] = await enlaces();
    expect(link).toHaveTextContent('Reportes de asistencia');
    expect(link).toHaveAttribute('href', '/epi/reportes');
  });

  test('Super administrador ve "Reportes de asistencia (EPI)"', async () => {
    renderConProveedores(<MainBar />, { user: { id: 1, rol: 'super_administrador' } });
    await screen.findByRole('link', { name: /Reportes de asistencia \(EPI\)/ });
    expect(screen.getByRole('link', { name: /Reportes de asistencia \(EPI\)/ })).toHaveAttribute('href', '/epi/reportes');
  });

  test.each(['orientador', 'profesor', 'padre_de_familia'])('rol %s NO ve el enlace a /epi/reportes', async (rol) => {
    renderConProveedores(<MainBar />, { user: { id: 2, rol } });
    await waitFor(async () => expect((await enlaces()).length).toBeGreaterThan(0));
    expect((await enlaces()).map((a) => a.getAttribute('href'))).not.toContain('/epi/reportes');
  });

  test('administrador: el menú (SidebarAdmin) incluye acceso a /epi/reportes', async () => {
    renderConProveedores(<MainBar />, { user: { id: 3, rol: 'administrador' } });
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    await waitFor(() => expect(within(nav).queryAllByRole('link').length).toBeGreaterThan(0));
    const hrefs = within(nav).queryAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/epi/reportes');
  });

  test('sin sesión el menú no muestra enlaces', async () => {
    renderConProveedores(<MainBar />, { user: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(await enlaces()).toHaveLength(0);
  });

  test('botón de menú móvil tiene aria-label y aria-controls', async () => {
    renderConProveedores(<MainBar />, { user: { id: 9, rol: 'epi' } });
    const b = screen.getByRole('button', { name: 'Abrir menú de navegación' });
    expect(b).toHaveAttribute('aria-controls', 'main-sidebar-nav');
  });
});

describe('ProtectedRoute aislado', () => {
  const montar = (user, allowedRoles) => {
    simularSesion(user);
    return render(
      <MemoryRouter initialEntries={['/privada']}>
        <AuthProvider>
          <Routes>
            <Route path="/privada" element={<ProtectedRoute allowedRoles={allowedRoles}><p>contenido privado</p></ProtectedRoute>} />
            <Route path="/login" element={<p>pantalla login</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  };

  test('muestra "Verificando sesión…" mientras carga', () => {
    montar({ rol: 'epi' }, ['epi']);
    expect(screen.getByText('Verificando sesión…')).toBeInTheDocument();
  });
  test('rol permitido ve el contenido', async () => {
    montar({ rol: 'epi' }, ['epi']);
    expect(await screen.findByText('contenido privado')).toBeInTheDocument();
  });
  test('rol no permitido es redirigido a /login', async () => {
    montar({ rol: 'profesor' }, ['epi']);
    expect(await screen.findByText('pantalla login')).toBeInTheDocument();
  });
  test('sin sesión es redirigido a /login', async () => {
    montar(null, ['epi']);
    expect(await screen.findByText('pantalla login')).toBeInTheDocument();
  });
});

describe('Configuración real de Routing.jsx para /epi/reportes', () => {
  const visitar = (ruta, user) => {
    window.history.pushState({}, '', ruta);
    simularSesion(user);
    return render(<AuthProvider><DialogProvider><Routing /></DialogProvider></AuthProvider>);
  };

  test.each(['epi', 'administrador', 'super_administrador'])('rol %s accede a /epi/reportes', async (rol) => {
    visitar('/epi/reportes', { id: 1, rol });
    expect(await screen.findByRole('heading', { level: 1, name: 'Reportes de asistencia' }, { timeout: 8000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/epi/reportes');
  });

  test.each(['profesor', 'orientador', 'padre_de_familia'])('rol %s es redirigido a /login', async (rol) => {
    visitar('/epi/reportes', { id: 1, rol });
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 8000 });
    expect(epi.getReporteAsistenciaEpi).not.toHaveBeenCalled();
  });

  test('sin sesión es redirigido a /login', async () => {
    visitar('/epi/reportes', null);
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 8000 });
  });

  test.each([
    ['/inicio'], ['/estudiantes'], ['/dashboard-reportes'], ['/justificaciones'], ['/panel-orientador'],
  ])('EPI no puede entrar a %s (redirige a /login)', async (ruta) => {
    visitar(ruta, { id: 1, rol: 'epi' });
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 8000 });
  });

  test('EPI sí tiene permitida /cambiar-contraseña', async () => {
    visitar('/cambiar-contraseña', { id: 1, rol: 'epi' });
    await new Promise((r) => setTimeout(r, 300));
    expect(decodeURIComponent(window.location.pathname)).toBe('/cambiar-contraseña');
  });
});

describe('RegistroPersonas: rol EPI', () => {
  test('el select de rol ofrece "Equipo de Permanencia Estudiantil (EPI)" con value=epi', async () => {
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    const sel = document.getElementById('rol');
    const opt = within(sel).getByRole('option', { name: 'Equipo de Permanencia Estudiantil (EPI)' });
    expect(opt).toHaveValue('epi');
    expect(within(sel).getAllByRole('option').map((o) => o.value)).toEqual(['', 'profesor', 'orientador', 'epi', 'padre_de_familia']);
  });

  test('[OBSERVACIÓN] el texto de ayuda del formulario no menciona al personal EPI', async () => {
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    const ayuda = screen.getByText(/Registre docentes, orientadores y tutores legales/);
    expect(ayuda.textContent).not.toMatch(/EPI|Permanencia/);
  });

  test('[CORREGIDO D-03] el select de rol tiene etiqueta asociada (WCAG 1.3.1 / 4.1.2)', () => {
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    const sel = document.getElementById('rol');
    expect(sel.labels?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('RegistroPersonas: alcance de etiquetas sin asociar', () => {
  test('[CORREGIDO D-03 alcance] ningún <label> del formulario debería quedar sin control asociado', () => {
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    const labels = [...document.querySelectorAll('label')];
    const sinAsociar = labels.filter((l) => !l.control).map((l) => l.textContent.trim());
    // Registro informativo para el informe
    console.info('[QA] etiquetas sin asociar en RegistroPersonas:', JSON.stringify(sinAsociar), 'de', labels.length);
    expect(sinAsociar).toEqual([]);
  });
});

describe('RegistroPersonas: axe-core', () => {
  test('[CORREGIDO D-03 axe] formulario de registro sin violaciones serias/críticas', async () => {
    const axe = (await import('axe-core')).default;
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    const r = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    const serias = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}(${v.impact}) x${v.nodes.length}`);
    console.info('[QA] axe RegistroPersonas:', JSON.stringify(r.violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}`)));
    expect(serias).toEqual([]);
  });
});

describe('Indicación de página actual en el menú (ciclo 15)', () => {
  test('administrador en /epi/reportes: el enlace EPI se resalta (bg-accent) pero sin aria-current', async () => {
    renderConProveedores(<MainBar />, { user: { id: 3, rol: 'administrador' }, ruta: '/epi/reportes' });
    const link = await screen.findByRole('link', { name: /Reportes de asistencia \(EPI\)/ });
    expect(link.className).toMatch(/(^|\s)bg-accent(\s|$)/);
    expect(link).not.toHaveAttribute('aria-current');
  });

  test('[OBSERVACIÓN] EPI en /epi/reportes: su único enlace no se resalta ni tiene aria-current (inconsistente con SidebarAdmin)', async () => {
    renderConProveedores(<MainBar />, { user: { id: 9, rol: 'epi' }, ruta: '/epi/reportes' });
    const link = await screen.findByRole('link', { name: /Reportes de asistencia/ });
    expect(link.className).not.toMatch(/(^|\s)bg-accent(\s|$)/);
    expect(link).not.toHaveAttribute('aria-current');
  });
});
