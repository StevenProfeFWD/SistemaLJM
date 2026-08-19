/**
 * Parser CSV para precarga masiva.
 * Plantilla del cliente (encabezados en español):
 *   Cédula,Primer apellido,Segundo apellido,Nombre,Sección,fecha_nacimiento
 * Separador: coma (,) o punto y coma (;), según exporte Excel / Bloc de notas.
 */

/** Encabezado normalizado (sin acentos, minúsculas, espacios → _) → campo interno */
const SPANISH_HEADER_MAP = {
  cedula: 'cedula',
  primer_apellido: 'apellido1',
  segundo_apellido: 'apellido2',
  nombre: 'nombre',
  seccion: 'seccion',
  fecha_nacimiento: 'fecha_nacimiento',
};

/** Compatibilidad con variantes técnicas o plantillas antiguas */
const LEGACY_HEADER_MAP = {
  identificacion: 'cedula',
  dimex: 'cedula',
  apellido1: 'apellido1',
  apellido_1: 'apellido1',
  apellido_paterno: 'apellido1',
  apellido2: 'apellido2',
  apellido_2: 'apellido2',
  apellido_materno: 'apellido2',
  nombre_seccion: 'seccion',
  nombre_completo: 'nombre_completo',
  fecha_de_nacimiento: 'fecha_nacimiento',
  fechanacimiento: 'fecha_nacimiento',
  nacimiento: 'fecha_nacimiento',
};

/**
 * Normaliza encabezado: trim, minúsculas, sin tildes, espacios → guion bajo.
 * Ej.: "Primer apellido" → "primer_apellido", "Cédula" → "cedula"
 */
export function normalizeCsvHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function mapHeaderToField(normalizedHeader) {
  if (!normalizedHeader) return null;
  return SPANISH_HEADER_MAP[normalizedHeader] || LEGACY_HEADER_MAP[normalizedHeader] || null;
}

const CSV_DELIMITERS = [',', ';'];

/** Cuenta separadores fuera de comillas dobles en una línea. */
function countDelimiterOutsideQuotes(line, delimiter) {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && c === delimiter) {
      n += 1;
    }
  }
  return n;
}

/**
 * Detecta si el archivo usa "," o ";" (Excel en español suele usar ";").
 */
export function detectCsvDelimiter(firstLine) {
  const line = String(firstLine || '');
  const counts = CSV_DELIMITERS.map((d) => ({
    delimiter: d,
    count: countDelimiterOutsideQuotes(line, d),
  }));
  const best = counts.reduce((a, b) => (b.count > a.count ? b : a));
  if (best.count > 0) return best.delimiter;
  return ',';
}

export function parseCsvLine(line, delimiter = ',') {
  const sep = delimiter === ';' ? ';' : ',';
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && c === sep) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result.map((s) => String(s).trim());
}

export function parseCsvText(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/).filter((ln) => String(ln).trim() !== '');
  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: ',' };
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delimiter).map((h) => String(h).trim());
  const canonicalHeaders = rawHeaders.map((h) => {
    const norm = normalizeCsvHeader(h);
    return mapHeaderToField(norm) || norm;
  });

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const obj = {};
    for (let j = 0; j < canonicalHeaders.length; j += 1) {
      const key = canonicalHeaders[j];
      if (!key) continue;
      const value = cells[j] != null ? String(cells[j]).trim() : '';
      if (obj[key] === undefined || obj[key] === '') {
        obj[key] = value;
      }
    }
    rows.push(obj);
  }

  return { headers: canonicalHeaders, rows, delimiter };
}

/**
 * Extrae una fila con campos canónicos y nombre_completo:
 * Nombre + Primer apellido + Segundo apellido (orden del cliente).
 */
export function extractPrecargaRow(row) {
  const cedula = String(row.cedula ?? '').trim();
  const nombre = String(row.nombre ?? '').trim();
  const apellido1 = String(row.apellido1 ?? '').trim();
  const apellido2 = String(row.apellido2 ?? '').trim();
  const nombreCompletoCsv = String(row.nombre_completo ?? '').trim();
  const fechaNacimiento = String(row.fecha_nacimiento ?? '').trim();
  const seccion = String(row.seccion ?? '').trim();

  let nombreCompleto = nombreCompletoCsv;
  if (!nombreCompleto) {
    nombreCompleto = [nombre, apellido1, apellido2].filter(Boolean).join(' ').trim();
  }

  return {
    cedula,
    nombre,
    apellido1,
    apellido2,
    nombreCompleto,
    fechaNacimiento,
    seccion,
  };
}

/** dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd */
export function parseFechaNacimiento(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${m}-${d}`;
  }
  return null;
}

const PREFIJO_A_ANO = {
  7: 'septimo',
  8: 'octavo',
  9: 'noveno',
  10: 'decimo',
  11: 'undecimo',
};

/**
 * "8-2" u "10-1" → ano_a_cursar enum
 */
export function nombreSeccionToAnoACursar(nombreSeccion) {
  const t = String(nombreSeccion || '').trim();
  const m = /^(\d{1,2})-/u.exec(t);
  if (!m) return null;
  const pref = parseInt(m[1], 10);
  return PREFIJO_A_ANO[pref] || null;
}
