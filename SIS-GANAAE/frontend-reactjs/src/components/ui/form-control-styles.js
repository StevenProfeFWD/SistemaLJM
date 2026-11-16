/**
 * Estilo Filled (P1) para selects. Sin variantes read-only: un <select> siempre coincide con
 * :read-only en el navegador, y antes un select habilitado se veía gris como uno deshabilitado.
 */
export const filledSelectBase =
  'bg-slate-100 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 focus:outline-none transition-colors duration-150 ease-in-out disabled:bg-slate-200/60 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed';

/** Estilo Filled (P1) — inputs y textareas (con estilo de solo lectura). */
export const filledControlBase = `${filledSelectBase} read-only:bg-slate-200/60 read-only:text-slate-600`;

export const filledChoiceControl =
  'h-4 w-4 shrink-0 rounded border border-slate-300 bg-slate-100 text-slate-900 accent-slate-900 focus:ring-2 focus:ring-slate-900/20 focus:outline-none transition-colors duration-150 ease-in-out disabled:bg-slate-200/60 disabled:border-slate-200 disabled:cursor-not-allowed';

export const filledRadioControl =
  'h-4 w-4 shrink-0 rounded-full border border-slate-300 bg-slate-100 text-slate-900 accent-slate-900 focus:ring-2 focus:ring-slate-900/20 focus:outline-none transition-colors duration-150 ease-in-out disabled:bg-slate-200/60 disabled:border-slate-200 disabled:cursor-not-allowed';

export const filledChoiceLabel =
  'flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm transition-colors duration-150 ease-in-out has-[:checked]:border-slate-900 has-[:checked]:bg-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';
