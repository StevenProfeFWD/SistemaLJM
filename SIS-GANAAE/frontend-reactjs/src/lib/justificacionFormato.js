/** Clases del badge según el tipo de justificación. */
export function badgeTipoJustificacion(tipo) {
  if (tipo === 'medica') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (tipo === 'personal') return 'bg-amber-100 text-amber-900 border-amber-300';
  if (tipo === 'institucional') return 'bg-violet-100 text-violet-800 border-violet-200';
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatFechaJustificacion(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
