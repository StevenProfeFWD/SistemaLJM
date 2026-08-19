/**
 * Convierte YYYY-MM-DD a día ISO (1=Lunes … 7=Domingo).
 * Usa componentes locales para evitar desfases por zona horaria.
 */
export function fechaToIsoDiaSemana(fechaStr) {
  const s = String(fechaStr || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  const js = dt.getDay();
  return js === 0 ? 7 : js;
}

export const DIA_SEMANA_LABEL = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

/** Formato HH:MM desde TIME de PostgreSQL o string. */
export function formatHoraCorta(raw) {
  if (raw == null || raw === '') return '--:--';
  const s = String(raw);
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s.slice(0, 5);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function etiquetaLeccion(row) {
  const id = row.id_leccion;
  const ini = formatHoraCorta(row.hora_inicio);
  const fin = formatHoraCorta(row.hora_fin);
  let label = `Lección ${id} (${ini} - ${fin})`;
  if (row.es_recreo_almuerzo) label += ' — Almuerzo';
  return label;
}

const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function resumenHorariosLeccion(horarios) {
  if (!Array.isArray(horarios) || horarios.length === 0) return 'Sin horarios';
  return horarios
    .map((h) => {
      const dia = DIAS_CORTO[h.dia_semana] || `D${h.dia_semana}`;
      const id = h.id_leccion;
      const ini = formatHoraCorta(h.hora_inicio);
      const fin = formatHoraCorta(h.hora_fin);
      return `${dia} L${id} (${ini}-${fin})`;
    })
    .join(', ');
}
