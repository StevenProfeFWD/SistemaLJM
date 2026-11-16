// Cliente HTTP simulado para la vista previa en navegador. Parámetros de URL de la página:
//   ?rol=epi|administrador|profesor...  (por defecto epi)
//   ?escenario=normal|grande|vacio|error|lento
const qs = new URLSearchParams(window.location.search);
const guardado = sessionStorage.getItem('qa_escenario');
if (qs.get('escenario')) sessionStorage.setItem('qa_escenario', qs.get('escenario'));
if (qs.get('rol')) sessionStorage.setItem('qa_rol', qs.get('rol'));
const escenario = () => sessionStorage.getItem('qa_escenario') || guardado || 'normal';
const rol = () => sessionStorage.getItem('qa_rol') || 'epi';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function tot(p, t, aj, ai) {
  const total = p + t + aj + ai;
  return { presentes: p, tardias: t, ausencias_justificadas: aj, ausencias_injustificadas: ai, otros: 0, total,
    porcentaje_asistencia: total ? Math.round(((p + t) / total) * 1000) / 10 : 0 };
}
function reporte(params) {
  const n = escenario() === 'grande' ? 40 : 4;
  const m = escenario() === 'grande' ? 10 : 3;
  const secciones = escenario() === 'vacio' ? [] : Array.from({ length: n }, (_, i) => ({
    id_seccion: i + 1, nombre_seccion: `${7 + (i % 5)}-${1 + Math.floor(i / 5)}`,
    totales: tot(70 + (i * 7) % 30, 3, 2, 1 + (i % 9)),
    materias: Array.from({ length: m }, (_, j) => ({ id_materia: 100 + j, nombre_materia: ['Matemáticas', 'Español', 'Ciencias', 'Estudios Sociales', 'Inglés', 'Educación Física', 'Música', 'Artes Plásticas', 'Francés', 'Informática'][j], totales: tot(20 + j, 1, 1, j % 4) })),
  }));
  const filtrado = params.id_seccion ? secciones.filter((s) => String(s.id_seccion) === String(params.id_seccion)) : secciones;
  return {
    filtros: { periodo: params.periodo, periodo_label: { semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual', personalizado: 'Personalizado' }[params.periodo] || 'Mensual',
      fecha_inicio: params.fecha_inicio || params.fecha_referencia, fecha_fin: params.fecha_fin || params.fecha_referencia,
      nombre_seccion: params.id_seccion ? filtrado[0]?.nombre_seccion : null, nombre_materia: null, nombre_estudiante: params.id_estudiante ? 'Estudiante de prueba' : null },
    resumen_general: filtrado.length ? tot(800, 30, 20, 50) : tot(0, 0, 0, 0),
    secciones: filtrado,
    catalogos: { secciones: secciones.map((s) => ({ id_seccion: s.id_seccion, nombre_seccion: s.nombre_seccion })),
      materias: Array.from({ length: m }, (_, j) => ({ id_materia: 100 + j, nombre_materia: `Materia ${j + 1}` })) },
  };
}

async function get(url, cfg = {}) {
  const lat = escenario() === 'lento' ? 2500 : 250;
  await esperar(lat);
  if (url === '/personas/sesion') return { data: { id: 1, rol: rol(), nombre_completo: `Usuario QA (${rol()})` } };
  if (url === '/epi/reporte-asistencia') {
    if (escenario() === 'error') throw { response: { status: 500, data: { error: 'Error simulado del servidor de reportes' } } };
    return { data: reporte(cfg.params || {}) };
  }
  if (/^\/epi\/secciones\/\d+\/estudiantes$/.test(url)) {
    // Los ids dependen del año (para reproducir D-01 en el navegador)
    const base = String(cfg.params?.anio) === String(new Date().getFullYear()) ? 1000 : 2000;
    return { data: { estudiantes: Array.from({ length: 30 }, (_, i) => ({ id_estudiante: base + i, nombre_completo: `Estudiante Ficticio ${base === 1000 ? "" : "(otro año) "}${i + 1}`, cedula: `10000${String(i).padStart(4, '0')}` })) } };
  }
  if (url === '/epi/reporte-asistencia/pdf') return { data: new Blob(['%PDF-1.4 simulado'], { type: 'application/pdf' }) };
  return { data: {} };
}

const apiClient = {
  get, post: async () => { await esperar(100); return { data: {} }; },
  put: async () => ({ data: {} }), patch: async () => ({ data: {} }), delete: async () => ({ data: {} }),
  interceptors: { response: { use() {} }, request: { use() {} } },
};
window.__QA_API_SIMULADA__ = true;
export const API_BASE_URL = 'http://simulado.invalid/api';
export { apiClient };
export default apiClient;
