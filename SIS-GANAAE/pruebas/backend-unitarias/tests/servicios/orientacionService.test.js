/** Ciclo 12: orientacionService (estados especiales). BD simulada; notificaciones por correo simuladas. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../backend-node/src/services/notificationService.js', () => ({
  notificarEstadoOrientacion: vi.fn(async () => {}),
}));

const DB = await import('../helpers/dbMock.js');
const O = await import('../../../../backend-node/src/services/orientacionService.js');
const N = await import('../../../../backend-node/src/services/notificationService.js');

beforeEach(() => {
  DB.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 14, 10)); // hoy = 2026-11-14
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const rechaza = async (p, status, msg) => {
  const e = await p.catch((x) => x);
  expect(e).toBeInstanceOf(Error);
  expect(e.status).toBe(status);
  if (msg) expect(e.message).toMatch(msg);
};

const filaHist = (extra = {}) => ({
  id_estado_periodo: 1,
  id_persona_estudiante: 5,
  tipo_estado: 'suspension',
  fecha_inicio: '2026-11-10',
  fecha_fin: '2026-11-20',
  motivo: 'm',
  nombre_completo: 'Ana',
  cedula: '1',
  correo: 'a@x',
  ...extra,
});

describe('hoyIsoLocal / TIPO_ESTADO_LABEL', () => {
  it('fecha local', () => expect(O.hoyIsoLocal()).toBe('2026-11-14'));
  it('etiquetas', () => expect(O.TIPO_ESTADO_LABEL).toEqual({ suspension: 'Suspensión', permiso_institucional: 'Permiso Institucional', expulsion: 'Expulsión' }));
});

describe('crearEstadoPeriodo — validaciones', () => {
  it.each([
    [{}, 400, /obligatorio/],
    [{ id_persona_estudiante: 5, tipo_estado: 'castigo' }, 400, /tipo_estado inválido/],
    [{ id_persona_estudiante: 5, tipo_estado: 'suspension' }, 400, /fecha_inicio/],
    [{ id_persona_estudiante: 5, tipo_estado: 'suspension', fecha_inicio: '2026-11-10' }, 400, /fecha_fin es obligatoria/],
    [{ id_persona_estudiante: 5, tipo_estado: 'permiso_institucional', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-01' }, 400, /anterior/],
  ])('%j → %i', async (body, st, msg) => {
    await rechaza(O.crearEstadoPeriodo(body), st, msg);
    expect(DB.llamadas).toHaveLength(0);
  });

  it('estudiante no encontrado → 404; con expulsión previa → 403', async () => {
    DB.setResolver(() => undefined);
    await rechaza(O.crearEstadoPeriodo({ id_persona_estudiante: 5, tipo_estado: 'expulsion', fecha_inicio: '2026-11-14' }), 404);
    DB.setResolver((q) => (q.tabla === 'persona' ? { id_persona: 5 } : { id: 1 }));
    await rechaza(O.crearEstadoPeriodo({ id_persona_estudiante: 5, tipo_estado: 'expulsion', fecha_inicio: '2026-11-14' }), 403, /expulsión definitiva/);
  });

  it('DEFECTO D-18 (menor): fecha_inicio no se valida en formato; "14/11/2026" se compara como texto y llega a la BD', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'persona') return { id_persona: 5, nombre_completo: 'Ana' };
      if (q.tabla === 'estado_estudiante_periodo' && q.trx) return [{ id_estado_periodo: 1, fecha_inicio: '14/11/2026', fecha_fin: null }];
      if (q.tabla === 'matricula as m') return [];
      return undefined;
    });
    const r = await O.crearEstadoPeriodo({ id_persona_estudiante: 5, tipo_estado: 'expulsion', fecha_inicio: '14/11/2026' });
    const ins = DB.llamadas.find((l) => l.tabla === 'estado_estudiante_periodo' && l.trx);
    expect(DB.argsDe(ins, 'insert')[0][0].fecha_inicio).toBe('14/11/2026');
    expect(r.fecha_inicio).toBe('14/11/2026');
  });
});

describe('crearEstadoPeriodo — flujo feliz', () => {
  const resolver = (q) => {
    if (q.tabla === 'persona' && !q.trx) return { id_persona: 5, nombre_completo: 'Ana' };
    if (q.tabla === 'estado_estudiante_periodo' && !q.trx) return undefined; // sin expulsión previa
    if (q.tabla === 'estado_estudiante_periodo' && q.trx) {
      if (q.ops.some((o) => o.op === 'insert')) return [{ id_estado_periodo: 9, fecha_inicio: new Date(2026, 10, 14), fecha_fin: null }];
      return undefined; // sin solapamiento
    }
    if (q.tabla === 'matricula as m') return [11, 12];
    return 1;
  };

  it('expulsión: cierra matrículas del año, desactiva estudiante y notifica de forma asíncrona', async () => {
    DB.setResolver(resolver);
    const r = await O.crearEstadoPeriodo({ id_persona_estudiante: '5', tipo_estado: 'expulsion', fecha_inicio: '2026-11-14', motivo: '' });
    expect(r).toMatchObject({ id_estado_periodo: 9, fecha_inicio: '2026-11-14', fecha_fin: null, nombre_completo: 'Ana' });
    const upd = DB.llamadas.filter((l) => l.trx && DB.argsDe(l, 'update').length);
    expect(upd.map((u) => [u.tabla, DB.argsDe(u, 'update')[0][0]])).toEqual([
      ['matricula', { estado: 'cancelada' }],
      ['persona', { activo: false }],
    ]);
    const ins = DB.llamadas.find((l) => l.tabla === 'estado_estudiante_periodo' && l.trx && DB.argsDe(l, 'insert').length);
    expect(DB.argsDe(ins, 'insert')[0][0]).toMatchObject({ fecha_fin: null, motivo: null });
    expect(N.notificarEstadoOrientacion).not.toHaveBeenCalled();
    await new Promise((res) => setImmediate(res));
    expect(N.notificarEstadoOrientacion).toHaveBeenCalledWith(expect.objectContaining({ id_persona_estudiante: 5, id_estado_periodo: 9 }));
  });

  it('suspensión con solapamiento → 409 y no inserta', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'estado_estudiante_periodo' && q.trx && !q.ops.some((o) => o.op === 'insert'))
        return { fecha_inicio: '2026-11-12', fecha_fin: '2026-11-13' };
      return resolver(q);
    });
    await rechaza(O.crearEstadoPeriodo({ id_persona_estudiante: 5, tipo_estado: 'suspension', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-15' }), 409);
    expect(DB.llamadas.some((l) => DB.argsDe(l, 'insert').length)).toBe(false);
  });

  it('error al notificar se registra en consola sin afectar la respuesta', async () => {
    N.notificarEstadoOrientacion.mockRejectedValueOnce(new Error('SMTP'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    DB.setResolver(resolver);
    await O.crearEstadoPeriodo({ id_persona_estudiante: 5, tipo_estado: 'permiso_institucional', fecha_inicio: '2026-11-14', fecha_fin: '2026-11-15' });
    await new Promise((res) => setImmediate(res));
    await new Promise((res) => setImmediate(res));
    expect(spy).toHaveBeenCalledWith('[orientacion] Error al notificar por correo:', 'SMTP');
    spy.mockRestore();
  });
});

describe('actualizar / anular / eliminar', () => {
  const conExistente = (existente, extra = () => undefined) => (q) => {
    if (q.tabla === 'estado_estudiante_periodo' && !q.trx && q.ops.some((o) => o.op === 'first')) return existente;
    if (q.tabla === 'estado_estudiante_periodo as e') return filaHist({ ...existente });
    return extra(q);
  };

  it('id inválido → 400; inexistente → 404; expulsión → 403; histórico → 403', async () => {
    await rechaza(O.actualizarEstadoPeriodo('x', {}), 400);
    DB.setResolver(() => undefined);
    await rechaza(O.actualizarEstadoPeriodo(1, {}), 404);
    DB.setResolver(conExistente({ tipo_estado: 'expulsion' }));
    await rechaza(O.actualizarEstadoPeriodo(1, {}), 403, /definitiva/);
    DB.setResolver(conExistente({ tipo_estado: 'suspension', fecha_fin: '2026-11-14' }));
    await rechaza(O.actualizarEstadoPeriodo(1, {}), 403, /histórico/);
  });

  it('actualizar: validaciones de tipo y fechas', async () => {
    DB.setResolver(conExistente({ tipo_estado: 'permiso_institucional', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-30' }));
    await rechaza(O.actualizarEstadoPeriodo(1, { tipo_estado: 'x' }), 400);
    await rechaza(O.actualizarEstadoPeriodo(1, { fecha_fin: null }), 400, /obligatoria/);
    await rechaza(O.actualizarEstadoPeriodo(1, { fecha_fin: '2026-11-01' }), 400, /anterior/);
  });

  it('actualizar permiso (sin transacción) y suspensión (con transacción y exclusión de sí mismo)', async () => {
    DB.setResolver(conExistente({ id_persona_estudiante: 5, tipo_estado: 'permiso_institucional', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-30', motivo: 'viejo' }));
    const r = await O.actualizarEstadoPeriodo(1, { fecha_fin: '2026-12-01' });
    expect(r.id_estado_periodo).toBe(1);
    const upd = DB.llamadas.find((l) => DB.argsDe(l, 'update').length);
    expect(DB.argsDe(upd, 'update')[0][0]).toMatchObject({ fecha_fin: '2026-12-01', motivo: 'viejo' });
    DB.reset();
    DB.setResolver(conExistente({ id_persona_estudiante: 5, tipo_estado: 'suspension', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-30' }));
    await O.actualizarEstadoPeriodo('1', { motivo: 'nuevo' });
    const solape = DB.llamadas.find((l) => l.trx && DB.argsDe(l, 'whereNot').length);
    expect(DB.argsDe(solape, 'whereNot')).toEqual([['id_estado_periodo', 1]]);
    const upd2 = DB.llamadas.find((l) => l.trx && DB.argsDe(l, 'update').length);
    expect(DB.argsDe(upd2, 'update')[0][0].motivo).toBe('nuevo');
  });

  it('anular: vigente → fecha_fin=hoy; futuro → inicio=fin=hoy; ya finalizado → 400; expulsión → 403', async () => {
    DB.setResolver(conExistente({ tipo_estado: 'suspension', fecha_inicio: '2026-11-10', fecha_fin: '2026-11-20' }));
    await O.anularEstadoPeriodo(1);
    let upd = DB.llamadas.find((l) => DB.argsDe(l, 'update').length);
    expect(DB.argsDe(upd, 'update')[0][0]).toMatchObject({ fecha_fin: '2026-11-14' });
    expect(DB.argsDe(upd, 'update')[0][0]).not.toHaveProperty('fecha_inicio');
    DB.reset();
    DB.setResolver(conExistente({ tipo_estado: 'suspension', fecha_inicio: '2026-12-01', fecha_fin: '2026-12-05' }));
    await O.anularEstadoPeriodo(1);
    upd = DB.llamadas.find((l) => DB.argsDe(l, 'update').length);
    expect(DB.argsDe(upd, 'update')[0][0]).toMatchObject({ fecha_inicio: '2026-11-14', fecha_fin: '2026-11-14' });
    DB.setResolver(conExistente({ tipo_estado: 'suspension', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-13' }));
    await rechaza(O.anularEstadoPeriodo(1), 400);
    DB.setResolver(conExistente({ tipo_estado: 'expulsion' }));
    await rechaza(O.anularEstadoPeriodo(1), 403);
    await rechaza(O.anularEstadoPeriodo('z'), 400);
    DB.setResolver(() => undefined);
    await rechaza(O.anularEstadoPeriodo(1), 404);
  });

  it('CORREGIDO D-17: eliminarEstadoPeriodo consulta el tipo antes de borrar; un estado que no es expulsión se elimina', async () => {
    DB.setResolver((q) => (q.ops.some((o) => o.op === 'first') ? { tipo_estado: 'suspension' } : 1));
    const r = await O.eliminarEstadoPeriodo(7);
    expect(r).toEqual({ message: 'Registro eliminado correctamente', id_estado_periodo: 7 });
    expect(DB.llamadas).toHaveLength(2);
    expect(DB.llamadas[1].ops.map((o) => o.op)).toEqual(['where', 'del']);
  });

  it('eliminar: id inválido → 400; inexistente → 404', async () => {
    await rechaza(O.eliminarEstadoPeriodo('a'), 400);
    DB.setResolver(() => 0);
    await rechaza(O.eliminarEstadoPeriodo(1), 404);
  });
});

describe('historial', () => {
  it('banderas es_vigente / es_editable y filtro por sección en memoria', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'estado_estudiante_periodo as e')
        return [
          filaHist({ id_estado_periodo: 1, fecha_fin: '2026-11-20' }),
          filaHist({ id_estado_periodo: 2, fecha_fin: '2026-11-14' }), // termina hoy
          filaHist({ id_estado_periodo: 3, tipo_estado: 'expulsion', fecha_fin: null }),
          filaHist({ id_estado_periodo: 4, tipo_estado: 'permiso_institucional', fecha_fin: null }),
        ];
      if (q.tabla === 'matricula as m') return { id_seccion: 3, nombre_seccion: '7-3', ano_a_cursar: 'septimo' };
      return [];
    });
    const r = await O.listarHistorialOrientacion({ id_seccion: '3', tipo_estado: '', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
    const f = Object.fromEntries(r.registros.map((x) => [x.id_estado_periodo, [x.es_vigente, x.es_editable]]));
    expect(f).toEqual({ 1: [true, true], 2: [false, false], 3: [true, false], 4: [true, false] });
    expect(r.total).toBe(4);
    expect(r.registros[0].tipo_estado_label).toBe('Suspensión');
  });

  it('OBSERVACIÓN O-12: un estado que termina HOY figura como no vigente en el historial, pero obtenerEstadosActivosPorEstudiantes lo trata como activo (fecha_fin >= fecha)', async () => {
    DB.setResolver((q) => (q.tabla === 'estado_estudiante_periodo as e' ? filaHist({ fecha_fin: '2026-11-14' }) : undefined));
    const r = await O.obtenerRegistroHistorialPorId(1);
    expect(r.es_vigente).toBe(false);
    expect(r.nombre_seccion).toBe('Sin sección');
  });

  it('filtros de historial: validaciones y variantes de rango', async () => {
    await rechaza(O.listarHistorialOrientacion({ id_seccion: 'x' }), 400);
    await rechaza(O.listarHistorialOrientacion({ tipo_estado: 'x' }), 400);
    await rechaza(O.listarHistorialOrientacion({ fecha_inicio: '2026-12-01', fecha_fin: '2026-11-01' }), 400);
    DB.setResolver(() => []);
    for (const q of [{ fecha_inicio: '2026-11-01' }, { fecha_fin: '2026-11-30' }, { fecha_inicio: 'mal', tipo_estado: 'expulsion' }]) {
      DB.reset();
      DB.setResolver(() => []);
      const r = await O.listarHistorialOrientacion(q);
      expect(r.total).toBe(0);
    }
    await rechaza(O.obtenerRegistroHistorialPorId('x'), 400);
    DB.setResolver(() => undefined);
    await rechaza(O.obtenerRegistroHistorialPorId(1), 404);
  });

  it('listarEstadosPeriodo: con y sin estudiante, id inválido', async () => {
    DB.setResolver(() => [{ fecha_inicio: new Date(2026, 0, 2), fecha_fin: null }]);
    expect(await O.listarEstadosPeriodo()).toEqual([{ fecha_inicio: '2026-01-02', fecha_fin: null }]);
    await O.listarEstadosPeriodo('5');
    expect(DB.argsDe(DB.llamadas[1], 'where')).toEqual([['e.id_persona_estudiante', 5]]);
    await rechaza(O.listarEstadosPeriodo('x'), 400);
  });
});

describe('buscarEstudiantesOrientacion', () => {
  it('término corto → []; id inválido → 400; id inexistente → []', async () => {
    expect(await O.buscarEstudiantesOrientacion({ q: ' a ' })).toEqual([]);
    await rechaza(O.buscarEstudiantesOrientacion({ id_estudiante: 'x' }), 400);
    DB.setResolver(() => undefined);
    expect(await O.buscarEstudiantesOrientacion({ id_estudiante: 3 })).toEqual([]);
  });

  it('por término: busca por nombre/cédula y enriquece con matrícula y expulsión', async () => {
    DB.setResolver((q) => {
      if (q.tabla === 'persona as p') return [{ id_persona: 1, nombre_completo: 'Ana', cedula: '1-1' }];
      if (q.tabla === 'estado_estudiante_periodo') return { id: 1 };
      if (q.tabla === 'matricula as m') return { nombre_seccion: '7-1' };
      return undefined;
    });
    const r = await O.buscarEstudiantesOrientacion({ q: ' 1 23 ' });
    expect(r).toHaveLength(1);
    const p = DB.llamadas.find((l) => l.tabla === 'persona as p');
    expect(DB.argsDe(p, 'sub.whereRaw')).toEqual([['LOWER(p.nombre_completo) LIKE ?', ['%1 23%']]]);
    expect(DB.argsDe(p, 'sub.orWhereRaw')).toEqual([['p.cedula LIKE ?', ['%123%']]]);
    expect(DB.argsDe(p, 'limit')).toEqual([[5]]);
  });
});

describe('expectativas correctas (antes it.fails; defectos corregidos)', () => {
  it('CORREGIDO D-17 (expectativa correcta): eliminar una expulsión debería rechazarse (403)', async () => {
    DB.setResolver((q) => (q.ops.some((o) => o.op === 'first') ? { tipo_estado: 'expulsion' } : 1));
    await rechaza(O.eliminarEstadoPeriodo(7), 403);
  });
});
