/** Fecha local YYYY-MM-DD (alineada con el backend). */
export function fechaHoyLocal() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

export function normalizarFechaIso(fecha) {
  if (!fecha) return null;
  return String(fecha).slice(0, 10);
}

export const MENSAJE_EXPULSION_DEFINITIVA = 'Sanción definitiva - No editable';

/** Opciones del ConfirmDialog antes de registrar o aplicar expulsión definitiva. */
export function optionsConfirmacionExpulsion(nombreCompleto) {
  const nombre = nombreCompleto?.trim() || 'este estudiante';
  return {
    title: 'Confirmar expulsión definitiva',
    message: `¿Está seguro de que desea expulsar definitivamente a ${nombre}? Esta acción no se puede deshacer.`,
    confirmLabel: 'Expulsar definitivamente',
    cancelLabel: 'Cancelar',
    variant: 'destructive',
    icon: 'destructive',
  };
}

export function esExpulsionDefinitiva(registro) {
  return registro?.tipo_estado === 'expulsion';
}

/**
 * Vigencia académica/permanente: la expulsión no caduca; demás tipos según fecha_fin.
 */
export function esRegistroVigente(registro) {
  if (!registro) return false;
  if (esExpulsionDefinitiva(registro)) return true;
  const hoy = fechaHoyLocal();
  const fin = normalizarFechaIso(registro.fecha_fin);
  if (!fin) return false;
  return fin > hoy;
}

/**
 * Edición o finalización anticipada en panel de orientación.
 * La expulsión definitiva nunca es editable.
 */
export function esRegistroEditable(registro) {
  if (!registro || esExpulsionDefinitiva(registro)) return false;
  const hoy = fechaHoyLocal();
  const fin = normalizarFechaIso(registro.fecha_fin);
  if (!fin) return false;
  return fin > hoy;
}

export function enriquecerRegistroHistorial(registro) {
  const esExpulsion = registro.es_expulsion ?? esExpulsionDefinitiva(registro);
  const isVigente = registro.es_vigente ?? esRegistroVigente(registro);
  const isEditable = registro.es_editable ?? esRegistroEditable(registro);
  return {
    ...registro,
    esExpulsion,
    isVigente,
    isEditable,
  };
}
