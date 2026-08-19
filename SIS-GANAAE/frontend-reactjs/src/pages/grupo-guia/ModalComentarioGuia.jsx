import { useState } from 'react';
import { X, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPeriodo(inicio, fin) {
  if (!inicio) return '—';
  const fmt = (f) => {
    const [y, m, d] = f.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  };
  if (!fin) return `${fmt(inicio)} en adelante`;
  return `${fmt(inicio)} al ${fmt(fin)}`;
}

export default function ModalComentarioGuia({ registro, onClose, onGuardar }) {
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const texto = comentario.trim();
    if (texto.length < 5) {
      setError('Escriba al menos 5 caracteres en la observación.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar(texto);
    } catch (err) {
      setError(err?.error || err?.message || 'No fue posible guardar el comentario.');
    } finally {
      setGuardando(false);
    }
  };

  if (!registro) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl max-w-xl w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Observación de seguimiento</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md border p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="text-sm space-y-1">
            <p>
              <span className="font-medium">Estudiante:</span> {registro.nombre_completo}
            </p>
            <p>
              <span className="font-medium">Tipo:</span> {registro.tipo_estado_label}
            </p>
            <p>
              <span className="font-medium">Periodo:</span>{' '}
              {formatPeriodo(registro.fecha_inicio, registro.fecha_fin)}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Motivo registrado por orientación</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border">
              {registro.motivo || 'Sin motivo registrado.'}
            </p>
          </div>

          {(registro.comentarios || []).length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Bitácora previa del profesor guía</p>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {registro.comentarios.map((c) => (
                  <li
                    key={c.id_comentario}
                    className="text-sm rounded-lg border bg-muted/30 p-3"
                  >
                    <p className="text-xs text-muted-foreground mb-1">
                      {c.nombre_profesor || 'Profesor guía'} · {formatFecha(c.fecha_registro)}
                    </p>
                    <p className="whitespace-pre-wrap">{c.comentario}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="comentario-guia" className="text-sm font-medium block mb-1">
              Nueva observación de seguimiento
            </label>
            <Textarea
              id="comentario-guia"
              rows={4}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej: Se conversó con el estudiante tras regresar de la suspensión..."
              disabled={guardando}
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar observación'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
