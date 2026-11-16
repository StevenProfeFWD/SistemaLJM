/**
 * Ciclo 16: flujo de registro de una persona con rol EPI (RegistroPersonas.jsx), servicios simulados.
 * Los controles no tienen etiquetas asociadas (D-03), por eso se ubican por atributo name.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('@/services/personaServices', () => ({
  default: { postPersonas: vi.fn(), consultarCedula: vi.fn() },
}));
vi.mock('@/services/asignacionAsistenciaServices', () => ({
  default: { getCatalogos: vi.fn().mockResolvedValue({ materias: [{ id_materia: 1, nombre_materia: 'Matemáticas' }] }) },
}));

import personaServicio from '@/services/personaServices';
import RegistroPersonas from '@/components/register-data/RegistroPersonas';
import { DialogProvider } from '@/context/DialogContext';

const campo = (name) => document.querySelector(`[name="${name}"]`);

beforeEach(() => {
  personaServicio.postPersonas.mockReset().mockResolvedValue({ ok: true });
  personaServicio.consultarCedula.mockReset().mockResolvedValue({ encontrado: false, mensaje: 'No se encontró en Hacienda.' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Registro de persona con rol EPI', () => {
  test('completa el formulario, elige "Equipo de Permanencia Estudiantil (EPI)" y envía nombre_rol=epi sin materias', async () => {
    const user = userEvent.setup();
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    await user.type(campo('cedula'), '100000009');
    await user.tab(); // dispara la consulta de cédula (simulada)
    await waitFor(() => expect(personaServicio.consultarCedula).toHaveBeenCalledWith('100000009'));
    await user.type(campo('nombre_completo'), 'Persona EPI de Prueba');
    await user.type(campo('correo'), 'epi.prueba@example.test');
    await user.type(campo('telefono'), '88880000');
    await user.type(campo('direccion'), 'Dirección ficticia');
    await user.type(campo('fecha_nacimiento'), '1990-05-10');
    await user.selectOptions(campo('nombre_rol'), 'epi');
    // El bloque de materias solo aparece para docentes
    expect(screen.queryByText('Materias habilitadas (formación)')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(personaServicio.postPersonas).toHaveBeenCalledTimes(1));
    const body = personaServicio.postPersonas.mock.calls[0][0];
    expect(body).toMatchObject({ nombre_rol: 'epi', cedula: '100000009', nombre_completo: 'Persona EPI de Prueba' });
    expect(body).not.toHaveProperty('materias_habilitadas');
    expect(await screen.findByText('Persona registrada correctamente')).toBeInTheDocument();
    expect(campo('nombre_rol')).toHaveValue('');
  });

  test('[CORREGIDO D-12] con los campos obligatorios vacíos, "Guardar" no debería enviar al servidor', async () => {
    const user = userEvent.setup();
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    // Ahora hay un <form> (validación nativa) y además validación propia con mensaje.
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    // La validación nativa del formulario bloquea el envío (campos required vacíos).
    expect(form.checkValidity()).toBe(false);
    expect(personaServicio.postPersonas).not.toHaveBeenCalled();
  });

  test('si el envío llega al manejador con campos vacíos (p. ej. navegador sin validación nativa), se muestra un mensaje y no se envía', async () => {
    render(<DialogProvider><RegistroPersonas /></DialogProvider>);
    const form = document.querySelector('form');
    form.noValidate = true; // simula un navegador que no valida
    fireEvent.submit(form);
    expect(await screen.findByText(/Complete los campos obligatorios/)).toBeInTheDocument();
    expect(personaServicio.postPersonas).not.toHaveBeenCalled();
  });
});
