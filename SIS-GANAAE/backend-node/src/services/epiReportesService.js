/**
 * Reportes de asistencia del Equipo de Permanencia Estudiantil (EPI).
 * Conteo por sección y materia en un periodo semanal, mensual, anual o personalizado.
 */
import db from '../db/knex.js';
import AppError from '../utils/AppError.js';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PERIODOS_EPI = ['semanal', 'mensual', 'anual', 'personalizado'];

const ETIQUETA_PERIODO = {
  semanal: 'Semanal',
  mensual: 'Mensual',
  anual: 'Anual',
  personalizado: 'Personalizado',
};

/** Máximo de un id en columnas INTEGER de PostgreSQL (int4). */
const INT4_MAX = 2147483647;
/** Amplitud máxima de un periodo personalizado (un año, incluido bisiesto). */
const MAX_DIAS_PERSONALIZADO = 366;
const MS_DIA = 24 * 60 * 60 * 1000;
/** Zona horaria del colegio: "hoy" se calcula aquí aunque el servidor corra en UTC. */
const ZONA_HORARIA_COLEGIO = 'America/Costa_Rica';

/** Crea una fecha UTC respetando años de 0 a 99 (Date.UTC los mapea a 1900-1999). */
function fechaUtc(y, m, d) {
  const f = new Date(Date.UTC(2000, m, d));
  f.setUTCFullYear(y, m, d);
  return f;
}

function isoDesdeUtc(d) {
  const y = d.getUTCFullYear();
  if (y < 0 || y > 9999) throw new AppError('Fecha fuera de rango', 400);
  return `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function parseFechaUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return fechaUtc(y, m - 1, d);
}

/** true si la cadena es AAAA-MM-DD y la fecha existe en el calendario (rechaza 2026-02-31, mes 13…). */
function esFechaIsoValida(valor) {
  if (typeof valor !== 'string' || !FECHA_RE.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const f = fechaUtc(y, m - 1, d);
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Los parámetros de query pueden llegar como arreglo u objeto (?x[]=a, ?x=a&x=b, ?x[k]=a)
 * con el parser "extended" de Express. Solo se aceptan valores simples; lo demás es 400.
 */
function valorUnico(valor, nombre) {
  if (Array.isArray(valor) || (valor !== null && typeof valor === 'object')) {
    throw new AppError(`${nombre} debe indicarse una sola vez y como texto`, 400);
  }
  return valor;
}

function hoyIso() {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_COLEGIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Entero positivo estricto (solo dígitos) dentro del rango int4; vacío → null. */
function parseEntero(valorRaw, nombre) {
  const valor = valorUnico(valorRaw, nombre);
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  if (!/^\d+$/.test(texto)) throw new AppError(`${nombre} inválido`, 400);
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n < 1 || n > INT4_MAX) throw new AppError(`${nombre} inválido`, 400);
  return n;
}

/**
 * Calcula el rango de fechas según el tipo de periodo.
 * - semanal: lunes a domingo de la semana que contiene fecha_referencia
 * - mensual: mes completo de fecha_referencia
 * - anual: año calendario de fecha_referencia
 * - personalizado: fecha_inicio / fecha_fin explícitas
 */
export function calcularRangoPeriodo(query = {}) {
  const periodoRaw = valorUnico(query.periodo, 'periodo');
  const fechaReferencia = valorUnico(query.fecha_referencia, 'fecha_referencia');
  const fechaInicio = valorUnico(query.fecha_inicio, 'fecha_inicio');
  const fechaFin = valorUnico(query.fecha_fin, 'fecha_fin');

  // Sin periodo → mensual (valor por defecto). Se toleran mayúsculas/espacios; un valor desconocido es un error.
  const textoPeriodo = periodoRaw == null ? '' : String(periodoRaw).trim().toLowerCase();
  const tipo = textoPeriodo === '' ? 'mensual' : textoPeriodo;
  if (!PERIODOS_EPI.includes(tipo)) {
    throw new AppError(`Periodo inválido. Use: ${PERIODOS_EPI.join(', ')}`, 400);
  }

  if (tipo === 'personalizado') {
    if (!esFechaIsoValida(fechaInicio) || !esFechaIsoValida(fechaFin)) {
      throw new AppError('Indique fecha de inicio y fin válidas (AAAA-MM-DD)', 400);
    }
    if (fechaInicio < '0001-01-01') {
      throw new AppError('Fecha fuera de rango', 400); // PostgreSQL no tiene año 0
    }
    if (fechaInicio > fechaFin) {
      throw new AppError('La fecha de inicio no puede ser posterior a la fecha de fin', 400);
    }
    const dias = Math.round((parseFechaUtc(fechaFin) - parseFechaUtc(fechaInicio)) / MS_DIA) + 1;
    if (dias > MAX_DIAS_PERSONALIZADO) {
      throw new AppError(
        `El periodo personalizado no puede superar ${MAX_DIAS_PERSONALIZADO} días. Use el periodo anual o divida el rango.`,
        400
      );
    }
    return { periodo: tipo, fecha_inicio: fechaInicio, fecha_fin: fechaFin };
  }

  let ref;
  if (fechaReferencia == null || String(fechaReferencia).trim() === '') {
    ref = hoyIso();
  } else if (esFechaIsoValida(fechaReferencia)) {
    ref = fechaReferencia;
  } else {
    throw new AppError('Fecha de referencia inválida (AAAA-MM-DD)', 400);
  }

  const d = parseFechaUtc(ref);
  const y = d.getUTCFullYear();
  if (y < 1) throw new AppError('Fecha de referencia fuera de rango', 400); // PostgreSQL no tiene año 0
  const m = d.getUTCMonth();
  const anio = String(y).padStart(4, '0');

  if (tipo === 'semanal') {
    const diaSemana = (d.getUTCDay() + 6) % 7; // lunes = 0
    const lunes = fechaUtc(y, m, d.getUTCDate() - diaSemana);
    const domingo = fechaUtc(y, m, d.getUTCDate() - diaSemana + 6);
    return { periodo: tipo, fecha_inicio: isoDesdeUtc(lunes), fecha_fin: isoDesdeUtc(domingo) };
  }

  if (tipo === 'anual') {
    return { periodo: tipo, fecha_inicio: `${anio}-01-01`, fecha_fin: `${anio}-12-31` };
  }

  return {
    periodo: tipo,
    fecha_inicio: isoDesdeUtc(fechaUtc(y, m, 1)),
    fecha_fin: isoDesdeUtc(fechaUtc(y, m + 1, 0)),
  };
}

function totalesVacios() {
  return {
    total: 0,
    presentes: 0,
    tardias: 0,
    ausencias_justificadas: 0,
    ausencias_injustificadas: 0,
    otros: 0,
    porcentaje_asistencia: 0,
  };
}

function sumarEstado(totales, estado, cantidad) {
  totales.total += cantidad;
  switch (String(estado || '').toLowerCase()) {
    case 'presente':
      totales.presentes += cantidad;
      break;
    case 'tardanza':
      totales.tardias += cantidad;
      break;
    case 'justificado':
      totales.ausencias_justificadas += cantidad;
      break;
    case 'ausente':
      totales.ausencias_injustificadas += cantidad;
      break;
    default:
      totales.otros += cantidad;
  }
}

/** % de asistencia = (presentes + tardías) / total de registros, con un decimal. */
function cerrarTotales(totales) {
  // Se multiplica antes de dividir para evitar errores de coma flotante (50,75 % → 50.8, no 50.7).
  totales.porcentaje_asistencia = totales.total > 0
    ? Math.round(((totales.presentes + totales.tardias) * 1000) / totales.total) / 10
    : 0;
  return totales;
}

// Collator reutilizable: mismo orden que localeCompare('es', { numeric: true }) pero mucho más rápido en listas grandes.
const COLLATOR_ES = new Intl.Collator('es', { numeric: true });

function compararNombre(a, b) {
  return COLLATOR_ES.compare(String(a || ''), String(b || ''));
}

/** Estados que se listan en el detalle diario (incidencias). */
const ESTADOS_INCIDENCIA = ['tardanza', 'ausente', 'justificado'];

const ORDEN_CONDICION = {
  ausente: 0,
  tardanza: 1,
  justificado: 2,
  presente: 3,
};

const ETIQUETA_CONDICION = {
  presente: 'Presente',
  tardanza: 'Tardía',
  justificado: 'Ausencia justificada',
  ausente: 'Ausencia injustificada',
  permiso_especial: 'Permiso especial',
  suspendido: 'Suspendido',
  expulsado: 'Expulsado',
};

function fechaAIso(fecha) {
  if (!fecha) return '';
  if (typeof fecha === 'string') return fecha.slice(0, 10);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

/**
 * Detalle día por día: fecha → sección → estudiante/condición con sus materias.
 * Sin estudiante seleccionado solo se listan incidencias (tardías y ausencias);
 * con un estudiante seleccionado se listan todas sus marcas.
 */
function construirDetalleDiario(filas) {
  const porFecha = new Map();

  for (const f of filas) {
    const fecha = fechaAIso(f.fecha);
    if (!porFecha.has(fecha)) porFecha.set(fecha, new Map());
    const secciones = porFecha.get(fecha);
    if (!secciones.has(f.id_seccion)) {
      secciones.set(f.id_seccion, { nombre_seccion: f.nombre_seccion, registros: new Map() });
    }
    const estado = String(f.estado || '').toLowerCase();
    const clave = `${f.id_estudiante}|${estado}`;
    const registros = secciones.get(f.id_seccion).registros;
    if (!registros.has(clave)) {
      registros.set(clave, {
        id_estudiante: f.id_estudiante,
        nombre_completo: f.nombre_completo,
        cedula: f.cedula,
        estado,
        condicion: ETIQUETA_CONDICION[estado] || estado,
        materias: [],
      });
    }
    const reg = registros.get(clave);
    if (!reg.materias.includes(f.nombre_materia)) reg.materias.push(f.nombre_materia);
  }

  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, secciones]) => ({
      fecha,
      secciones: [...secciones.values()]
        .map((sec) => ({
          nombre_seccion: sec.nombre_seccion,
          registros: [...sec.registros.values()].sort(
            (a, b) =>
              (ORDEN_CONDICION[a.estado] ?? 9) - (ORDEN_CONDICION[b.estado] ?? 9) ||
              compararNombre(a.nombre_completo, b.nombre_completo)
          ),
        }))
        .sort((a, b) => compararNombre(a.nombre_seccion, b.nombre_seccion)),
    }));
}

/**
 * Estudiantes de una sección: matriculados en ella en el año indicado
 * o con marcas de asistencia en esa sección durante ese año.
 */
export async function listarEstudiantesSeccionEpi(idSeccionRaw, query = {}) {
  const idSeccion = parseEntero(idSeccionRaw, 'id_seccion');
  if (idSeccion == null) throw new AppError('id_seccion requerido', 400);
  const anioTexto = String(valorUnico(query.anio, 'anio') ?? '').trim();
  let anio;
  if (anioTexto === '') {
    anio = Number(hoyIso().slice(0, 4));
  } else if (/^\d{4}$/.test(anioTexto) && Number(anioTexto) >= 1) {
    anio = Number(anioTexto);
  } else {
    throw new AppError('anio inválido (AAAA)', 400);
  }
  const anioIso = String(anio).padStart(4, '0');

  const [matriculados, conAsistencia] = await Promise.all([
    db('matricula as m')
      .join('curso_lectivo as cl', 'm.id_curso_lectivo', 'cl.id_curso_lectivo')
      .join('persona as p', 'm.id_persona_estudiante', 'p.id_persona')
      .where('m.id_seccion', idSeccion)
      .where('cl.anio_curso_lectivo', anio)
      .whereNot('m.estado', 'cancelada')
      .distinct('p.id_persona as id_estudiante', 'p.nombre_completo', 'p.cedula'),
    db('asistencia as a')
      .join('profesor_materia_seccion as pms', 'a.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
      .join('persona as p', 'a.id_persona_estudiante', 'p.id_persona')
      .where('pms.id_seccion', idSeccion)
      .whereBetween('a.fecha', [`${anioIso}-01-01`, `${anioIso}-12-31`])
      .distinct('p.id_persona as id_estudiante', 'p.nombre_completo', 'p.cedula'),
  ]);

  const unicos = new Map();
  for (const e of [...matriculados, ...conAsistencia]) unicos.set(e.id_estudiante, e);
  return {
    id_seccion: idSeccion,
    anio,
    estudiantes: [...unicos.values()].sort((a, b) => compararNombre(a.nombre_completo, b.nombre_completo)),
  };
}

export async function obtenerReporteAsistenciaEpi(query = {}, { incluirDetalle = false } = {}) {
  const rango = calcularRangoPeriodo(query);
  const idSeccion = parseEntero(query.id_seccion, 'id_seccion');
  const idMateria = parseEntero(query.id_materia, 'id_materia');
  const idEstudiante = parseEntero(query.id_estudiante, 'id_estudiante');

  const base = () => {
    let q = db('asistencia as a')
      .join('profesor_materia_seccion as pms', 'a.id_profesor_materia_seccion', 'pms.id_profesor_materia_seccion')
      .join('materia as mat', 'pms.id_materia', 'mat.id_materia')
      .join('seccion as sec', 'pms.id_seccion', 'sec.id_seccion')
      .whereBetween('a.fecha', [rango.fecha_inicio, rango.fecha_fin]);
    if (idSeccion != null) q = q.where('pms.id_seccion', idSeccion);
    if (idMateria != null) q = q.where('pms.id_materia', idMateria);
    if (idEstudiante != null) q = q.where('a.id_persona_estudiante', idEstudiante);
    return q;
  };

  const consultaDetalle = () => {
    let q = base()
      .join('persona as est', 'a.id_persona_estudiante', 'est.id_persona')
      .select(
        'a.fecha',
        'a.estado',
        'sec.id_seccion',
        'sec.nombre_seccion',
        'mat.nombre_materia',
        'est.id_persona as id_estudiante',
        'est.nombre_completo',
        'est.cedula'
      )
      .orderBy('a.fecha', 'asc')
      .orderBy('mat.nombre_materia', 'asc');
    if (idEstudiante == null) q = q.whereIn('a.estado', ESTADOS_INCIDENCIA);
    return q;
  };

  const [filas, secciones, materias, filasDetalle, estudianteSel] = await Promise.all([
    base()
      .groupBy('sec.id_seccion', 'sec.nombre_seccion', 'mat.id_materia', 'mat.nombre_materia', 'a.estado')
      .select(
        'sec.id_seccion',
        'sec.nombre_seccion',
        'mat.id_materia',
        'mat.nombre_materia',
        'a.estado'
      )
      .count('* as cantidad'),
    db('seccion').select('id_seccion', 'nombre_seccion').orderBy('nombre_seccion'),
    db('materia').select('id_materia', 'nombre_materia').orderBy('nombre_materia'),
    incluirDetalle ? consultaDetalle() : Promise.resolve(null),
    idEstudiante != null
      ? db('persona')
          .where({ id_persona: idEstudiante, nombre_rol: 'estudiante' })
          .first('nombre_completo', 'cedula')
      : Promise.resolve(null),
  ]);

  const general = totalesVacios();
  const porSeccion = new Map();

  for (const f of filas) {
    const cantidad = parseInt(f.cantidad, 10) || 0;
    if (!porSeccion.has(f.id_seccion)) {
      porSeccion.set(f.id_seccion, {
        id_seccion: f.id_seccion,
        nombre_seccion: f.nombre_seccion,
        totales: totalesVacios(),
        materias: new Map(),
      });
    }
    const sec = porSeccion.get(f.id_seccion);
    if (!sec.materias.has(f.id_materia)) {
      sec.materias.set(f.id_materia, {
        id_materia: f.id_materia,
        nombre_materia: f.nombre_materia,
        totales: totalesVacios(),
      });
    }
    sumarEstado(sec.materias.get(f.id_materia).totales, f.estado, cantidad);
    sumarEstado(sec.totales, f.estado, cantidad);
    sumarEstado(general, f.estado, cantidad);
  }

  const seccionesReporte = [...porSeccion.values()]
    .map((s) => ({
      id_seccion: s.id_seccion,
      nombre_seccion: s.nombre_seccion,
      totales: cerrarTotales(s.totales),
      materias: [...s.materias.values()]
        .map((m) => ({ ...m, totales: cerrarTotales(m.totales) }))
        .sort((a, b) => compararNombre(a.nombre_materia, b.nombre_materia)),
    }))
    .sort((a, b) => compararNombre(a.nombre_seccion, b.nombre_seccion));

  const seccionSel = idSeccion != null ? secciones.find((s) => s.id_seccion === idSeccion) : null;
  const materiaSel = idMateria != null ? materias.find((m) => m.id_materia === idMateria) : null;

  const resultado = {
    filtros: {
      periodo: rango.periodo,
      periodo_label: ETIQUETA_PERIODO[rango.periodo],
      fecha_inicio: rango.fecha_inicio,
      fecha_fin: rango.fecha_fin,
      id_seccion: idSeccion,
      id_materia: idMateria,
      id_estudiante: idEstudiante,
      nombre_seccion: seccionSel?.nombre_seccion || null,
      nombre_materia: materiaSel?.nombre_materia || null,
      nombre_estudiante: estudianteSel?.nombre_completo || null,
      cedula_estudiante: estudianteSel?.cedula || null,
    },
    resumen_general: cerrarTotales(general),
    secciones: seccionesReporte,
    // Orden natural (7-1, 7-2 … 10-1, 11-3) en lugar del lexicográfico de la BD (10-1 antes que 7-1).
    catalogos: {
      secciones: [...secciones].sort((a, b) => compararNombre(a.nombre_seccion, b.nombre_seccion)),
      materias,
    },
  };

  if (incluirDetalle) {
    resultado.detalle_diario = construirDetalleDiario(filasDetalle);
    resultado.detalle_solo_incidencias = idEstudiante == null;
  }

  return resultado;
}
