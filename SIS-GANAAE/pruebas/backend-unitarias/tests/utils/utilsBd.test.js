/** Utilidades que consultan la BD (siempre simulada con el doble de knex). */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setResolver, reset, llamadas, argsDe } from '../helpers/dbMock.js';
import AppError from '../../../../backend-node/src/utils/AppError.js';
import * as MV from '../../../../backend-node/src/utils/matriculaVisibilidad.js';
import * as PG from '../../../../backend-node/src/utils/profesorGuiaVisibilidad.js';
import { tutorTieneVisibilidadSobreEstudiante } from '../../../../backend-node/src/utils/tutorVisibilidad.js';
import { esCorreoNotificable, obtenerEncargadoParaNotificacion } from '../../../../backend-node/src/utils/encargadoLookup.js';
import * as EEP from '../../../../backend-node/src/utils/estadoEstudiantePeriodo.js';

beforeEach(() => reset());
afterEach(() => vi.useRealTimers());

describe('tutorVisibilidad', () => {
  it('true por matrícula vigente (no consulta encargado_estudiante)', async () => {
    setResolver((r) => (r.tabla === 'matricula as m' ? { id: 1 } : undefined));
    expect(await tutorTieneVisibilidadSobreEstudiante(2, 3)).toBe(true);
    expect(llamadas).toHaveLength(1);
  });
  it('true por vínculo histórico; false si no hay ninguno', async () => {
    setResolver((r) => (r.tabla === 'encargado_estudiante' ? { id: 1 } : undefined));
    expect(await tutorTieneVisibilidadSobreEstudiante(2, 3)).toBe(true);
    setResolver(() => undefined);
    expect(await tutorTieneVisibilidadSobreEstudiante(2, 3)).toBe(false);
  });
  it('filtra por el año calendario actual', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 10));
    setResolver(() => undefined);
    await tutorTieneVisibilidadSobreEstudiante(2, 3);
    expect(argsDe(llamadas[0], 'where')[0][0]['cl.anio_curso_lectivo']).toBe(2027);
  });
});

describe('profesorGuiaVisibilidad', () => {
  it('ids inválidos → false / [] sin consultar', async () => {
    expect(await PG.profesorEsGuiaDeEstudiante('a', 1)).toBe(false);
    expect(await PG.obtenerIdsEstudiantesVisiblesParaProfesor('x')).toEqual([]);
    expect(await PG.obtenerIdsSeccionesVisiblesParaProfesor(undefined)).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });
  it('profesorEsGuiaDeEstudiante', async () => {
    setResolver(() => ({ x: 1 }));
    expect(await PG.profesorEsGuiaDeEstudiante(1, 2)).toBe(true);
    setResolver(() => undefined);
    expect(await PG.profesorEsGuiaDeEstudiante(1, 2)).toBe(false);
  });
  it('estudiantes visibles: unión sin duplicados', async () => {
    let n = 0;
    setResolver(() => (n++ === 0 ? [1, 2, 3] : [3, 4]));
    expect(await PG.obtenerIdsEstudiantesVisiblesParaProfesor(9)).toEqual([1, 2, 3, 4]);
  });
  it('secciones visibles: normaliza a enteros, descarta no numéricos y duplicados', async () => {
    setResolver((r) => (r.tabla === 'seccion' ? ['1', 2, null] : [2, '3', 'x']));
    expect(await PG.obtenerIdsSeccionesVisiblesParaProfesor('9')).toEqual([1, 2, 3]);
  });
});

describe('matriculaVisibilidad', () => {
  it.each([
    ['super_administrador', true],
    ['administrador', true],
    ['orientador', true],
    ['profesor', false],
    ['epi', false],
    ['padre_de_familia', false],
    [undefined, false],
  ])('tieneLecturaGlobalMatricula(%s) = %s', (rol, r) => expect(MV.tieneLecturaGlobalMatricula(rol)).toBe(r));

  it('profesorTieneVisibilidadMatriculaEstudiante: ids inválidos, guía, asignación, ninguno', async () => {
    expect(await MV.profesorTieneVisibilidadMatriculaEstudiante('x', 1)).toBe(false);
    setResolver(() => ({ ok: 1 }));
    expect(await MV.profesorTieneVisibilidadMatriculaEstudiante(1, 2)).toBe(true);
    let n = 0;
    setResolver(() => (n++ === 0 ? undefined : { ok: 1 }));
    expect(await MV.profesorTieneVisibilidadMatriculaEstudiante(1, 2)).toBe(true);
    setResolver(() => undefined);
    expect(await MV.profesorTieneVisibilidadMatriculaEstudiante(1, 2)).toBe(false);
  });

  const rechaza = async (p, status, msg) => {
    const e = await p.catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.statusCode).toBe(status);
    if (msg) expect(e.message).toMatch(msg);
  };

  it('assertPuedeConsultarEstudianteMatricula: matriz de roles', async () => {
    await rechaza(MV.assertPuedeConsultarEstudianteMatricula(null, 1), 403);
    await rechaza(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'administrador' }, 'abc'), 403);
    await expect(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'orientador' }, 5)).resolves.toBeUndefined();
    setResolver(() => undefined);
    await rechaza(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'padre_de_familia' }, 5), 403, /expediente/);
    await rechaza(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'profesor' }, 5), 403, /grupo guía/);
    await rechaza(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'epi' }, 5), 403, /No autorizado para consultar matrículas/);
    setResolver(() => ({ ok: 1 }));
    await expect(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'padre_de_familia' }, 5)).resolves.toBeUndefined();
    await expect(MV.assertPuedeConsultarEstudianteMatricula({ id: 1, rol: 'profesor' }, 5)).resolves.toBeUndefined();
  });

  it('assertPuedeBuscarEstudiantePorCedula', async () => {
    await expect(MV.assertPuedeBuscarEstudiantePorCedula({ rol: 'administrador' })).resolves.toBeUndefined();
    await expect(MV.assertPuedeBuscarEstudiantePorCedula({ rol: 'padre_de_familia' })).resolves.toBeUndefined();
    await rechaza(MV.assertPuedeBuscarEstudiantePorCedula({ rol: 'profesor' }), 403, /docentes/);
    await rechaza(MV.assertPuedeBuscarEstudiantePorCedula({ rol: 'epi' }), 403);
    await rechaza(MV.assertPuedeBuscarEstudiantePorCedula(undefined), 403);
  });

  it('assertPadrePuedeBuscarCedulaEstudiante', async () => {
    await expect(MV.assertPadrePuedeBuscarCedulaEstudiante({ rol: 'administrador' }, 1)).resolves.toBeUndefined();
    expect(llamadas).toHaveLength(0);
    setResolver(() => undefined);
    await rechaza(MV.assertPadrePuedeBuscarCedulaEstudiante({ rol: 'padre_de_familia', id: 1 }, 2), 403);
    setResolver(() => ({ ok: 1 }));
    await expect(MV.assertPadrePuedeBuscarCedulaEstudiante({ rol: 'padre_de_familia', id: 1 }, 2)).resolves.toBeUndefined();
  });

  it('assertPuedeConsultarMatriculaPorId', async () => {
    await rechaza(MV.assertPuedeConsultarMatriculaPorId({ id: 1, rol: 'administrador' }, 'x'), 400);
    setResolver(() => undefined);
    await rechaza(MV.assertPuedeConsultarMatriculaPorId({ id: 1, rol: 'administrador' }, 9), 404);
    setResolver(() => ({ id_persona_estudiante: 4 }));
    await expect(MV.assertPuedeConsultarMatriculaPorId({ id: 1, rol: 'administrador' }, 9)).resolves.toBeUndefined();
  });

  it('assertPuedeListarMatriculas', async () => {
    for (const rol of ['administrador', 'super_administrador', 'orientador', 'padre_de_familia', 'profesor']) {
      await expect(MV.assertPuedeListarMatriculas({ rol })).resolves.toBeUndefined();
    }
    await rechaza(MV.assertPuedeListarMatriculas({ rol: 'epi' }), 403);
    await rechaza(MV.assertPuedeListarMatriculas(null), 403);
  });
});

describe('encargadoLookup', () => {
  it.each([
    ['ana@gmail.com', true],
    ['  ANA@GMAIL.COM ', true],
    ['', false],
    [null, false],
    ['sin-arroba', false],
    ['precarga.123@liceo.cr', false],
    ['x@pendiente.sistema.local', false],
    ['x@SEED-HISTORIAL.COM', false],
    ['x@seed-historial.test', false],
    ['x@seed-historial.test.cr', true],
  ])('esCorreoNotificable(%j) = %s', (c, r) => expect(esCorreoNotificable(c)).toBe(r));

  it('id inválido → null', async () => {
    expect(await obtenerEncargadoParaNotificacion('abc')).toBeNull();
  });

  it('tutor de matrícula vigente con correo válido y vínculo', async () => {
    setResolver((r) => {
      if (r.tabla === 'matricula as m') return { id_persona_tutor: 50 };
      if (r.tabla === 'persona') return { id_persona: 50, nombre_completo: 'T', correo: 't@x.com' };
      if (r.tabla === 'encargado_estudiante') return { id_encargado_estudiante: 8 };
      return undefined;
    });
    expect(await obtenerEncargadoParaNotificacion(1)).toEqual({ id_persona: 50, nombre_completo: 'T', correo: 't@x.com', id_encargado_estudiante: 8 });
  });

  it('tutor sin vínculo → id_encargado_estudiante null', async () => {
    setResolver((r) => {
      if (r.tabla === 'matricula as m') return { id_persona_tutor: 50 };
      if (r.tabla === 'persona') return { id_persona: 50, nombre_completo: 'T', correo: 't@x.com' };
      return undefined;
    });
    expect((await obtenerEncargadoParaNotificacion(1)).id_encargado_estudiante).toBeNull();
  });

  it('tutor con correo de precarga → cae al encargado histórico', async () => {
    setResolver((r) => {
      if (r.tabla === 'matricula as m') return { id_persona_tutor: 50 };
      if (r.tabla === 'persona') return { id_persona: 50, correo: 'precarga.1@x.com' };
      if (r.tabla === 'encargado_estudiante as ee')
        return { id_encargado_estudiante: 3, id_persona: 60, nombre_completo: 'E', correo: 'e@x.com' };
      return undefined;
    });
    expect((await obtenerEncargadoParaNotificacion(1)).id_persona).toBe(60);
  });

  it('sin matrícula ni encargado notificable → null', async () => {
    setResolver((r) => (r.tabla === 'encargado_estudiante as ee' ? { correo: 'x@pendiente.sistema.local' } : undefined));
    expect(await obtenerEncargadoParaNotificacion(1)).toBeNull();
    setResolver(() => undefined);
    expect(await obtenerEncargadoParaNotificacion(1)).toBeNull();
  });
});

describe('estadoEstudiantePeriodo', () => {
  it('helpers puros', () => {
    expect(EEP.esEstadoBloqueante('suspension')).toBe(true);
    expect(EEP.esEstadoBloqueante('expulsion')).toBe(true);
    expect(EEP.esEstadoBloqueante('permiso_institucional')).toBe(false);
    expect(EEP.estadoAsistenciaForzado('suspension')).toBe('justificado');
    expect(EEP.estadoAsistenciaForzado('expulsion')).toBe('justificado');
    expect(EEP.estadoAsistenciaForzado('permiso_institucional')).toBe('justificado');
    expect(EEP.estadoAsistenciaForzado('otro')).toBeNull();
    expect(EEP.TIPOS_VALIDOS).toEqual(['suspension', 'permiso_institucional', 'expulsion']);
    expect(EEP.fechaToStr(null)).toBeNull();
    expect(EEP.fechaToStr('2026-01-02T00:00:00Z')).toBe('2026-01-02');
    expect(EEP.fechaToStr(new Date(2026, 0, 2))).toBe('2026-01-02');
    expect(EEP.formatFechaEs(null)).toBe('—');
    expect(EEP.formatFechaEs('2026-12-31')).toBe('31/12/2026');
  });

  it('obtenerEstadosActivosPorEstudiantes: entradas vacías/ inválidas no consultan', async () => {
    expect((await EEP.obtenerEstadosActivosPorEstudiantes([], '2026-01-01')).size).toBe(0);
    expect((await EEP.obtenerEstadosActivosPorEstudiantes(null, '2026-01-01')).size).toBe(0);
    expect((await EEP.obtenerEstadosActivosPorEstudiantes([1], '')).size).toBe(0);
    expect((await EEP.obtenerEstadosActivosPorEstudiantes(['x'], '2026-01-01')).size).toBe(0);
    expect(llamadas).toHaveLength(0);
  });

  it('prioridad: expulsión > suspensión > permiso; empate → la última fila gana', async () => {
    setResolver(() => [
      { id_persona_estudiante: 1, tipo_estado: 'permiso_institucional', id_estado_periodo: 10, fecha_inicio: '2026-01-05', fecha_fin: null },
      { id_persona_estudiante: 1, tipo_estado: 'suspension', id_estado_periodo: 11, fecha_inicio: '2026-01-04', fecha_fin: '2026-01-09' },
      { id_persona_estudiante: 1, tipo_estado: 'permiso_institucional', id_estado_periodo: 12, fecha_inicio: '2026-01-03', fecha_fin: null },
      { id_persona_estudiante: 2, tipo_estado: 'raro', id_estado_periodo: 20, fecha_inicio: new Date(2026, 0, 1), fecha_fin: null },
      { id_persona_estudiante: 2, tipo_estado: 'raro2', id_estado_periodo: 21, fecha_inicio: '2026-01-01', fecha_fin: null },
      { id_persona_estudiante: 3, tipo_estado: 'expulsion', id_estado_periodo: 30, fecha_inicio: '2026-01-01', fecha_fin: null },
      { id_persona_estudiante: 3, tipo_estado: 'suspension', id_estado_periodo: 31, fecha_inicio: '2025-12-01', fecha_fin: null },
    ]);
    const m = await EEP.obtenerEstadosActivosPorEstudiantes(['1', 2, 3], '2026-01-06');
    expect(m.get(1).id_estado_periodo).toBe(11);
    expect(m.get(1).fecha_fin).toBe('2026-01-09');
    expect(m.get(2).id_estado_periodo).toBe(21); // prioridad 0 = 0 → reemplaza (>=)
    expect(m.get(3).tipo_estado).toBe('expulsion');
  });

  it('estudianteTieneExpulsionDefinitiva', async () => {
    expect(await EEP.estudianteTieneExpulsionDefinitiva('x')).toBe(false);
    setResolver(() => ({ id: 1 }));
    expect(await EEP.estudianteTieneExpulsionDefinitiva(3)).toBe(true);
    const trx = vi.fn(() => ({ where: () => ({ first: async () => undefined }) }));
    expect(await EEP.estudianteTieneExpulsionDefinitiva(3, trx)).toBe(false);
    expect(trx).toHaveBeenCalledWith('estado_estudiante_periodo');
  });

  it('buscarSuspensionSolapada / validarSuspensionSinSolapamiento', async () => {
    expect(await EEP.buscarSuspensionSolapada('x', '2026-01-01', '2026-01-02')).toBeNull();
    expect(await EEP.buscarSuspensionSolapada(1, null, '2026-01-02')).toBeNull();
    setResolver(() => undefined);
    await EEP.buscarSuspensionSolapada(1, '2026-01-01', '2026-01-10', '7');
    expect(argsDe(llamadas[0], 'whereNot')).toEqual([['id_estado_periodo', 7]]);
    reset();
    setResolver(() => undefined);
    await EEP.buscarSuspensionSolapada(1, '2026-01-01', '2026-01-10', 'abc');
    expect(argsDe(llamadas[0], 'whereNot')).toEqual([]);
    await expect(EEP.validarSuspensionSinSolapamiento(1, '2026-01-01', '2026-01-10')).resolves.toBeUndefined();
    setResolver(() => ({ fecha_inicio: '2026-01-05', fecha_fin: '2026-01-07' }));
    const e = await EEP.validarSuspensionSinSolapamiento(1, '2026-01-01', '2026-01-10').catch((x) => x);
    expect(e.status).toBe(409);
    expect(e.message).toContain('del 05/01/2026 al 07/01/2026');
  });
});
