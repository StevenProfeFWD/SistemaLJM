/**
 * Datos sintéticos (deterministas) para el fake de BD.
 * Secciones 7-1 … 11-x, 8 materias, ~30 estudiantes por sección,
 * asistencias repartidas en días lectivos del año con los 4 estados.
 */

export const ANIO = 2025;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = ['José', 'María', 'Ñandú', 'Andrés', 'Sofía', 'Valentina', 'Luis', 'Ana', 'Íñigo', 'Camila', 'Mateo', 'Lucía', 'Diego', 'Isabel', 'Tomás'];
const APELLIDOS = ['Muñoz', 'Pérez', 'Rodríguez', 'Jiménez', 'Solís', 'Vargas', "O'Connor", 'Chacón', 'Quesada', 'Núñez', 'Araya', 'Brenes'];

export const MATERIAS = [
  'Español', 'Matemáticas', 'Ciencias', 'Estudios Sociales', 'Inglés', 'Educación Física', 'Música', 'Educación Cívica',
];

export const SECCIONES = [
  '7-1', '7-2', '7-3', '7-4', '8-1', '8-2', '8-3', '8-4', '9-1', '9-2', '9-3', '10-1', '10-2', '10-3', '11-1', '11-2', '11-3',
];

/** Días lectivos (lunes a viernes) entre febrero y noviembre de ANIO. */
export function diasLectivos(anio = ANIO) {
  const out = [];
  for (let d = new Date(Date.UTC(anio, 1, 1)); d <= new Date(Date.UTC(anio, 10, 30)); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * @param {object} o
 * @param {number} o.asistencias cantidad de filas de asistencia
 * @param {number} [o.estudiantesPorSeccion=30]
 * @param {number} [o.seed=42]
 * @param {boolean} [o.fechasDate=false] si true, `fecha` es Date (como devuelve pg) en lugar de string
 */
export function generarDatos({ asistencias = 2000, estudiantesPorSeccion = 30, seed = 42, fechasDate = false } = {}) {
  const rnd = mulberry32(seed);
  const persona = [];
  const usuariosistema = [];
  const seccion = SECCIONES.map((n, i) => ({ id_seccion: i + 1, nombre_seccion: n }));
  // sección sin asistencias (borde) y materia sin asistencias
  seccion.push({ id_seccion: 99, nombre_seccion: '12-1 (vacía)' });
  const materia = MATERIAS.map((n, i) => ({ id_materia: i + 1, nombre_materia: n }));
  materia.push({ id_materia: 50, nombre_materia: 'Taller sin lecciones' });

  // Usuarios del sistema (ids 1..20)
  const usuarios = [
    [1, 'epi', true, true], [2, 'administrador', true, true], [3, 'super_administrador', true, true],
    [4, 'profesor', true, true], [5, 'orientador', true, true], [6, 'padre_de_familia', true, true],
    [7, 'epi', false, true], // persona inactiva
    [8, 'epi', true, false], // cuenta de sistema inactiva
    [9, 'epi', true, null], // sin fila usuariosistema
    [10, 'estudiante', true, true], [11, '', true, true], [12, 'EPI', true, true],
  ];
  for (const [id, rol, activo, cuenta] of usuarios) {
    persona.push({ id_persona: id, nombre_completo: `Usuario ${rol || 'sin rol'}`, cedula: `1-0000-${String(id).padStart(4, '0')}`, nombre_rol: rol, correo: `u${id}@test.local`, activo });
    if (cuenta !== null) usuariosistema.push({ persona_id: id, activo: cuenta });
  }

  const curso_lectivo = [
    { id_curso_lectivo: 1, anio_curso_lectivo: ANIO - 1 },
    { id_curso_lectivo: 2, anio_curso_lectivo: ANIO },
  ];
  const matricula = [];
  const estudiantesPorSec = new Map();
  let idP = 1000;
  let idM = 1;
  for (const s of seccion) {
    if (s.id_seccion === 99) continue;
    const lista = [];
    for (let k = 0; k < estudiantesPorSeccion; k++) {
      const id = idP++;
      const nombre = `${APELLIDOS[Math.floor(rnd() * APELLIDOS.length)]} ${APELLIDOS[Math.floor(rnd() * APELLIDOS.length)]} ${NOMBRES[Math.floor(rnd() * NOMBRES.length)]}`;
      persona.push({ id_persona: id, nombre_completo: nombre, cedula: `${1 + (id % 7)}-${String(id).padStart(4, '0')}-${String(id * 7 % 10000).padStart(4, '0')}`, nombre_rol: 'estudiante', correo: null, activo: true });
      matricula.push({ id_matricula: idM++, id_persona_estudiante: id, id_seccion: s.id_seccion, id_curso_lectivo: 2, estado: k === 0 ? 'cancelada' : 'activa' });
      lista.push(id);
    }
    estudiantesPorSec.set(s.id_seccion, lista);
  }
  // estudiante con nombre muy largo y caracteres especiales en 7-1
  const largo = persona.find((p) => p.id_persona === 1001);
  if (largo) largo.nombre_completo = 'Ñúñez de la Santísima Trinidad Fernández-Ölçüm ' + 'Largo '.repeat(25) + '<script>alert(1)</script>';

  const profesor_materia_seccion = [];
  let idPms = 1;
  const pmsPorSec = new Map();
  for (const s of seccion) {
    if (s.id_seccion === 99) continue;
    const arr = [];
    for (const m of materia) {
      if (m.id_materia === 50) continue;
      const row = { id_profesor_materia_seccion: idPms++, id_seccion: s.id_seccion, id_materia: m.id_materia, id_persona_profesor: 4 };
      profesor_materia_seccion.push(row);
      arr.push(row);
    }
    pmsPorSec.set(s.id_seccion, arr);
  }
  // pms de la sección vacía (existe asignación, pero sin asistencias)
  profesor_materia_seccion.push({ id_profesor_materia_seccion: idPms++, id_seccion: 99, id_materia: 1, id_persona_profesor: 4 });

  const dias = diasLectivos();
  const asistencia = new Array(asistencias);
  const secIds = [...estudiantesPorSec.keys()];
  for (let i = 0; i < asistencias; i++) {
    const sId = secIds[Math.floor(rnd() * secIds.length)];
    const ests = estudiantesPorSec.get(sId);
    const pmsArr = pmsPorSec.get(sId);
    const r = rnd();
    const estado = r < 0.8 ? 'presente' : r < 0.87 ? 'tardanza' : r < 0.95 ? 'ausente' : 'justificado';
    const f = dias[Math.floor(rnd() * dias.length)];
    const [yy, mm, dd] = f.split('-').map(Number);
    asistencia[i] = {
      id_asistencia: i + 1,
      id_persona_estudiante: ests[Math.floor(rnd() * ests.length)],
      id_profesor_materia_seccion: pmsArr[Math.floor(rnd() * pmsArr.length)].id_profesor_materia_seccion,
      fecha: fechasDate ? new Date(yy, mm - 1, dd) : f,
      estado,
    };
  }
  // registro en otro año (no debe aparecer en reportes de ANIO)
  asistencia.push({ id_asistencia: asistencias + 1, id_persona_estudiante: 1002, id_profesor_materia_seccion: 1, fecha: fechasDate ? new Date(ANIO - 1, 5, 2) : `${ANIO - 1}-06-02`, estado: 'ausente' });
  // estudiante 1000 (matrícula cancelada) con asistencia en su sección
  asistencia.push({ id_asistencia: asistencias + 2, id_persona_estudiante: 1000, id_profesor_materia_seccion: 1, fecha: fechasDate ? new Date(ANIO, 2, 3) : `${ANIO}-03-03`, estado: 'tardanza' });

  return { persona, usuariosistema, seccion, materia, profesor_materia_seccion, asistencia, matricula, curso_lectivo };
}

/**
 * Oráculo independiente: cuenta registros según filtros, sin usar código de la app.
 */
export function oraculoConteos(tablas, { fecha_inicio, fecha_fin, id_seccion, id_materia, id_estudiante }) {
  const pms = new Map(tablas.profesor_materia_seccion.map((p) => [p.id_profesor_materia_seccion, p]));
  const toIso = (f) => (typeof f === 'string' ? f : `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`);
  const res = { total: 0, presente: 0, tardanza: 0, ausente: 0, justificado: 0, porSeccion: new Map(), porSecMat: new Map() };
  for (const a of tablas.asistencia) {
    const f = toIso(a.fecha);
    if (f < fecha_inicio || f > fecha_fin) continue;
    const p = pms.get(a.id_profesor_materia_seccion);
    if (id_seccion != null && p.id_seccion !== id_seccion) continue;
    if (id_materia != null && p.id_materia !== id_materia) continue;
    if (id_estudiante != null && a.id_persona_estudiante !== id_estudiante) continue;
    res.total++;
    res[a.estado]++;
    res.porSeccion.set(p.id_seccion, (res.porSeccion.get(p.id_seccion) || 0) + 1);
    const k = `${p.id_seccion}|${p.id_materia}`;
    res.porSecMat.set(k, (res.porSecMat.get(k) || 0) + 1);
  }
  return res;
}
