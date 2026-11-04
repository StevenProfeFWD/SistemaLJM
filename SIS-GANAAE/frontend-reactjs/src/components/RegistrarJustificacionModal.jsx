import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';
import justificacionServicio from '../services/justificacionServices';
import { mapApiError } from '../lib/errors';

const TIPOS = [
  { value: 'medica', label: 'Médica' },
  { value: 'personal', label: 'Personal' },
  { value: 'institucional', label: 'Institucional' },
];

/**
 * Modal para registrar la justificación de una ausencia/tardanza.
 * @param {{ idAsistencia: number, nombreEstudiante: string, fecha: string, onClose: () => void, onRegistrada: (j) => void }} props
 */
export default function RegistrarJustificacionModal({
  idAsistencia,
  nombreEstudiante,
  fecha,
  onClose,
  onRegistrada,
}) {
  const [tipo, setTipo] = useState('medica');
  const [descripcion, setDescripcion] = useState('');
  const [documento, setDocumento] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !guardando && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, guardando]);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (descripcion.trim().length < 5) {
      setError('Describa el motivo (mínimo 5 caracteres).');
      return;
    }
    try {
      setGuardando(true);
      const res = await justificacionServicio.registrarJustificacion({
        id_asistencia: idAsistencia,
        tipo_justificacion: tipo,
        descripcion: descripcion.trim(),
        documento_adjunto: documento.trim() || undefined,
      });
      onRegistrada?.(res.justificacion);
    } catch (err) {
      setError(mapApiError(err, 'No fue posible registrar la justificación.'));
    } finally {
      setGuardando(false);
    }
  };

  const fechaLegible = fecha ? fecha.split('-').reverse().join('/') : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-registrar-justificacion"
    >
      <form
        onSubmit={enviar}
        className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 id="titulo-registrar-justificacion" className="font-semibold text-lg">
            Justificar ausencia
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{nombreEstudiante}</span>
            {fechaLegible && <> — ausencia del {fechaLegible}</>}
          </p>

          <div>
            <label htmlFor="just-tipo" className="block text-sm font-medium mb-1.5">
              Tipo de justificación
            </label>
            <Select id="just-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="just-motivo" className="block text-sm font-medium mb-1.5">
              Motivo
            </label>
            <Textarea
              id="just-motivo"
              value={descripcion}
              maxLength={2000}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describa el motivo de la ausencia…"
              required
            />
          </div>

          <div>
            <label htmlFor="just-doc" className="block text-sm font-medium mb-1.5">
              Enlace al documento adjunto (opcional)
            </label>
            <Input
              id="just-doc"
              type="url"
              value={documento}
              maxLength={500}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="https://…"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Guardando…
              </>
            ) : (
              'Registrar justificación'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
