import {
  assertPadrePuedeVerEstudiante,
  consultarHistorialAsistenciaHijo,
} from './padresAsistenciaService.js';
import { listEstadosEspecialesHijo } from './padresEstadosService.js';

function inicioAnioLectivo() {
  const anio = new Date().getFullYear();
  return `${anio}-01-01`;
}

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

function inicioMesActual() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function finMesActual() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const ultimo = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

export async function obtenerDashboardHijo(padreId, idEstudiante) {
  const id = await assertPadrePuedeVerEstudiante(padreId, idEstudiante);

  const [anual, mensual, orientacion] = await Promise.all([
    consultarHistorialAsistenciaHijo(id, inicioAnioLectivo(), hoyIso()),
    consultarHistorialAsistenciaHijo(id, inicioMesActual(), finMesActual()),
    listEstadosEspecialesHijo(padreId, id),
  ]);

  const hoy = hoyIso();
  const estadosActivos = (orientacion.registros || []).filter((r) => {
    if (r.tipo_estado === 'expulsion') return true;
    if (!r.fecha_fin) return r.fecha_inicio <= hoy;
    return r.fecha_inicio <= hoy && r.fecha_fin >= hoy;
  });

  return {
    estudiante: anual.estudiante,
    anio_lectivo: anual.estudiante.anio_curso_lectivo || new Date().getFullYear(),
    resumen_anual: anual.resumen,
    resumen_mes: mensual.resumen,
    rango_mes: mensual.rango,
    estados_orientacion: orientacion.registros || [],
    estados_activos: estadosActivos,
  };
}
