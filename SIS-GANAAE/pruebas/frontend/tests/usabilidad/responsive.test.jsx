/**
 * Comportamiento responsive y menú móvil. jsdom no calcula layout: se verifican las
 * clases/atributos responsables; las mediciones reales se hicieron en navegador (INFORME.md).
 */
import { screen, within } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import { fijarFecha, configurarServiciosPorDefecto, renderPagina } from '../helpers/pagina';

beforeEach(() => { fijarFecha(); configurarServiciosPorDefecto(); });
afterEach(() => vi.useRealTimers());

describe('Tabla y filtros en ancho móvil', () => {
  test('la tabla está dentro de un contenedor con overflow-x-auto y tiene ancho mínimo 720px', async () => {
    await renderPagina();
    const tabla = screen.getByRole('table');
    expect(tabla.parentElement).toHaveClass('overflow-x-auto');
    expect(tabla).toHaveClass('min-w-[720px]');
  });

  test('el formulario de filtros usa flex-wrap (los controles bajan de línea)', async () => {
    await renderPagina();
    expect(document.querySelector('form')).toHaveClass('flex', 'flex-wrap');
  });

  test('las tarjetas KPI usan 2 columnas en móvil, 3 en md y 6 en xl', async () => {
    await renderPagina();
    const grid = screen.getByText('% Asistencia general').closest('.grid');
    expect(grid).toHaveClass('grid-cols-2', 'md:grid-cols-3', 'xl:grid-cols-6');
  });

  test('el encabezado (título + botón PDF) puede envolver en pantallas pequeñas', async () => {
    await renderPagina();
    const cab = screen.getByRole('heading', { level: 1 }).closest('div').parentElement;
    expect(cab).toHaveClass('flex-wrap');
  });

  test('el contenido principal deja espacio superior para el botón de menú fijo en móvil (pt-16)', async () => {
    await renderPagina();
    expect(document.getElementById('main-content')).toHaveClass('pt-16', 'lg:p-6');
  });
});

describe('Menú lateral fuera de pantalla en móvil', () => {
  test('con el menú cerrado el panel se desplaza fuera de pantalla (-translate-x-full)', async () => {
    await renderPagina();
    expect(document.getElementById('main-sidebar-nav')).toHaveClass('-translate-x-full', 'lg:translate-x-0');
  });

  test('[CORREGIDO D-10] con el menú cerrado (móvil) sus controles no deberían ser enfocables (inert / invisible / aria-hidden)', async () => {
    await renderPagina();
    const aside = document.getElementById('main-sidebar-nav');
    const oculto = aside.hasAttribute('inert') || aside.getAttribute('aria-hidden') === 'true'
      || /(^|\s)(max-lg:)?invisible(\s|$)/.test(aside.className) || /(^|\s)hidden(\s|$)/.test(aside.className);
    expect(oculto).toBe(true);
  });

  test('abrir el menú móvil muestra el panel y el fondo de cierre con etiqueta accesible', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    expect(document.getElementById('main-sidebar-nav')).toHaveClass('translate-x-0');
    expect(screen.getAllByRole('button', { name: 'Cerrar menú de navegación' })).toHaveLength(2);
  });

  test('[OBSERVACIÓN] al abrir el menú móvil el foco no se mueve al panel', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    expect(document.getElementById('main-sidebar-nav').contains(document.activeElement)).toBe(false);
  });

  test('[OBSERVACIÓN] Escape no cierra el menú móvil', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    await user.keyboard('{Escape}');
    expect(document.getElementById('main-sidebar-nav')).toHaveClass('translate-x-0');
  });

  test('el enlace del menú EPI no indica la página actual (aria-current)', async () => {
    await renderPagina();
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const link = within(nav).getByRole('link', { name: /Reportes de asistencia/ });
    // Observación: sin aria-current="page" ni estilo de activo.
    expect(link).not.toHaveAttribute('aria-current');
  });
});

describe('Controles select: apariencia de habilitado vs. deshabilitado', () => {
  test('[CORREGIDO D-11] un select habilitado no debe recibir los estilos read-only (gris de "inactivo")', async () => {
    await renderPagina();
    const sel = screen.getByLabelText('Tipo de reporte');
    expect(sel).toBeEnabled();
    const aplicaReadOnly = sel.matches(':read-only') && /read-only:bg-slate-200\/60/.test(sel.className);
    expect(aplicaReadOnly).toBe(false);
  });
});

import axe from 'axe-core';
describe('Menú móvil abierto (ciclo 8)', () => {
  test('axe-core sin violaciones serias/críticas con el menú móvil abierto', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    const r = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    const serias = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id);
    expect(serias).toEqual([]);
  });

  test('la transición del panel respeta prefers-reduced-motion (motion-reduce:transition-none)', async () => {
    await renderPagina();
    expect(document.getElementById('main-sidebar-nav').className).toMatch(/motion-reduce:transition-none/);
  });

  test('cerrar con el fondo oscuro devuelve el panel fuera de pantalla', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    const fondos = screen.getAllByRole('button', { name: 'Cerrar menú de navegación' });
    await user.click(fondos[0]);
    expect(document.getElementById('main-sidebar-nav')).toHaveClass('-translate-x-full');
  });
});
