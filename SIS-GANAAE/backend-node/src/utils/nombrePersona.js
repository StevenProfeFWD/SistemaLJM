/**
 * Formato típico Hacienda CR: APELLIDO1 APELLIDO2 NOMBRE(S)
 */
export function parseNombreCompletoCr(nombreCompleto) {
  const parts = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { nombre: '', apellido1: '', apellido2: '', nombre_completo: '' };
  }
  if (parts.length === 1) {
    return {
      nombre: parts[0],
      apellido1: '',
      apellido2: '',
      nombre_completo: parts[0],
    };
  }
  if (parts.length === 2) {
    return {
      apellido1: parts[0],
      apellido2: '',
      nombre: parts[1],
      nombre_completo: `${parts[0]} ${parts[1]}`,
    };
  }
  return {
    apellido1: parts[0],
    apellido2: parts[1],
    nombre: parts.slice(2).join(' '),
    nombre_completo: parts.join(' '),
  };
}

export function buildNombreCompletoCr({ nombre, apellido1, apellido2 }) {
  return [apellido1, apellido2, nombre]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
}
