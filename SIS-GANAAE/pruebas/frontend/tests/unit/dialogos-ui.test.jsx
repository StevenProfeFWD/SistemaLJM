/**
 * Componentes de soporte usados por la pantalla EPI: DialogContext/AlertDialog, LoadingStatus.
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { DialogProvider, useDialog } from '@/context/DialogContext';
import AlertDialog from '@/components/dialog/AlertDialog';
import LoadingStatus from '@/components/ui/LoadingStatus';

function Disparador({ onResult, opciones }) {
  const { alert } = useDialog();
  return <button type="button" onClick={async () => { await alert('Mensaje de prueba', opciones); onResult('cerrado'); }}>abrir</button>;
}

describe('DialogContext.alert', () => {
  test('la promesa se resuelve al pulsar "Entendido" y el diálogo desaparece', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<DialogProvider><Disparador onResult={onResult} opciones={{ title: 'Sin datos', variant: 'info' }} /></DialogProvider>);
    await user.click(screen.getByText('abrir'));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Sin datos');
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(onResult).toHaveBeenCalledWith('cerrado');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('título por defecto "Aviso" y etiqueta de botón personalizable', async () => {
    const user = userEvent.setup();
    render(<DialogProvider><Disparador onResult={() => {}} opciones={{ confirmLabel: 'Aceptar' }} /></DialogProvider>);
    await user.click(screen.getByText('abrir'));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Aviso');
    expect(screen.getByRole('button', { name: 'Aceptar' })).toHaveFocus();
  });

  test('useDialog fuera del proveedor lanza un error descriptivo en español', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Malo() { useDialog(); return null; }
    expect(() => render(<Malo />)).toThrow('useDialog debe usarse dentro de DialogProvider');
    spy.mockRestore();
  });
});

describe('AlertDialog', () => {
  test('no renderiza nada cuando open=false', () => {
    const { container } = render(<AlertDialog open={false} message="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('aria-modal=true y el título enlazado con aria-labelledby', () => {
    render(<AlertDialog open title="Error" message="Falló" variant="error" onClose={() => {}} />);
    const d = screen.getByRole('alertdialog');
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAccessibleName('Error');
  });

  test('Escape llama a onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AlertDialog open title="t" message="m" onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('variante desconocida usa el ícono informativo sin fallar', () => {
    render(<AlertDialog open title="t" message="m" variant="rara" onClose={() => {}} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('LoadingStatus', () => {
  test('role=status, aria-live=polite, aria-busy y etiqueta por defecto en español', () => {
    render(<LoadingStatus />);
    const s = screen.getByRole('status');
    expect(s).toHaveAttribute('aria-live', 'polite');
    expect(s).toHaveAttribute('aria-busy', 'true');
    expect(s).toHaveTextContent('Cargando…');
  });

  test('el spinner es decorativo (aria-hidden) y respeta prefers-reduced-motion', () => {
    render(<LoadingStatus label="x" />);
    const spinner = screen.getByRole('status').querySelector('[aria-hidden="true"]');
    expect(spinner.className).toMatch(/motion-reduce:animate-none/);
  });
});
