/**
 * Revisión de la corrección de AlertDialog (D-04): devolución del foco, trampa de Tab,
 * aria-describedby y onClose guardado en ref. Se prueba a través de DialogProvider (uso real).
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { useState } from 'react';
import { DialogProvider, useDialog } from '@/context/DialogContext';
import AlertDialog from '@/components/dialog/AlertDialog';

function Disparador({ mensajes = ['Mensaje de prueba'], onFin }) {
  const { alert } = useDialog();
  return (
    <>
      <button type="button">Antes</button>
      <button
        type="button"
        onClick={async () => {
          for (const m of mensajes) await alert(m, { title: 'Aviso de prueba' });
          onFin?.();
        }}
      >
        Abrir aviso
      </button>
      <button type="button">Después</button>
    </>
  );
}

const montar = (props) => render(<DialogProvider><Disparador {...props} /></DialogProvider>);

describe('AlertDialog tras la corrección', () => {
  test('al abrir, el foco va al botón "Entendido" y el diálogo se describe con el mensaje', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Abrir aviso' }));
    const dlg = await screen.findByRole('alertdialog', { name: 'Aviso de prueba' });
    expect(dlg).toHaveAccessibleDescription('Mensaje de prueba');
    expect(screen.getByRole('button', { name: 'Entendido' })).toHaveFocus();
  });

  test('Tab y Shift+Tab no sacan el foco del diálogo (un solo botón)', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Abrir aviso' }));
    const ok = await screen.findByRole('button', { name: 'Entendido' });
    await user.tab();
    expect(ok).toHaveFocus();
    await user.tab({ shift: true });
    expect(ok).toHaveFocus();
  });

  test('cerrar con clic devuelve el foco al botón que abrió el aviso', async () => {
    const user = userEvent.setup();
    montar();
    const abrir = screen.getByRole('button', { name: 'Abrir aviso' });
    await user.click(abrir);
    await user.click(await screen.findByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(abrir).toHaveFocus();
  });

  test('cerrar con Escape devuelve el foco y resuelve la promesa', async () => {
    const user = userEvent.setup();
    const onFin = vi.fn();
    montar({ onFin });
    const abrir = screen.getByRole('button', { name: 'Abrir aviso' });
    await user.click(abrir);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onFin).toHaveBeenCalledTimes(1));
    expect(abrir).toHaveFocus();
  });

  test('dos avisos encadenados: al cerrar el segundo el foco vuelve al disparador original', async () => {
    const user = userEvent.setup();
    const onFin = vi.fn();
    montar({ mensajes: ['Primero', 'Segundo'], onFin });
    const abrir = screen.getByRole('button', { name: 'Abrir aviso' });
    await user.click(abrir);
    await screen.findByText('Primero');
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await screen.findByText('Segundo');
    expect(screen.getByRole('button', { name: 'Entendido' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(onFin).toHaveBeenCalled());
    expect(abrir).toHaveFocus();
  });

  test('si onClose cambia de identidad con el diálogo abierto, el foco no se mueve y Escape usa el onClose nuevo', async () => {
    const primero = vi.fn();
    const segundo = vi.fn();
    function Envoltura() {
      const [fn, setFn] = useState(() => primero);
      return (
        <>
          <button type="button" onClick={() => setFn(() => segundo)}>cambiar</button>
          <AlertDialog open title="T" message="M" onClose={fn} />
        </>
      );
    }
    render(<Envoltura />);
    const ok = screen.getByRole('button', { name: 'Entendido' });
    expect(ok).toHaveFocus();
    act(() => screen.getByRole('button', { name: 'cambiar' }).click());
    // El clic programático no mueve el foco; el efecto no se re-ejecuta (deps [open]).
    expect(ok).toHaveFocus();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(segundo).toHaveBeenCalledTimes(1);
    expect(primero).not.toHaveBeenCalled();
  });

  test('sin mensaje no se pone aria-describedby (no apunta a un id inexistente)', () => {
    render(<AlertDialog open title="Solo título" onClose={() => {}} />);
    expect(screen.getByRole('alertdialog')).not.toHaveAttribute('aria-describedby');
  });

  test('si el disparador desaparece mientras el aviso está abierto, cerrar no lanza error', async () => {
    const user = userEvent.setup();
    function Temporal() {
      const { alert } = useDialog();
      const [visible, setVisible] = useState(true);
      return visible ? (
        <button type="button" onClick={() => { alert('x'); setVisible(false); }}>temporal</button>
      ) : <span>sin botón</span>;
    }
    render(<DialogProvider><Temporal /></DialogProvider>);
    await user.click(screen.getByRole('button', { name: 'temporal' }));
    await user.click(await screen.findByRole('button', { name: 'Entendido' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});
