/** Ciclo 11: justificacionService (commit reciente). BD y transacción simuladas. */
import { describe, it, expect, beforeEach } from 'vitest';
import { setResolver, reset, llamadas, argsDe } from '../helpers/dbMock.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import * as J from '../../../../backend-node/src/services/justificacionService.js';

beforeEach(() => reset());

const ADMIN = { id: 1, rol: 'administrador' };
const PROF = { id: 7, rol: 'profesor' };
const EPI = { id: 9, rol: 'epi' };

const filaJ = (extra = {}) => ({
  id_justificacion: 1,
  id_asistencia: 2,
  tipo_justificacion: 'medica',
  descripcion: 'Cita médica',
  fecha_ingreso: new Date(2026, 2, 5),
  fecha_ausencia: '2026-03-04T00:00:00Z',
  documento_adjunto: '',
  created_by: 3,
  registrado_por_nombre: 'Orientadora',
  registrado_por_rol: 'orientador',
  id_seccion: '4',
  nombre_seccion: '7-1',
  nombre_materia: null,
  id_estudiante: 5,
  nombre_estudiante: 'Ana',
  cedula_estudiante: '1',
  ...extra,
});

const err = async (p, status, msg) => {
  const e = await p.catch((x) => x);
  expect(e).toBeInstanceOf(AppError);
  expect(e.statusCode).toBe(status);
  if (msg) expect(e.message).toMatch(msg);
};

describe('listarJustificaciones — alcance por rol', () => {
  it.each([[null], [EPI], [{ id: 1, rol: 'padre_de_familia' }]])('%j → 403', async (u) => {
    await err(J.listarJustificaciones(u), 403, /permiso/);
  });

  it('admin: sin restricción de sección, paginación y mapeo', async () => {
    setResolver((q) => {
      if (q.tabla === 'seccion') return [{ id_seccion: 4 }];
      if (q.ops.some((o) => o.op === 'count')) return [{ total: '31' }];
      return [filaJ(), filaJ({ id_justificacion: 2, tipo_justificacion: 'otro', created_by: null, documento_adjunto: 'https://x' })];
    });
    const r = await J.listarJustificaciones(ADMIN, { page: '2', limit: '10', busqueda: 'a_%' });
    expect(r).toMatchObject({ total: 31, page: 2, limit: 10, total_pages: 4 });
    expect(r.registros[0]).toMatchObject({
      tipo_justificacion_label: 'Médica',
      fecha_ingreso: '2026-03-05',
      fecha_ausencia: '2026-03-04',
      documento_adjunto: null,
      nombre_materia: null,
      registrado_por: { id_persona: 3, rol_label: 'Orientador' },
    });
    expect(r.registros[1]).toMatchObject({ tipo_justificacion_label: 'otro', registrado_por: null, documento_adjunto: 'https://x' });
    const datos = llamadas.find((l) => l.ops.some((o) => o.op === 'offset'));
    expect(argsDe(datos, 'offset')).toEqual([[10]]);
    expect(argsDe(datos, 'whereIn')).toEqual([]);
    expect(argsDe(datos, 'sub.whereILike')[0][1]).toBe('%a\\_\\%%');
    expect(r.catalogos.tipos.map((t) => t.label)).toEqual(['Médica', 'Personal', 'Institucional']);
  });

  it('profesor sin secciones → lista vacía sin consultar justificaciones', async () => {
    setResolver(() => []);
    const r = await J.listarJustificaciones(PROF);
    expect(r).toMatchObject({ registros: [], total: 0, total_pages: 0 });
    expect(llamadas.some((l) => l.tabla === 'justificacion as j')).toBe(false);
  });

  it('profesor: restringe con whereIn y rechaza secciones ajenas (403)', async () => {
    setResolver((q) => {
      if (q.tabla === 'seccion') return q.ops.some((o) => o.op === 'pluck') ? [4] : [{ id_seccion: 4 }];
      if (q.tabla === 'profesor_materia_seccion as pms') return [];
      if (q.ops.some((o) => o.op === 'count')) return [{ total: '0' }];
      return [];
    });
    await J.listarJustificaciones(PROF, { id_seccion: 4, tipo_justificacion: 'personal', fecha_inicio: '2026-01-01', fecha_fin: '2026-02-01' });
    const datos = llamadas.find((l) => l.ops.some((o) => o.op === 'offset'));
    expect(argsDe(datos, 'whereIn')).toEqual([['pms.id_seccion', [4]]]);
    expect(argsDe(datos, 'where')).toEqual(
      expect.arrayContaining([['pms.id_seccion', 4], ['j.tipo_justificacion', 'personal'], ['a.fecha', '>=', '2026-01-01'], ['a.fecha', '<=', '2026-02-01']])
    );
    reset();
    setResolver((q) => (q.tabla === 'seccion' ? [4] : []));
    await err(J.listarJustificaciones(PROF, { id_seccion: 99 }), 403, /esta sección/);
  });

  it.each([
    [{ fecha_inicio: '2026/01/01' }, 400, /formato/],
    [{ fecha_inicio: '2026-03-01', fecha_fin: '2026-01-01' }, 400, /posterior/],
    [{ id_seccion: '0' }, 400, /id_seccion/],
    [{ tipo_justificacion: 'falsa' }, 400, /tipo_justificacion/],
  ])('filtros %j → %i', async (f, st, msg) => {
    setResolver(() => []);
    await err(J.listarJustificaciones(ADMIN, f), st, msg);
  });
});

describe('obtenerJustificacionPorId', () => {
  it('id inválido → 400; no existe → 404; profesor fuera de alcance → 403; admin OK', async () => {
    await err(J.obtenerJustificacionPorId(ADMIN, 'x'), 400);
    setResolver(() => undefined);
    await err(J.obtenerJustificacionPorId(ADMIN, 1), 404);
    setResolver((q) => (q.tabla === 'justificacion as j' ? filaJ() : [99]));
    await err(J.obtenerJustificacionPorId(PROF, 1), 403);
    setResolver((q) => (q.tabla === 'justificacion as j' ? filaJ() : [4]));
    expect((await J.obtenerJustificacionPorId(PROF, 1)).id_seccion).toBe('4');
    expect((await J.obtenerJustificacionPorId(ADMIN, 1)).estudiante.nombre_completo).toBe('Ana');
  });
});

describe('crearJustificacion', () => {
  const asistencia = { id_asistencia: 2, estado: 'ausente', id_profesor_materia_seccion: 3, fecha: '2026-03-04' };
  const base = { id_asistencia: 2, tipo_justificacion: 'medica', descripcion: 'Cita médica en CCSS' };
  const resolverCrear = (asis = asistencia) => (q) => {
    if (q.tabla === 'asistencia' && !q.trx) return asis;
    if (q.tabla === 'justificacion' && q.trx) return [{ id_justificacion: 50 }];
    if (q.tabla === 'asistencia' && q.trx) return 1;
    if (q.tabla === 'justificacion as j') return filaJ({ id_justificacion: 50 });
    return undefined;
  };

  it('admin crea: inserta en transacción, marca asistencia como justificado y devuelve el registro', async () => {
    setResolver(resolverCrear());
    const r = await J.crearJustificacion(ADMIN, { ...base, documento_adjunto: ' /uploads/x.pdf ' });
    expect(r.id_justificacion).toBe(50);
    const ins = llamadas.find((l) => l.tabla === 'justificacion' && l.trx);
    expect(argsDe(ins, 'insert')[0][0]).toMatchObject({ id_asistencia: 2, tipo_justificacion: 'medica', created_by: 1, documento_adjunto: '/uploads/x.pdf' });
    const upd = llamadas.find((l) => l.tabla === 'asistencia' && l.trx);
    expect(argsDe(upd, 'update')).toEqual([[{ estado: 'justificado' }]]);
  });

  it('usa "motivo" si no hay "descripcion"', async () => {
    setResolver(resolverCrear());
    await J.crearJustificacion(ADMIN, { id_asistencia: 2, tipo_justificacion: 'personal', motivo: 'Asunto familiar' });
    const ins = llamadas.find((l) => l.tabla === 'justificacion' && l.trx);
    expect(argsDe(ins, 'insert')[0][0].descripcion).toBe('Asunto familiar');
  });

  it.each([
    [{ id_asistencia: 'x' }, 400, /id_asistencia/],
    [{ ...base, tipo_justificacion: 'x' }, 400, /tipo_justificacion/],
    [{ ...base, descripcion: '  abc ' }, 400, /al menos 5/],
    [{ ...base, descripcion: 'x'.repeat(2001) }, 400, /2000/],
    [{ ...base, documento_adjunto: 'javascript:alert(1)' }, 400, /http/],
    [{ ...base, documento_adjunto: 'ftp://x' }, 400, /http/],
    [{ ...base, documento_adjunto: 'https://' + 'a'.repeat(500) }, 400, /500/],
  ])('validación %#', async (body, st, msg) => {
    setResolver(resolverCrear());
    await err(J.crearJustificacion(ADMIN, body), st, msg);
  });

  it('asistencia inexistente → 404; estado presente → 400; EPI → 403', async () => {
    setResolver(resolverCrear(null));
    await err(J.crearJustificacion(ADMIN, base), 404);
    setResolver(resolverCrear({ ...asistencia, estado: 'presente' }));
    await err(J.crearJustificacion(ADMIN, base), 400, /ausencias o tardanzas/);
    setResolver(resolverCrear());
    await err(J.crearJustificacion(EPI, base), 403);
  });

  it('profesor sin acceso a la asignación → 403; con acceso (titular) → OK', async () => {
    setResolver((q) => (q.tabla === 'profesor_materia_seccion' ? { id_persona_profesor: 999 } : resolverCrear()(q)));
    await err(J.crearJustificacion(PROF, base), 403, /registro de asistencia/);
    setResolver((q) => (q.tabla === 'profesor_materia_seccion' ? { id_persona_profesor: 7 } : resolverCrear()(q)));
    expect((await J.crearJustificacion(PROF, base)).id_justificacion).toBe(50);
  });

  it('duplicado (23505) → 409; otros errores se relanzan', async () => {
    setResolver((q) => {
      if (q.tabla === 'justificacion' && q.trx) throw Object.assign(new Error('dup'), { code: '23505' });
      return resolverCrear()(q);
    });
    await err(J.crearJustificacion(ADMIN, base), 409);
    setResolver((q) => {
      if (q.tabla === 'justificacion' && q.trx) throw new Error('otro');
      return resolverCrear()(q);
    });
    await expect(J.crearJustificacion(ADMIN, base)).rejects.toThrow('otro');
  });

  it('OBSERVACIÓN O-11: se acepta un enlace http (no https) a cualquier dominio y rutas "/uploads/../" sin normalizar', async () => {
    setResolver(resolverCrear());
    await J.crearJustificacion(ADMIN, { ...base, documento_adjunto: '/uploads/../../etc/passwd' });
    const ins = llamadas.find((l) => l.tabla === 'justificacion' && l.trx);
    expect(argsDe(ins, 'insert')[0][0].documento_adjunto).toBe('/uploads/../../etc/passwd');
  });

  it('obtenerJustificacionPorAsistencia: existe / no existe', async () => {
    setResolver(resolverCrear());
    expect((await J.obtenerJustificacionPorAsistencia(ADMIN, 2)).id_justificacion).toBe(50);
    setResolver((q) => (q.tabla === 'justificacion as j' ? undefined : resolverCrear()(q)));
    expect(await J.obtenerJustificacionPorAsistencia(ADMIN, 2)).toBeNull();
  });
});
