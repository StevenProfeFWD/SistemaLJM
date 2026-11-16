/** Historial de notificaciones (cambio reciente junto al rol EPI). BD simulada. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setResolver, reset, llamadas, argsDe } from '../helpers/dbMock.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import {
  listarNotificaciones,
  ESTADOS_ENVIO_FILTRABLES,
} from '../../../../backend-node/src/services/notificacionHistorialService.js';
import { TIPO_ESTADO_LABEL } from '../../../../backend-node/src/services/orientacionService.js';
import router from '../../../../backend-node/src/routes/notificacionRoutes.js';

beforeEach(() => reset());

const resolverNotif = ({ total = '0', filas = [], profesores = [] } = {}) => (r) => {
  if (r.tabla !== 'notificacion as n') throw new Error(`tabla inesperada ${r.tabla}`);
  if (r.ops.some((o) => o.op === 'count')) return [{ total }];
  if (r.ops.some((o) => o.op === 'distinct')) return profesores;
  return filas;
};
const consultaFilas = () => llamadas.find((r) => r.ops.some((o) => o.op === 'limit'));
const consultaCount = () => llamadas.find((r) => r.ops.some((o) => o.op === 'count'));

describe('listarNotificaciones — filtros y validación', () => {
  it('valores por defecto: página 1, límite 15, sin filtros', async () => {
    setResolver(resolverNotif());
    const r = await listarNotificaciones();
    expect(r.filtros).toEqual({
      fecha_inicio: null,
      fecha_fin: null,
      id_profesor: null,
      id_estudiante: null,
      estado_envio: null,
      busqueda: null,
      page: 1,
      limit: 15,
    });
    expect(r.pagination).toEqual({ total_registros: 0, pagina_actual: 1, total_paginas: 0, limit: 15 });
    expect(argsDe(consultaFilas(), 'offset')).toEqual([[0]]);
  });

  it('paginación: límite máximo 100, offset = (page-1)*limit, total_paginas redondea hacia arriba', async () => {
    setResolver(resolverNotif({ total: '201' }));
    const r = await listarNotificaciones({ page: '3', limit: '500' });
    expect(r.pagination).toEqual({ total_registros: 201, pagina_actual: 3, total_paginas: 3, limit: 100 });
    expect(argsDe(consultaFilas(), 'limit')).toEqual([[100]]);
    expect(argsDe(consultaFilas(), 'offset')).toEqual([[200]]);
  });

  it.each([['0'], ['-1'], ['abc']])('page/limit inválidos (%s) usan los valores por defecto', async (v) => {
    setResolver(resolverNotif());
    const r = await listarNotificaciones({ page: v, limit: v });
    expect(r.filtros.page).toBe(1);
    expect(r.filtros.limit).toBe(15);
  });

  it('aplica todos los filtros a ambas consultas (count y datos)', async () => {
    setResolver(resolverNotif());
    await listarNotificaciones({
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-01-31',
      id_profesor: '4',
      id_estudiante: 9,
      estado_envio: ' FALLIDO ',
      busqueda: '  Ana  ',
    });
    for (const q of [consultaFilas(), consultaCount()]) {
      expect(argsDe(q, 'where')).toEqual(
        expect.arrayContaining([
          ['n.fecha_envio', '>=', '2026-01-01'],
          ['pms.id_persona_profesor', 4],
          ['ee.id_persona_estudiante', 9],
          ['n.estado_envio', 'fallido'],
        ])
      );
      expect(argsDe(q, 'whereRaw')).toEqual([["n.fecha_envio < (?::date + INTERVAL '1 day')", ['2026-01-31']]]);
      expect(argsDe(q, 'sub.whereILike')).toEqual([['est.nombre_completo', '%Ana%']]);
      expect(argsDe(q, 'sub.orWhereILike')).toEqual([['est.cedula', '%Ana%']]);
    }
  });

  it('búsqueda escapa comodines LIKE (%, _, \\) y se limita a 100 caracteres', async () => {
    setResolver(resolverNotif());
    await listarNotificaciones({ busqueda: '50%_a\\b' });
    expect(argsDe(consultaFilas(), 'sub.whereILike')[0][1]).toBe('%50\\%\\_a\\\\b%');
    reset();
    setResolver(resolverNotif());
    const r = await listarNotificaciones({ busqueda: 'x'.repeat(300) });
    expect(r.filtros.busqueda).toHaveLength(100);
  });

  it('búsqueda solo con espacios → null (sin filtro)', async () => {
    setResolver(resolverNotif());
    const r = await listarNotificaciones({ busqueda: '    ' });
    expect(r.filtros.busqueda).toBeNull();
    expect(argsDe(consultaFilas(), 'sub.whereILike')).toEqual([]);
  });

  it.each([
    [{ fecha_inicio: '01/01/2026' }, /fecha_inicio debe tener el formato/],
    [{ fecha_fin: 'mañana' }, /fecha_fin debe tener el formato/],
    [{ fecha_inicio: '2026-02-01', fecha_fin: '2026-01-01' }, /posterior/],
    [{ id_profesor: '0' }, /id_profesor inválido/],
    [{ id_profesor: 'x' }, /id_profesor inválido/],
    [{ id_estudiante: '-3' }, /id_estudiante inválido/],
    [{ estado_envio: 'pendiente' }, /estado_envio inválido/],
    [{ estado_envio: "enviado' OR 1=1" }, /estado_envio inválido/],
  ])('%j → AppError 400', async (q, msg) => {
    const e = await listarNotificaciones(q).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(400);
    expect(e.message).toMatch(msg);
    expect(llamadas).toHaveLength(0);
  });

  it('DEFECTO D-15 (menor): fechas se truncan a 10 caracteres y no se valida que existan (2026-02-31, "2026-01-01xyz")', async () => {
    setResolver(resolverNotif());
    const r = await listarNotificaciones({ fecha_inicio: '2026-01-01xyz', fecha_fin: '2026-02-31' });
    expect(r.filtros.fecha_inicio).toBe('2026-01-01');
    expect(r.filtros.fecha_fin).toBe('2026-02-31'); // PostgreSQL rechazaría '2026-02-31'::date → 500
  });

  it('ids con sufijo no numérico se aceptan ("4abc" → 4), igual que D-03', async () => {
    setResolver(resolverNotif());
    expect((await listarNotificaciones({ id_profesor: '4abc' })).filtros.id_profesor).toBe(4);
  });

  it('id vacío ("") se ignora; null NO se ignora y da 400 (inconsistencia menor)', async () => {
    setResolver(resolverNotif());
    expect((await listarNotificaciones({ id_profesor: '' })).filtros.id_profesor).toBeNull();
    const e = await listarNotificaciones({ id_profesor: null }).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
  });

  it('ESTADOS_ENVIO_FILTRABLES', () => {
    expect(ESTADOS_ENVIO_FILTRABLES).toEqual(['enviado', 'fallido']);
  });
});

describe('listarNotificaciones — mapeo de filas (describirEvento/mapearFila)', () => {
  const base = {
    id_notificacion: 1,
    fecha_envio: '2026-03-01T10:00:00Z',
    estado_envio: 'enviado',
    observacion: null,
    estudiante_cedula: '1-1',
    estudiante_nombre: 'Ana',
    destinatario_email: 'p@x.com',
    nombre_seccion: '7-1',
    id_profesor: 5,
    profesor_nombre: 'Prof',
  };

  it('asistencia → Ausencia Injustificada con profesor emisor', async () => {
    setResolver(resolverNotif({ total: '1', filas: [{ ...base, id_asistencia: 3 }], profesores: [{ id_persona: 5 }] }));
    const r = await listarNotificaciones();
    expect(r.data[0]).toEqual({
      id_notificacion: 1,
      fecha_envio: base.fecha_envio,
      destinatario_email: 'p@x.com',
      asunto: 'Control de Asistencia: Reporte de ausencia injustificada de Ana',
      estado_envio: 'enviado',
      mensaje_error: null,
      estudiante: { cedula: '1-1', nombre_completo: 'Ana', seccion: '7-1' },
      profesor_emisor: { nombre_completo: 'Prof' },
      tipo_evento: 'Ausencia Injustificada',
    });
    expect(r.catalogos.profesores).toEqual([{ id_persona: 5 }]);
  });

  it('estado de orientación: expulsión, suspensión (etiqueta), tipo desconocido y sin tipo', async () => {
    const filas = [
      { ...base, id_estado_periodo: 1, tipo_estado: 'expulsion' },
      { ...base, id_estado_periodo: 2, tipo_estado: 'suspension' },
      { ...base, id_estado_periodo: 3, tipo_estado: 'raro' },
      { ...base, id_estado_periodo: 4, tipo_estado: null, estudiante_nombre: null },
    ];
    setResolver(resolverNotif({ total: '4', filas }));
    const r = await listarNotificaciones();
    expect(r.data.map((d) => d.tipo_evento)).toEqual(['Expulsión', TIPO_ESTADO_LABEL.suspension, 'raro', 'Estado especial']);
    expect(r.data[0].asunto).toBe('Orientación: Expulsión definitiva de Ana');
    expect(r.data[3].asunto).toBe('Orientación: Estado especial registrado para Estudiante');
  });

  it('sin origen → notificación del sistema; fallido con y sin observación; sin sección/destinatario/profesor', async () => {
    const filas = [
      { ...base, estado_envio: 'fallido', observacion: 'SMTP 550', nombre_seccion: null, destinatario_email: null, id_profesor: null },
      { ...base, estado_envio: 'fallido', observacion: null },
    ];
    setResolver(resolverNotif({ total: '2', filas }));
    const r = await listarNotificaciones();
    expect(r.data[0]).toMatchObject({
      tipo_evento: 'Notificación del sistema',
      asunto: 'SMTP 550',
      mensaje_error: 'SMTP 550',
      destinatario_email: null,
      profesor_emisor: null,
      estudiante: { seccion: 'Sin sección' },
    });
    expect(r.data[1].mensaje_error).toBe('Error de envío');
    expect(r.data[1].asunto).toBe('Notificación del sistema');
  });

  it('total no numérico → 0', async () => {
    setResolver(resolverNotif({ total: null }));
    expect((await listarNotificaciones()).pagination.total_registros).toBe(0);
  });
});

describe('notificacionRoutes — autorización (verificarLecturaNotificaciones)', () => {
  const pila = router.stack[0].route.stack.map((s) => s.handle);
  const mw = pila[1];
  const correr = (user) => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    const next = vi.fn();
    mw({ user }, res, next);
    return { res, next };
  };

  it('ruta GET /notificaciones con token + rol + handler', () => {
    expect(router.stack[0].route.path).toBe('/notificaciones');
    expect(pila).toHaveLength(3);
  });

  it.each([
    ['administrador', true],
    ['super_administrador', true],
    ['orientador', true],
    ['epi', false],
    ['profesor', false],
    ['padre_de_familia', false],
  ])('rol %s → permitido=%s', (rol, ok) => {
    const { res, next } = correr({ rol });
    if (ok) expect(next).toHaveBeenCalled();
    else expect(res.status).toHaveBeenCalledWith(403);
  });

  it('sin req.user → 403 (no lanza)', () => {
    expect(correr(undefined).res.status).toHaveBeenCalledWith(403);
  });
});
