/**
 * Revisión de RegistroPersonas.jsx tras D-03/D-12: etiquetas, <form>, Enter, validación propia,
 * bloque de materias (role="group") y estados deshabilitados. Servicios simulados.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('@/services/personaServices', () => ({
  default: { postPersonas: vi.fn(), consultarCedula: vi.fn() },
}));
vi.mock('@/services/asignacionAsistenciaServices', () => ({
  default: {
    getCatalogos: vi.fn().mockResolvedValue({
      materias: [
        { id_materia: 1, nombre_materia: 'Matemáticas' },
        { id_materia: 2, nombre_materia: 'Ciencias' },
      ],
    }),
  },
}));

import personaServicio from '@/services/personaServices';
import RegistroPersonas from '@/components/register-data/RegistroPersonas';
import { DialogProvider } from '@/context/DialogContext';

const ETIQUETAS = [
  'Identificación (Cédula o DIMEX)', 'Nombre completo', 'Correo', 'Teléfono',
  'Dirección', 'Fecha de nacimiento', 'Rol',
];

beforeEach(() => {
  personaServicio.postPersonas.mockReset().mockResolvedValue({ ok: true });
  personaServicio.consultarCedula.mockReset().mockResolvedValue({ encontrado: false, mensaje: 'No se encontró en Hacienda.' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const montar = () => {
  const user = userEvent.setup();
  render(<DialogProvider><RegistroPersonas /></DialogProvider>);
  return user;
};

async function llenar(user, { rol = 'orientador' } = {}) {
  await user.type(screen.getByLabelText('Identificación (Cédula o DIMEX)'), '100000009');
  await user.tab(); // onBlur → consulta simulada
  await waitFor(() => expect(personaServicio.consultarCedula).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByLabelText('Identificación (Cédula o DIMEX)')).not.toBeDisabled());
  await user.type(screen.getByLabelText('Nombre completo'), 'Persona de Prueba');
  await user.type(screen.getByLabelText('Correo'), 'persona@example.test');
  await user.type(screen.getByLabelText('Teléfono'), '88880000');
  await user.type(screen.getByLabelText('Dirección'), 'Dirección ficticia');
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1990-05-10' } });
  await user.selectOptions(screen.getByLabelText('Rol'), rol);
}

describe('RegistroPersonas tras la corrección', () => {
  test('cada control tiene su etiqueta asociada (getByLabelText encuentra los 7)', () => {
    montar();
    for (const e of ETIQUETAS) expect(screen.getByLabelText(e)).toBeInTheDocument();
  });

  test('el botón Guardar es type="submit" dentro del formulario', () => {
    montar();
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn.closest('form')).not.toBeNull();
  });

  test('campos con solo espacios: la validación propia muestra un mensaje (role=alert) y no se envía', async () => {
    const user = montar();
    for (const e of ['Identificación (Cédula o DIMEX)', 'Nombre completo', 'Teléfono', 'Dirección']) {
      fireEvent.change(screen.getByLabelText(e), { target: { value: '   ' } });
    }
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@b.test' } });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1990-01-01' } });
    await user.selectOptions(screen.getByLabelText('Rol'), 'orientador');
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form'));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Complete los campos obligatorios');
    expect(alerta).toHaveTextContent('identificación');
    expect(alerta).toHaveTextContent('nombre completo');
    expect(personaServicio.postPersonas).not.toHaveBeenCalled();
  });

  test('Enter en un campo de texto con todo completo envía el formulario una sola vez', async () => {
    const user = montar();
    await llenar(user);
    await user.click(screen.getByLabelText('Teléfono'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(personaServicio.postPersonas).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Persona registrada correctamente')).toBeInTheDocument();
  });

  test('Enter en la cédula tras editarla no envía datos incompletos (el nombre se limpia y la validación lo indica)', async () => {
    const user = montar();
    await llenar(user);
    const ced = screen.getByLabelText('Identificación (Cédula o DIMEX)');
    await user.click(ced);
    await user.type(ced, '1');
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('');
    fireEvent.submit(ced.closest('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('nombre completo');
    expect(personaServicio.postPersonas).not.toHaveBeenCalled();
  });

  test('docente: "Materias habilitadas" es un grupo con nombre accesible y las materias marcadas se envían', async () => {
    const user = montar();
    await llenar(user, { rol: 'profesor' });
    const grupo = await screen.findByRole('group', { name: 'Materias habilitadas (formación)' });
    const casillas = await waitFor(() => {
      const c = grupo.querySelectorAll('input[type="checkbox"]');
      expect(c.length).toBe(2);
      return c;
    });
    await user.click(casillas[1]);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(personaServicio.postPersonas).toHaveBeenCalledTimes(1));
    expect(personaServicio.postPersonas.mock.calls[0][0]).toMatchObject({ nombre_rol: 'profesor', materias_habilitadas: [2] });
  });

  test('las casillas de materia tienen nombre accesible (envueltas en <label>)', async () => {
    const user = montar();
    await user.selectOptions(screen.getByLabelText('Rol'), 'profesor');
    expect(await screen.findByRole('checkbox', { name: 'Matemáticas' })).toBeInTheDocument();
  });

  test('cédula ya registrada: Guardar queda deshabilitado y Enter en otro campo no envía', async () => {
    personaServicio.consultarCedula.mockResolvedValue({
      existeInterno: true, persona: { cedula: '100000009', nombre_completo: 'Ya Existe' },
    });
    const user = montar();
    await user.type(screen.getByLabelText('Identificación (Cédula o DIMEX)'), '100000009');
    await user.tab();
    expect(await screen.findByText(/ya está registrada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.click(screen.getByLabelText('Correo'));
    await user.keyboard('{Enter}');
    expect(personaServicio.postPersonas).not.toHaveBeenCalled();
  });

  test('mientras se guarda, el botón muestra "Guardando..." y está deshabilitado (no hay doble envío)', async () => {
    let resolver;
    personaServicio.postPersonas.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const user = montar();
    await llenar(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    const btn = await screen.findByRole('button', { name: 'Guardando...' });
    expect(btn).toBeDisabled();
    // Enter en un campo con el submit deshabilitado no debe disparar un segundo envío.
    await user.click(screen.getByLabelText('Correo'));
    await user.keyboard('{Enter}');
    expect(personaServicio.postPersonas).toHaveBeenCalledTimes(1);
    resolver({ ok: true });
    await screen.findByText('Persona registrada correctamente');
  });
});
