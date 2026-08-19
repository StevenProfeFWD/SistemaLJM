/** Disparar cuando el catálogo de materias cambia (CRUD) para refrescar otras pantallas sin F5. */
export const MATERIAS_CATALOGO_EVENT = 'sis-ganaae:materias-catalogo-updated';

export function emitMateriasCatalogoUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MATERIAS_CATALOGO_EVENT));
  }
}
