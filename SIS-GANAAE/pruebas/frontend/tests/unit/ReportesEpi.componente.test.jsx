/**
 * Pruebas unitarias / de componente de ReportesAsistenciaEpi.jsx
 * Servicio epiServices simulado; cliente HTTP simulado globalmente (setup.js).
 */
import { screen, within, waitFor, act } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/epiServices', () => import('../helpers/epiMock.js'));

import epi from '@/services/epiServices';
import { reporte, seccion, totales } from '../helpers/fixtures';
import {
  fijarFecha, configurarServiciosPorDefecto, renderPagina, ultimaLlamadaReporte, esperarEstudiantes,
} from '../helpers/pagina';

beforeEach(() => {
  fijarFecha();
  configurarServiciosPorDefecto();
});
afterEach(() => vi.useRealTimers());

const generar = (user) => user.click(screen.getByRole('button', { name: /generar reporte/i }));

describe('Carga inicial y renderizado', () => {
  test('genera automáticamente el reporte mensual del mes en curso', async () => {
    await renderPagina();
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(1);
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledWith({ periodo: 'mensual', fecha_referencia: '2026-11-01' });
  });

  test('muestra título, subtítulo EPI y el resumen del periodo con fechas dd/mm/aaaa', async () => {
    await renderPagina();
    expect(screen.getByRole('heading', { level: 1, name: 'Reportes de asistencia' })).toBeInTheDocument();
    expect(screen.getByText(/Equipo de Permanencia Estudiantil \(EPI\)/)).toBeInTheDocument();
    expect(screen.getByText(/01\/11\/2026 al 30\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText('mensual')).toBeInTheDocument();
  });

  test('renderiza las 6 tarjetas KPI con sus valores', async () => {
    await renderPagina();
    for (const etq of ['% Asistencia general', 'Presentes', 'Tardías', 'Ausencias injustificadas', 'Ausencias justificadas', 'Total de registros']) {
      expect(screen.getAllByText(etq).length).toBeGreaterThan(0);
    }
    // resumen_general = totales(175,5,8,12) -> total 200, 90%
    expect(screen.getByText('200', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('90%', { selector: 'p' })).toHaveClass('text-green-700');
  });

  test('tabla por sección: una fila por sección con contador de materias (singular/plural)', async () => {
    await renderPagina();
    const tabla = screen.getByRole('table');
    expect(within(tabla).getByText('Sección 7-1')).toBeInTheDocument();
    expect(within(tabla).getByText('(2 materias)')).toBeInTheDocument();
    expect(within(tabla).getByText('(1 materia)')).toBeInTheDocument();
    expect(within(tabla).getByText('Total general')).toBeInTheDocument();
  });

  test.each([
    [95, 'text-green-700'], [90, 'text-green-700'], [89.9, 'text-yellow-700'],
    [80, 'text-yellow-700'], [79.9, 'text-red-700'], [0, 'text-red-700'],
  ])('color del %% de asistencia %s → %s', async (pct, clase) => {
    const t = { ...totales(), porcentaje_asistencia: pct };
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [seccion(1, '7-1', [['Matemáticas', 10]], t)] }));
    await renderPagina();
    const fila = screen.getByText('Sección 7-1').closest('tr');
    expect(within(fila).getByText(`${pct}%`)).toHaveClass(clase);
  });

  test('muestra filtros aplicados (sección, materia, estudiante) en el resumen', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({
      filtros: { nombre_seccion: '7-1', nombre_materia: 'Matemáticas', nombre_estudiante: 'Ana Prueba Uno' },
    }));
    await renderPagina();
    expect(screen.getByText(/· Sección 7-1/)).toBeInTheDocument();
    expect(screen.getByText(/Estudiante: Ana Prueba Uno/)).toBeInTheDocument();
  });

  test('los catálogos de sección y materia se llenan desde la respuesta', async () => {
    await renderPagina();
    const sec = screen.getByLabelText('Sección');
    expect(within(sec).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', '7-1', '8-2']);
    const mat = screen.getByLabelText('Materia');
    expect(within(mat).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Matemáticas', 'Español']);
  });
});

describe('Selector de periodo: intercambio de campos', () => {
  test('por defecto (Mensual) solo muestra el campo Mes con el mes actual', async () => {
    await renderPagina();
    expect(screen.getByLabelText('Tipo de reporte')).toHaveValue('mensual');
    expect(screen.getByLabelText('Mes')).toHaveValue('2026-11');
    expect(screen.queryByLabelText('Un día de la semana')).toBeNull();
    expect(screen.queryByLabelText('Año')).toBeNull();
    expect(screen.queryByLabelText('Desde')).toBeNull();
  });

  test('Semanal muestra un campo de fecha con la fecha de hoy', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'semanal');
    const f = screen.getByLabelText('Un día de la semana');
    expect(f).toHaveAttribute('type', 'date');
    expect(f).toHaveValue('2026-11-14');
    expect(screen.queryByLabelText('Mes')).toBeNull();
  });

  test('Anual muestra un select de año con los últimos 6 años (actual primero)', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    const anio = screen.getByLabelText('Año');
    expect(anio.tagName).toBe('SELECT');
    expect(within(anio).getAllByRole('option').map((o) => o.value)).toEqual(['2026', '2025', '2024', '2023', '2022', '2021']);
    expect(anio).toHaveValue('2026');
  });

  test('Rango personalizado muestra Desde (1.º del mes) y Hasta (hoy)', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-11-14');
    expect(screen.queryByLabelText('Mes')).toBeNull();
  });

  test('cambiar el periodo no dispara una consulta hasta presionar Generar', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    expect(epi.getReporteAsistenciaEpi).toHaveBeenCalledTimes(1);
  });
});

describe('Parámetros enviados al servicio por tipo de periodo', () => {
  test('semanal → fecha_referencia = día elegido', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'semanal');
    const f = screen.getByLabelText('Un día de la semana');
    await user.clear(f);
    await user.type(f, '2026-10-07');
    await generar(user);
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'semanal', fecha_referencia: '2026-10-07' });
  });

  test('mensual → fecha_referencia = AAAA-MM-01', async () => {
    const { user } = await renderPagina();
    const mes = screen.getByLabelText('Mes');
    await user.clear(mes);
    await user.type(mes, '2026-03');
    await generar(user);
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'mensual', fecha_referencia: '2026-03-01' });
  });

  test('anual → fecha_referencia = AAAA-01-01', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    await user.selectOptions(screen.getByLabelText('Año'), '2024');
    await generar(user);
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'anual', fecha_referencia: '2024-01-01' });
  });

  test('personalizado → fecha_inicio/fecha_fin y sin fecha_referencia', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    const d = screen.getByLabelText('Desde');
    const h = screen.getByLabelText('Hasta');
    await user.clear(d); await user.type(d, '2026-08-01');
    await user.clear(h); await user.type(h, '2026-09-15');
    await generar(user);
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'personalizado', fecha_inicio: '2026-08-01', fecha_fin: '2026-09-15' });
  });

  test('sección y materia se agregan como id_seccion / id_materia', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await user.selectOptions(screen.getByLabelText('Materia'), '11');
    await generar(user);
    expect(ultimaLlamadaReporte()).toEqual({ periodo: 'mensual', fecha_referencia: '2026-11-01', id_seccion: '2', id_materia: '11' });
  });

  test('estudiante solo se envía junto con la sección', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    await generar(user);
    expect(ultimaLlamadaReporte()).toMatchObject({ id_seccion: '1', id_estudiante: '501' });
  });

  test('[OBSERVACIÓN] rango personalizado invertido (Desde > Hasta) se envía sin validación en el cliente', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'personalizado');
    const d = screen.getByLabelText('Desde');
    await user.clear(d); await user.type(d, '2026-12-31');
    await generar(user);
    // Comportamiento observado: no hay min/max ni mensaje local; se delega al backend (400).
    expect(ultimaLlamadaReporte()).toMatchObject({ fecha_inicio: '2026-12-31', fecha_fin: '2026-11-14' });
    expect(screen.getByLabelText('Hasta')).not.toHaveAttribute('min');
  });
});

describe('Select de Estudiante: habilitación, carga y reinicio', () => {
  test('deshabilitado sin sección, con texto y title explicativo', async () => {
    await renderPagina();
    const est = screen.getByLabelText('Estudiante');
    expect(est).toBeDisabled();
    expect(est).toHaveAttribute('title', 'Seleccione primero una sección');
    expect(within(est).getByRole('option', { name: 'Seleccione una sección' })).toBeInTheDocument();
    expect(epi.getEstudiantesSeccionEpi).not.toHaveBeenCalled();
  });

  test('al elegir sección muestra "Cargando estudiantes…" y luego la lista con cédula', async () => {
    let resolver;
    epi.getEstudiantesSeccionEpi.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    const est = screen.getByLabelText('Estudiante');
    expect(est).toBeDisabled();
    expect(within(est).getByRole('option', { name: 'Cargando estudiantes…' })).toBeInTheDocument();
    await act(async () => resolver({ estudiantes: [{ id_estudiante: 501, nombre_completo: 'Ana Prueba Uno', cedula: '100000001' }, { id_estudiante: 502, nombre_completo: 'Beto Prueba Dos', cedula: null }] }));
    await esperarEstudiantes(2);
    expect(within(est).getByRole('option', { name: 'Ana Prueba Uno · 100000001' })).toBeInTheDocument();
    expect(within(est).getByRole('option', { name: 'Beto Prueba Dos' })).toBeInTheDocument();
    expect(epi.getEstudiantesSeccionEpi).toHaveBeenCalledWith('1', { anio: '2026' });
  });

  test('cambiar de sección reinicia el estudiante seleccionado y recarga la lista', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await esperarEstudiantes(1);
    expect(screen.getByLabelText('Estudiante')).toHaveValue('');
    expect(epi.getEstudiantesSeccionEpi).toHaveBeenLastCalledWith('2', { anio: '2026' });
  });

  test('volver a "Todas" las secciones deshabilita y vacía el estudiante', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '502');
    await user.selectOptions(screen.getByLabelText('Sección'), '');
    const est = screen.getByLabelText('Estudiante');
    expect(est).toBeDisabled();
    expect(est).toHaveValue('');
    await generar(user);
    expect(ultimaLlamadaReporte()).not.toHaveProperty('id_estudiante');
  });

  test('respuesta tardía de una sección anterior no sobrescribe la lista actual (cancelación)', async () => {
    const pendientes = {};
    epi.getEstudiantesSeccionEpi.mockImplementation((id) => new Promise((r) => { pendientes[id] = r; }));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await act(async () => pendientes['2']({ estudiantes: [{ id_estudiante: 601, nombre_completo: 'Carla Prueba Tres' }] }));
    await act(async () => pendientes['1']({ estudiantes: [{ id_estudiante: 501, nombre_completo: 'Ana Prueba Uno' }] }));
    await esperarEstudiantes(1);
    expect(screen.queryByRole('option', { name: /Ana Prueba Uno/ })).toBeNull();
  });

  test('si falla la carga de estudiantes, queda "Todos (0)" sin mensaje de error visible', async () => {
    epi.getEstudiantesSeccionEpi.mockRejectedValue(new Error('500'));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('cambiar el año del periodo recarga estudiantes con el nuevo año', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(2);
    const mes = screen.getByLabelText('Mes');
    await user.clear(mes);
    await user.type(mes, '2025-05');
    await waitFor(() => expect(epi.getEstudiantesSeccionEpi).toHaveBeenLastCalledWith('1', { anio: '2025' }));
  });

  test('[CORREGIDO D-01] al cambiar el año, un estudiante que ya no está en la lista no debería seguir enviándose', async () => {
    epi.getEstudiantesSeccionEpi.mockImplementation((id, { anio }) =>
      Promise.resolve(anio === '2025'
        ? { estudiantes: [{ id_estudiante: 777, nombre_completo: 'Otro Estudiante 2025' }] }
        : { estudiantes: [{ id_estudiante: 501, nombre_completo: 'Ana Prueba Uno' }] }));
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await esperarEstudiantes(1);
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    const mes = screen.getByLabelText('Mes');
    await user.clear(mes);
    await user.type(mes, '2025-05');
    await screen.findByRole('option', { name: 'Otro Estudiante 2025' });
    await generar(user);
    // Esperado: id_estudiante reiniciado (501 no existe en la lista de 2025).
    expect(ultimaLlamadaReporte()).not.toHaveProperty('id_estudiante');
  });
});

describe('Expandir / contraer secciones', () => {
  test('botón de sección alterna aria-expanded y muestra las materias', async () => {
    const { user } = await renderPagina();
    const btn = screen.getByRole('button', { name: /Sección 7-1/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Matemáticas', { selector: 'td span' })).toBeNull();
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Matemáticas', { selector: 'td span' })).toBeInTheDocument();
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Matemáticas', { selector: 'td span' })).toBeNull();
  });

  test('"Ver detalle de todas" expande todo y cambia a "Contraer todo"', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Ver detalle de todas' }));
    expect(screen.getByRole('button', { name: /Sección 7-1/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Sección 8-2/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Ciencias', { selector: 'td span' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Contraer todo' }));
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
  });

  test('expandir manualmente todas las secciones cambia la etiqueta a "Contraer todo"', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: /Sección 7-1/ }));
    await user.click(screen.getByRole('button', { name: /Sección 8-2/ }));
    expect(screen.getByRole('button', { name: 'Contraer todo' })).toBeInTheDocument();
  });

  test('regenerar el reporte contrae las secciones abiertas', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Ver detalle de todas' }));
    await generar(user);
    await screen.findByRole('button', { name: 'Ver detalle de todas' });
    expect(screen.getByRole('button', { name: /Sección 7-1/ })).toHaveAttribute('aria-expanded', 'false');
  });

  test('sin secciones no aparece el botón "Ver detalle de todas" y se muestra mensaje vacío', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    renderPaginaSinEsperar();
    expect(await screen.findByText(/No hay registros de asistencia para el periodo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver detalle de todas' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Descarga de PDF', () => {
  test('usa los parámetros del reporte mostrado y nombre de archivo según filtros', async () => {
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.guardarBlob).toHaveBeenCalled());
    expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalledWith({ periodo: 'mensual', fecha_referencia: '2026-11-01' });
    expect(epi.guardarBlob.mock.calls[0][1]).toBe('reporte_asistencia_epi_mensual_2026-11-01_2026-11-30.pdf');
  });

  test('si se cambian filtros sin regenerar, el PDF usa los parámetros anteriores', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'anual');
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalled());
    expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalledWith({ periodo: 'mensual', fecha_referencia: '2026-11-01' });
  });

  test('tras regenerar, el PDF usa los nuevos parámetros', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '2');
    await generar(user);
    await screen.findByText('Sección 7-1');
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(epi.descargarReporteAsistenciaEpiPdf).toHaveBeenCalled());
    expect(epi.descargarReporteAsistenciaEpiPdf.mock.calls[0][0]).toEqual({ periodo: 'mensual', fecha_referencia: '2026-11-01', id_seccion: '2' });
  });

  test('muestra "Generando PDF…" y deshabilita el botón durante la descarga', async () => {
    let resolver;
    epi.descargarReporteAsistenciaEpiPdf.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    const btn = screen.getByRole('button', { name: 'Generando PDF…' });
    expect(btn).toBeDisabled();
    await act(async () => resolver(new Blob(['x'])));
    expect(await screen.findByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
  });

  test('error al descargar muestra diálogo de error', async () => {
    epi.descargarReporteAsistenciaEpiPdf.mockRejectedValue(new Error('500'));
    const { user } = await renderPagina();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText('Error')).toBeInTheDocument();
    expect(within(dlg).getByText('No se pudo descargar el PDF. Intente de nuevo.')).toBeInTheDocument();
    expect(epi.guardarBlob).not.toHaveBeenCalled();
  });

  test('reporte sin secciones: el botón abre el aviso "Sin datos" y no descarga', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const { user } = await (async () => { const r = renderPaginaSinEsperar(); await screen.findByText(/No hay registros/); return r; })();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText('Sin datos')).toBeInTheDocument();
    expect(within(dlg).getByText('No hay datos de asistencia para el periodo seleccionado.')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(epi.descargarReporteAsistenciaEpiPdf).not.toHaveBeenCalled();
  });

  test('el diálogo "Sin datos" se cierra con Escape', async () => {
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [], resumen_general: totales(0, 0, 0, 0) }));
    const { user } = renderPaginaSinEsperar();
    await screen.findByText(/No hay registros/);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Aviso amarillo de filtros modificados', () => {
  const aviso = () => screen.queryByText(/Cambió los filtros/);

  test('no aparece tras la carga inicial', async () => {
    await renderPagina();
    expect(aviso()).toBeNull();
  });

  test('aparece al cambiar un filtro y desaparece al regenerar', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Materia'), '10');
    expect(aviso()).toBeInTheDocument();
    expect(aviso()).toHaveAttribute('role', 'status');
    await generar(user);
    await screen.findByText('Sección 7-1');
    expect(aviso()).toBeNull();
  });

  test('desaparece si el usuario revierte el filtro al valor del reporte', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'semanal');
    expect(aviso()).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'mensual');
    expect(aviso()).toBeNull();
  });

  test('no aparece mientras se está generando', async () => {
    let resolver;
    const { user } = await renderPagina();
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise((r) => { resolver = r; }));
    await user.selectOptions(screen.getByLabelText('Materia'), '10');
    await generar(user);
    expect(aviso()).toBeNull();
    await act(async () => resolver(reporte()));
  });

  test('cambiar solo el estudiante (no generado) también activa el aviso', async () => {
    const { user } = await renderPagina();
    await user.selectOptions(screen.getByLabelText('Sección'), '1');
    await generar(user);
    await esperarEstudiantes(2);
    expect(aviso()).toBeNull();
    await user.selectOptions(screen.getByLabelText('Estudiante'), '501');
    expect(aviso()).toBeInTheDocument();
  });
});

describe('Estados de carga y error', () => {
  test('mientras genera: indicador role=status, Generar y Descargar deshabilitados', async () => {
    epi.getReporteAsistenciaEpi.mockImplementation(() => new Promise(() => {}));
    renderPaginaSinEsperar();
    const estado = await screen.findByText('Generando reporte de asistencia…');
    expect(estado.closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /generar reporte/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
  });

  test('error de API con mensaje del backend → role=alert con ese mensaje', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue({ response: { status: 400, data: { error: 'La fecha de inicio no puede ser posterior a la fecha de fin' } } });
    renderPaginaSinEsperar();
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('La fecha de inicio no puede ser posterior a la fecha de fin');
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('error de red sin cuerpo → mensaje genérico en español', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue(new Error('Network Error'));
    renderPaginaSinEsperar();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el reporte');
  });

  test('un error posterior oculta el reporte previo; un éxito posterior limpia el error', async () => {
    const { user } = await renderPagina();
    epi.getReporteAsistenciaEpi.mockRejectedValueOnce(new Error('x'));
    await generar(user);
    await screen.findByRole('alert');
    expect(screen.queryByText('Sección 7-1')).toBeNull();
    await generar(user);
    await screen.findByText('Sección 7-1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('[OBSERVACIÓN] mensaje "message" del backend (en vez de "error") no se muestra', async () => {
    epi.getReporteAsistenciaEpi.mockRejectedValue({ response: { status: 403, data: { message: 'Acceso denegado' } } });
    renderPaginaSinEsperar();
    const alerta = await screen.findByRole('alert');
    // Observado: solo se lee data.error; mapApiError (src/lib/errors.js) cubriría ambos.
    expect(alerta).toHaveTextContent('No se pudo generar el reporte');
  });
});

describe('Robustez de datos', () => {
  test('[CORREGIDO D-02] el desglose visible debe cuadrar con el Total (los registros "otros" no tienen columna)', async () => {
    const t = { ...totales(10, 0, 0, 0), otros: 5, total: 15, porcentaje_asistencia: 66.7 };
    epi.getReporteAsistenciaEpi.mockResolvedValue(reporte({ secciones: [seccion(1, '7-1', [['Matemáticas', 10]], t)], resumen_general: t }));
    await renderPagina();
    const fila = screen.getByText('Sección 7-1').closest('tr');
    const celdas = within(fila).getAllByRole('cell').map((c) => c.textContent);
    const encabezados = screen.getAllByRole('columnheader').map((h) => h.textContent.trim());
    const iTotal = encabezados.indexOf('Total');
    // CORREGIDO: aparece la columna "Otros" cuando hay registros de ese tipo, y el desglose cuadra con "Total".
    expect(encabezados).toContain('Otros');
    const suma = celdas.slice(1, iTotal).reduce((a, b) => a + Number(b), 0);
    expect(suma).toBe(Number(celdas[iTotal]));
  });
});

// util local: render sin esperar a que aparezca la tabla
import userEvent from '@testing-library/user-event';
import Page from '@/pages/epi/ReportesAsistenciaEpi';
import { renderConProveedores } from '../helpers/render';
function renderPaginaSinEsperar() {
  const user = userEvent.setup();
  return { user, ...renderConProveedores(<Page />) };
}
