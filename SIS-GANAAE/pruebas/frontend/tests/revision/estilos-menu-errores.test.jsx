/**
 * Revisión de: estilos de Select (filledSelectBase), token --ring, menú móvil (mainBar),
 * index.html (lang/título) y mapApiError.
 */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect } from 'vitest';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { filledSelectBase, filledControlBase } from '@/components/ui/form-control-styles';
import MainBar from '@/components/side-bar/mainBar';
import { mapApiError } from '@/lib/errors';
import { renderConProveedores } from '../helpers/render';
import { APP, leerVariableApp, mezclar, contraste, BLANCO, oklchToRgb } from '../helpers/color';

describe('Select / Input: estilos de control', () => {
  test('Select ya no lleva variantes read-only (no se ve gris como deshabilitado)', () => {
    render(<Select aria-label="s"><option>a</option></Select>);
    const cls = screen.getByLabelText('s').className;
    expect(cls).not.toMatch(/read-only:/);
    expect(cls).toMatch(/disabled:bg-slate-200\/60/);
  });

  test('Input y Textarea conservan el estilo read-only (no se perdió en la refactorización)', () => {
    render(<><Input aria-label="i" readOnly /><Textarea aria-label="t" /></>);
    expect(screen.getByLabelText('i').className).toMatch(/read-only:bg-slate-200\/60/);
    expect(screen.getByLabelText('t').className).toMatch(/read-only:bg-slate-200\/60/);
  });

  test('filledControlBase = filledSelectBase + read-only (misma base, sin divergencias)', () => {
    expect(filledControlBase.startsWith(filledSelectBase)).toBe(true);
    expect(filledSelectBase).not.toMatch(/read-only/);
  });

  test('ningún <Select> de la app depende de readOnly (que ya no tendría aspecto distinto)', () => {
    const raiz = path.join(APP, 'src');
    const archivos = [];
    const recorrer = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) recorrer(p);
        else if (/\.jsx$/.test(f.name)) archivos.push(p);
      }
    };
    recorrer(raiz);
    const conReadOnly = archivos.filter((p) => /<Select\b[^>]*\breadOnly\b/s.test(fs.readFileSync(p, 'utf8')));
    expect(conReadOnly).toEqual([]);
  });
});

describe('Token --ring (tema claro)', () => {
  test('ring al 50 % sobre blanco alcanza 3:1 (WCAG 1.4.11)', () => {
    const ring = leerVariableApp('ring');
    expect(contraste(mezclar(ring, BLANCO, 0.5), BLANCO)).toBeGreaterThanOrEqual(3);
  });

  test('[OBSERVACIÓN] sobre las tarjetas oscuras de InicioAdmin (bg-slate-900) el ring es del mismo color que el fondo', () => {
    // Chromium dibuja un anillo blanco exterior con outline:auto, por eso en Chrome sigue viéndose (ver informe).
    const ring = leerVariableApp('ring');
    const slate900 = oklchToRgb(0.208, 0.042, 265.755);
    expect(contraste(mezclar(ring, slate900, 0.5), slate900)).toBeLessThan(1.1);
  });

  test('el modo oscuro conserva su propio --ring (el cambio solo afecta al tema claro)', () => {
    const css = fs.readFileSync(path.join(APP, 'src/index.css'), 'utf8');
    const bloqueOscuro = css.slice(css.indexOf('.dark {'));
    expect(bloqueOscuro).toMatch(/--ring:\s*oklch\(0\.556 0 0\)/);
  });
});

describe('index.html', () => {
  test('lang="es" y título descriptivo', () => {
    const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
    expect(html).toMatch(/<html lang="es">/);
    expect(html).toMatch(/<title>SIS-GANAAE · Sistema de Asistencias Estudiantiles<\/title>/);
  });
});

describe('Menú lateral móvil (mainBar)', () => {
  const montar = () => renderConProveedores(<MainBar />, { user: { id: 1, rol: 'administrador', nombre: 'Admin' }, ruta: '/inicio' });

  test('cerrado: max-lg:invisible y -translate-x-full; abierto: sin invisible y translate-x-0', async () => {
    const user = userEvent.setup();
    montar();
    const nav = await waitFor(() => {
      const n = document.getElementById('main-sidebar-nav');
      expect(n).not.toBeNull();
      return n;
    });
    expect(nav.className).toMatch(/-translate-x-full/);
    expect(nav.className).toMatch(/max-lg:invisible/);
    expect(nav.className).toMatch(/lg:translate-x-0/);
    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    expect(nav.className).not.toMatch(/invisible/);
    expect(nav.className).toMatch(/(^|\s)translate-x-0(\s|$)/);
  });

  test('[HALLAZGO-CORREGIDO] la transición debe incluir la propiedad CSS `translate` (Tailwind 4) para que el panel siga deslizándose', async () => {
    montar();
    const nav = await waitFor(() => {
      const n = document.getElementById('main-sidebar-nav');
      expect(n).not.toBeNull();
      return n;
    });
    // En Tailwind 4, translate-x-* usa la propiedad `translate`, no `transform`.
    // `transition-[transform,visibility]` genera `transition-property: transform,visibility`,
    // así que el desplazamiento ya no se anima (antes `transition-transform` incluía translate).
    const clases = nav.className.split(/\s+/);
    const transicion = clases.find((c) => /^transition(-|$)/.test(c));
    const animaTranslate = transicion === 'transition-transform' || transicion === 'transition-all'
      || /^transition-\[[^\]]*\btranslate\b/.test(transicion || '');
    expect(animaTranslate, `clase de transición actual: ${transicion}`).toBe(true);
  });
});

describe('mapApiError (mensaje genérico de axios)', () => {
  test('error de axios sin response.data → fallback', () => {
    const err = Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } });
    expect(mapApiError(err, 'No se pudo')).toBe('No se pudo');
  });
  test('error de axios sin response (red) con mensaje genérico → fallback', () => {
    expect(mapApiError(new Error('Request failed with status code 404'), 'X')).toBe('X');
  });
  test('response.data con message real se respeta', () => {
    expect(mapApiError({ message: 'Request failed with status code 409', response: { data: { message: 'Cupo lleno' } } })).toBe('Cupo lleno');
  });
  test('response.data = {} con error legacy se respeta', () => {
    expect(mapApiError({ response: { data: { error: 'Legacy' } } })).toBe('Legacy');
  });
  test('cuerpo de texto plano se respeta', () => {
    expect(mapApiError({ response: { data: '  Texto del servidor  ' } })).toBe('Texto del servidor');
  });
  test('[OBSERVACIÓN] "Network Error" de axios (sin conexión) se sigue mostrando en inglés', () => {
    expect(mapApiError(new Error('Network Error'), 'Sin conexión')).toBe('Network Error');
  });
});
