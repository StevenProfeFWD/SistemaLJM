/** Etiquetas legibles para lecciones del catálogo (frontend). */

export function formatHoraCorta(raw) {
  if (raw == null || raw === '') return '--:--';
  const s = String(raw);
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s.slice(0, 5);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function etiquetaLeccion(leccion) {
  const id = leccion.id_leccion;
  const ini = formatHoraCorta(leccion.hora_inicio);
  const fin = formatHoraCorta(leccion.hora_fin);
  let label = `Lección ${id} (${ini} - ${fin})`;
  if (leccion.es_recreo_almuerzo) label += ' — Almuerzo';
  return label;
}

const DIAS_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function resumenHorariosLeccion(horarios) {
  if (!Array.isArray(horarios) || horarios.length === 0) return 'Sin horarios';
  return horarios
    .map((h) => {
      const dia = DIAS_CORTO[h.dia_semana] || `D${h.dia_semana}`;
      if (h.etiqueta) return `${dia} ${h.etiqueta}`;
      const ini = formatHoraCorta(h.hora_inicio);
      const fin = formatHoraCorta(h.hora_fin);
      return `${dia} L${h.id_leccion} (${ini}-${fin})`;
    })
    .join(', ');
}
