/** Ciclo 11: padresAsistenciaService (reporte del hijo que alimenta el PDF de encargados). BD simulada. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setResolver, reset, llamadas, argsDe } from '../helpers/dbMock.js';
import * as PA from '../../../../backend-node/src/services/padresAsistenciaService.js';

beforeEach(() => reset());
afterEach(() => vi.useRealTimers());

const filaA = (id, fecha, estado, pms = 1) => ({ id_asistencia: id, fecha, estado, id_profesor_materia_seccion: pms, nombre_materia: 'M', nombre_seccion: '7-1' });

function resolver({ autorizado = true, filas = [], bloques = [], estudiante = { id_persona: 5, nombre_completo: 'Hijo', cedula: '1' }, matricula, tutor } = {}) {
  return (q) => {
    if (q.tabla === 'matricula as m') {
      // tutorVisibilidad usa join; obtenerDatosEstudiante usa leftJoin
      if (q.ops.some((o) => o.op === 'leftJoin')) return matricula;
      return autorizado ? { ok: 1 } : undefined;
    }
    if (q.tabla === 'encargado_estudiante') return undefined;
    if (q.tabla === 'asistencia as a') return filas;
    if (q.tabla === 'horarioasignacion as ha') return bloques;
    if (q.tabla === 'persona as p') return estudiante;
    if (q.tabla === 'persona') return tutor;
    return undefined;
  };
}

describe('assertPadrePuedeVerEstudiante', () => {
  it.each(['0', '-1', 'x', null])('id %j → 400', async (v) => {
    const e = await PA.assertPadrePuedeVerEstudiante(1, v).catch((x) => x);
    expect(e.status).toBe(400);
  });
  it('sin vínculo → 403; con vínculo → id numérico', async () => {
    setResolver(resolver({ autorizado: false }));
    expect((await PA.assertPadrePuedeVerEstudiante(1, '5').catch((x) => x)).status).toBe(403);
    setResolver(resolver());
    expect(await PA.assertPadrePuedeVerEstudiante(1, '5')).toBe(5);
  });
});

describe('obtenerReporteAsistenciaPadre', () => {
  it('arma registros con horario, resumen y datos del estudiante/tutor', async () => {
    setResolver(
      resolver({
        filas: [filaA(1, '2026-11-09', 'presente'), filaA(2, new Date(2026, 10, 15), 'ausente'), filaA(3, null, 'tardanza')],
        bloques: [{ id_leccion: 2, hora_inicio: '7:40', hora_fin: '8:20' }],
        matricula: { nombre_seccion: '7-1', ano_a_cursar: 'septimo', anio_curso_lectivo: 2026 },
        tutor: { nombre_completo: 'Mamá' },
      })
    );
    const r = await PA.obtenerReporteAsistenciaPadre(1, '5', '2026-11-01', '2026-11-30');
    expect(r.tutor_nombre).toBe('Mamá');
    expect(r.rango).toEqual({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' });
    expect(r.registros.map((x) => [x.fecha, x.condicion, x.horario_leccion])).toEqual([
      ['2026-11-09', 'Presente', 'Lección 2 (07:40 - 08:20)'],
      ['2026-11-15', 'Ausencia Injustificada', 'Lección 2 (07:40 - 08:20)'],
      [null, 'Tardía', '—'],
    ]);
    expect(r.estudiante).toMatchObject({ nombre_completo: 'Hijo', nombre_seccion: '7-1', ano_a_cursar: 'septimo' });
    expect(r.resumen).toMatchObject({ total_registros: 3, presentes: 1, nivel_asistencia_pct: 33 });
  });

  it('sin bloque programado ese día → "<Día> — sin bloque programado"; sin matrícula → valores por defecto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14));
    setResolver(resolver({ filas: [filaA(1, '2026-11-14', 'presente')], bloques: [], matricula: undefined, tutor: undefined }));
    const r = await PA.obtenerReporteAsistenciaPadre(1, 5);
    expect(r.registros[0].horario_leccion).toBe('Sábado — sin bloque programado');
    expect(r.estudiante).toMatchObject({ nombre_seccion: 'Sin sección', ano_a_cursar: '—', anio_curso_lectivo: 2026 });
    expect(r.tutor_nombre).toBe('Encargado');
  });

  it('estudiante inexistente → 404', async () => {
    setResolver(resolver({ estudiante: null }));
    const e = await PA.obtenerReporteAsistenciaPadre(1, 5, '2026-01-01', '2026-01-31').catch((x) => x);
    expect(e.status).toBe(404);
  });

  it('OBSERVACIÓN O-10 (rendimiento): consulta N+1 — una consulta de horario por cada marca', async () => {
    const filas = Array.from({ length: 50 }, (_, i) => filaA(i, '2026-11-10', 'presente'));
    setResolver(resolver({ filas, matricula: {}, tutor: {} }));
    await PA.obtenerReporteAsistenciaPadre(1, 5, '2026-11-01', '2026-11-30');
    expect(llamadas.filter((l) => l.tabla === 'horarioasignacion as ha')).toHaveLength(50);
  });

  it('filtra por estudiante y rango', async () => {
    setResolver(resolver({ matricula: {}, tutor: {} }));
    await PA.obtenerReporteAsistenciaPadre(1, 5, '2026-11-01', '2026-11-30');
    const q = llamadas.find((l) => l.tabla === 'asistencia as a');
    expect(argsDe(q, 'where')).toEqual([['a.id_persona_estudiante', 5]]);
    expect(argsDe(q, 'whereBetween')).toEqual([['a.fecha', ['2026-11-01', '2026-11-30']]]);
  });
});
