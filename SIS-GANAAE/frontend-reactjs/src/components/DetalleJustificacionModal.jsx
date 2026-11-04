import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import LoadingStatus from './ui/LoadingStatus';
import justificacionServicio from '../services/justificacionServices';
import { mapApiError } from '../lib/errors';

export function badgeTipoJustificacion(tipo) {
  if (tipo === 'medica') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (tipo === 'personal') return 'bg-amber-100 text-amber-900 border-amber-300';
  if (tipo === 'institucional') return 'bg-violet-100 text-violet-800 border-violet-200';
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

export function formatFechaJustificacion(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatFechaHora(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Modal de detalle de una justificación.
 * Recibe `idJustificacion` (consulta GET /justificaciones/:id) o un `registro` ya cargado.
 */
export default function DetalleJustificacionModal({ idJustificacion, registro: registroInicial, onClose }) {
  const [registro, setRegistro] = useState(registroInicial || null);
  const [cargando, setCargando] = useState(Boolean(idJustificacion));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!idJustificacion) return;
    let activo = true;
    setCargando(true);
    setError('');
    justificacionServicio
      .getJustificacionPorId(idJustificacion)
      .then((data) => activo && setRegistro(data))
      .catch((err) => activo && setError(mapApiError(err, 'No fue posible cargar el detalle.')))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [idJustificacion]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const documento = registro?.documento_adjunto;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-detalle-justificacion"
    >
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 id="titulo-detalle-justificacion" className="font-semibold text-lg">
            Detalle de la justificación
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar detalle de la justificación"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm">
          {cargando && <LoadingStatus label="Cargando detalle…" className="justify-center py-6" />}
          {!cargando && error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {!cargando && !error && registro && (
            <>
              <p>
                <span className="font-medium">Estudiante:</span> {registro.estudiante?.nombre_completo}
              </p>
              <p>
                <span className="font-medium">Cédula:</span> {registro.estudiante?.cedula || '—'}
              </p>
              <p>
                <span className="font-medium">Sección:</span> {registro.nombre_seccion}
                {registro.nombre_materia ? ` · ${registro.nombre_materia}` : ''}
              </p>
              <p>
                <span className="font-medium">Tipo:</span>{' '}
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeTipoJustificacion(
                    registro.tipo_justificacion
                  )}`}
                >
                  {registro.tipo_justificacion_label || registro.tipo_justificacion}
                </span>
              </p>
              <p>
                <span className="font-medium">Fecha de la ausencia:</span>{' '}
                {formatFechaJustificacion(registro.fecha_ausencia)}
              </p>
              <p>
                <span className="font-medium">Fecha de ingreso:</span>{' '}
                {formatFechaJustificacion(registro.fecha_ingreso)}
              </p>
              <p>
                <span className="font-medium">Registrado por:</span>{' '}
                {registro.registrado_por
                  ? `${registro.registrado_por.nombre_completo}${
                      registro.registrado_por.rol_label ? ` (${registro.registrado_por.rol_label})` : ''
                    }`
                  : 'No disponible'}
                {registro.created_at && (
                  <span className="text-muted-foreground"> — {formatFechaHora(registro.created_at)}</span>
                )}
              </p>
              <div>
                <p className="font-medium mb-1">Motivo:</p>
                <p className="text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border">
                  {registro.descripcion || 'Sin motivo registrado.'}
                </p>
              </div>
              <p>
                <span className="font-medium">Documento adjunto:</span>{' '}
                {documento ? (
                  <a
                    href={documento}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    Ver documento
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">Sin documento adjunto</span>
                )}
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
