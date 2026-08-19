import db from '../db/knex.js';
import { parseRangoFechas } from './padresAsistenciaService.js';
import {
  contarEstadosAsistencia,
  calcularMetricasAnaliticas,
  etiquetaEstadoOficial,
} from '../utils/estadoAsistencia.js';

function parseFiltrosReportes(query) {
  const idSeccion = query.id_seccion != null && String(query.id_seccion).trim() !== ''
    ? parseInt(query.id_seccion, 10)
    : null;
  const idMateria = query.id_materia != null && String(query.id_materia).trim() !== ''
    ? parseInt(query.id_materia, 10)
    : null;

  if (idSeccion != null && !Number.isInteger(idSeccion)) {
    const err = new Error('id_seccion inválido');
    err.status = 400;
    throw err;
  }
  if (idMateria != null && !Number.isInteger(idMateria)) {
    const err = new Error('id_materia inválido');
    err.status = 400;
    throw err;
  }

  const rango = parseRangoFechas(query.fecha_inicio, query.fecha_fin);

  return {
    id_seccion: idSeccion,
    id_materia: idMateria,
    ...rango,
  };
}

function queryAsistenciaBase(filtros) {
  let q = db('asistencia as a')
    .join('profesor_materia_seccion as pms', 'a.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
    .join('materia as mat', 'pms.id_materia', 'mat.id_materia')
    .join('seccion as sec', 'pms.id_seccion', 'sec.id_seccion')
    .join('persona as est', 'a.id_persona_estudiante', 'est.id_persona')
    .whereBetween('a.fecha', [filtros.fecha_inicio, filtros.fecha_fin]);

  if (filtros.id_seccion != null) {
    q = q.where('pms.id_seccion', filtros.id_seccion);
  }
  if (filtros.id_materia != null) {
    q = q.where('pms.id_materia', filtros.id_materia);
  }

  return q;
}

function fechaToStr(fecha) {
  if (!fecha) return '';
  if (typeof fecha === 'string') return fecha.slice(0, 10);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function agruparMetricas(filas, claveId, claveNombre) {
  const grupos = new Map();

  for (const f of filas) {
    const id = f[claveId];
    if (!grupos.has(id)) {
      grupos.set(id, {
        [claveId]: id,
        [claveNombre]: f[claveNombre],
        registros: [],
      });
    }
    grupos.get(id).registros.push(f);
  }

  return [...grupos.values()]
    .map((g) => {
      const conteos = contarEstadosAsistencia(g.registros);
      const metricas = calcularMetricasAnaliticas(conteos);
      return {
        [claveId]: g[claveId],
        [claveNombre]: g[claveNombre],
        total_registros: metricas.total_registros,
        nivel_asistencia_pct: metricas.nivel_asistencia_pct,
        puntualidad_pct: metricas.puntualidad_pct,
        tardias_pct: metricas.tardias_pct,
        ausencias_totales: metricas.ausencias_totales,
      };
    })
    .sort((a, b) => (a[claveNombre] || '').localeCompare(b[claveNombre] || ''));
}

export async function obtenerEstadisticasReportes(query) {
  const filtros = parseFiltrosReportes(query);

  const filas = await queryAsistenciaBase(filtros)
    .select(
      'a.id_asistencia',
      'a.fecha',
      'a.estado',
      'est.id_persona as id_estudiante',
      'est.nombre_completo',
      'sec.id_seccion',
      'sec.nombre_seccion',
      'mat.id_materia',
      'mat.nombre_materia'
    )
    .orderBy('a.fecha', 'desc')
    .orderBy('est.nombre_completo', 'asc');

  const conteosGlobales = contarEstadosAsistencia(filas);
  const kpis = calcularMetricasAnaliticas(conteosGlobales);

  const porSeccion = agruparMetricas(filas, 'id_seccion', 'nombre_seccion');
  const porMateria = agruparMetricas(filas, 'id_materia', 'nombre_materia');

  const nivelPromedioSecciones = porSeccion.length > 0
    ? Math.round(
      porSeccion.reduce((s, x) => s + x.nivel_asistencia_pct, 0) / porSeccion.length
    )
    : kpis.nivel_asistencia_pct;

  const matrizExportacion = filas.map((f) => ({
    nombre: f.nombre_completo,
    fecha: fechaToStr(f.fecha),
    seccion: f.nombre_seccion,
    materia: f.nombre_materia,
    condicion: etiquetaEstadoOficial(f.estado),
    estado: f.estado,
  }));

  const [secciones, materias] = await Promise.all([
    db('seccion').select('id_seccion', 'nombre_seccion').orderBy('nombre_seccion'),
    db('materia').select('id_materia', 'nombre_materia').orderBy('nombre_materia'),
  ]);

  return {
    filtros: {
      id_seccion: filtros.id_seccion,
      id_materia: filtros.id_materia,
      fecha_inicio: filtros.fecha_inicio,
      fecha_fin: filtros.fecha_fin,
    },
    kpis: {
      ...kpis,
      nivel_asistencia_promedio: nivelPromedioSecciones,
    },
    por_seccion: porSeccion,
    por_materia: porMateria,
    distribucion_ausencias: kpis.distribucion_ausencias,
    matriz_exportacion: matrizExportacion,
    catalogos: { secciones, materias },
  };
}

export async function obtenerAlertasPermanencia(query) {
  const filtros = parseFiltrosReportes(query);

  const filas = await queryAsistenciaBase(filtros).select(
    'est.id_persona as id_estudiante',
    'est.nombre_completo',
    'sec.id_seccion',
    'sec.nombre_seccion',
    'a.estado'
  );

  const anio = new Date().getFullYear();
  const matriculasVigentes = await db('matricula as m')
    .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
    .leftJoin('seccion as s', 'm.id_seccion', 's.id_seccion')
    .where('cl.anio_curso_lectivo', anio)
    .select('m.id_persona_estudiante', 's.nombre_seccion', 's.id_seccion');

  const seccionPorEstudiante = new Map(
    matriculasVigentes.map((m) => [m.id_persona_estudiante, m])
  );

  const acumulado = new Map();

  for (const f of filas) {
    const id = f.id_estudiante;
    if (!acumulado.has(id)) {
      const mat = seccionPorEstudiante.get(id);
      acumulado.set(id, {
        id_estudiante: id,
        nombre_completo: f.nombre_completo,
        id_seccion: mat?.id_seccion ?? f.id_seccion,
        nombre_seccion: mat?.nombre_seccion ?? f.nombre_seccion ?? '—',
        tardias: 0,
        ausencias: 0,
      });
    }
    const row = acumulado.get(id);
    const e = String(f.estado || '').toLowerCase();
    if (e === 'tardanza') row.tardias += 1;
    if (e === 'justificado' || e === 'ausente') row.ausencias += 1;
  }

  const UMBRAL = 3;
  const alertas = [...acumulado.values()]
    .filter((s) => s.tardias >= UMBRAL || s.ausencias >= UMBRAL)
    .map((s) => ({
      ...s,
      en_riesgo_inmediato: true,
      motivo:
        s.tardias >= UMBRAL && s.ausencias >= UMBRAL
          ? 'Tardías y ausencias acumuladas'
          : s.tardias >= UMBRAL
            ? 'Tardías acumuladas'
            : 'Ausencias acumuladas',
    }))
    .sort((a, b) => {
      const scoreA = a.ausencias * 2 + a.tardias;
      const scoreB = b.ausencias * 2 + b.tardias;
      return scoreB - scoreA;
    });

  return {
    filtros: {
      id_seccion: filtros.id_seccion,
      id_materia: filtros.id_materia,
      fecha_inicio: filtros.fecha_inicio,
      fecha_fin: filtros.fecha_fin,
    },
    umbrales: { tardias: UMBRAL, ausencias: UMBRAL },
    total_alertas: alertas.length,
    alertas,
  };
}
