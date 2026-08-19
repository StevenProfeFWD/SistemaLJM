import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function cedulaDocente(docente) {
  return docente?.cedula || docente?.identificacion || '';
}

export function etiquetaDocente(docente) {
  if (!docente) return '';
  const cedula = cedulaDocente(docente) || '—';
  return `${docente.nombre_completo} - Cédula: ${cedula}`;
}

function filtrarDocentes(docentes, query) {
  const q = normalizarTexto(query);
  if (!q) return docentes;
  return docentes.filter((d) => {
    const nombre = normalizarTexto(d.nombre_completo);
    const cedula = normalizarTexto(cedulaDocente(d));
    return nombre.includes(q) || cedula.includes(q);
  });
}

/**
 * Combobox de búsqueda local de docentes (nombre o cédula).
 * Sin dependencias extra: Input + lista filtrada + navegación por teclado.
 */
export default function DocenteSearchCombobox({
  docentes = [],
  value = '',
  onChange,
  disabled = false,
  id = 'docente-search',
  label = 'Docente',
  placeholder = 'Buscar por nombre o cédula…',
}) {
  const listboxId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const [indiceActivo, setIndiceActivo] = useState(-1);

  const docenteSeleccionado = useMemo(
    () => docentes.find((d) => String(d.id_persona) === String(value)),
    [docentes, value]
  );

  const resultados = useMemo(() => filtrarDocentes(docentes, query), [docentes, query]);

  useEffect(() => {
    if (!abierto) {
      setIndiceActivo(-1);
    }
  }, [abierto, query]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setAbierto(false);
        if (docenteSeleccionado) {
          setQuery(etiquetaDocente(docenteSeleccionado));
        } else {
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [docenteSeleccionado]);

  useEffect(() => {
    if (docenteSeleccionado && !abierto) {
      setQuery(etiquetaDocente(docenteSeleccionado));
    }
    if (!value && !abierto) {
      setQuery('');
    }
  }, [docenteSeleccionado, value, abierto]);

  const seleccionar = (docente) => {
    onChange?.(String(docente.id_persona), docente);
    setQuery(etiquetaDocente(docente));
    setAbierto(false);
    setIndiceActivo(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setAbierto(false);
      if (docenteSeleccionado) {
        setQuery(etiquetaDocente(docenteSeleccionado));
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        setIndiceActivo(resultados.length > 0 ? 0 : -1);
        return;
      }
      setIndiceActivo((i) => (resultados.length === 0 ? -1 : Math.min(i + 1, resultados.length - 1)));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        setIndiceActivo(resultados.length > 0 ? resultados.length - 1 : -1);
        return;
      }
      setIndiceActivo((i) => (resultados.length === 0 ? -1 : Math.max(i - 1, 0)));
      return;
    }

    if (e.key === 'Enter') {
      if (!abierto) return;
      e.preventDefault();
      if (indiceActivo >= 0 && resultados[indiceActivo]) {
        seleccionar(resultados[indiceActivo]);
      }
    }
  };

  const mostrarLista = abierto && !disabled;

  return (
    <div ref={rootRef} className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          aria-label="Buscar docente por nombre o cédula"
          aria-expanded={mostrarLista}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            mostrarLista && indiceActivo >= 0
              ? `${listboxId}-option-${indiceActivo}`
              : undefined
          }
          className="pr-9"
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setAbierto(true);
            if (value) {
              onChange?.('', null);
            }
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />

        {mostrarLista && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Resultados de docentes"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          >
            {resultados.length === 0 ? (
              <li
                role="option"
                aria-disabled="true"
                className="px-3 py-2.5 text-sm text-muted-foreground"
              >
                No se encontraron docentes con ese nombre o cédula
              </li>
            ) : (
              resultados.map((d, index) => {
                const activo = index === indiceActivo;
                return (
                  <li
                    key={d.id_persona}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={String(d.id_persona) === String(value)}
                    className={cn(
                      'cursor-pointer px-3 py-2.5 text-sm transition-colors',
                      activo ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                    )}
                    onMouseEnter={() => setIndiceActivo(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => seleccionar(d)}
                  >
                    <span className="font-medium">{d.nombre_completo}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — Cédula: {cedulaDocente(d) || '—'}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
