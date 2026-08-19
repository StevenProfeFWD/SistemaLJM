import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, CirclePlay } from 'lucide-react';
import orientacionServicio from '../../services/orientacionServices';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useDialog } from '../../context/DialogContext';
import {
  esRegistroEditable,
  esExpulsionDefinitiva,
  MENSAJE_EXPULSION_DEFINITIVA,
  optionsConfirmacionExpulsion,
} from '../../utils/vigenciaEstadoOrientacion';
import { mapApiError } from '../../lib/errors';

const TIPOS_ESTADO = [
  {
    value: 'suspension',
    label: 'Suspensión',
    active: 'bg-red-600 text-white border-red-600',
    idle: 'bg-red-50 border-red-200 text-red-900',
    ring: 'ring-red-500',
  },
  {
    value: 'permiso_institucional',
    label: 'Permiso institucional',
    active: 'bg-yellow-500 text-white border-yellow-500',
    idle: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    ring: 'ring-yellow-500',
  },
  {
    value: 'expulsion',
    label: 'Expulsión',
    active: 'bg-gray-900 text-white border-gray-900',
    idle: 'bg-gray-100 border-gray-300 text-gray-900',
    ring: 'ring-gray-700',
  },
];

function ModalEditarEstado({
  registro,
  onClose,
  onGuardado,
  onAnulado,
}) {
  const { confirm, alert } = useDialog();
  const [form, setForm] = useState({
    tipo_estado: 'suspension',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!registro) return;
    setForm({
      tipo_estado: registro.tipo_estado,
      fecha_inicio: registro.fecha_inicio?.slice(0, 10) || '',
      fecha_fin: registro.fecha_fin?.slice(0, 10) || '',
      motivo: registro.motivo || '',
    });
    setError('');
  }, [registro]);

  if (!registro) return null;

  const esExpulsion = registro.esExpulsion ?? esExpulsionDefinitiva(registro);
  const editable = registro.isEditable ?? esRegistroEditable(registro);

  if (esExpulsion || !editable) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-card rounded-xl shadow-xl max-w-md w-full border p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            {esExpulsion
              ? MENSAJE_EXPULSION_DEFINITIVA
              : 'Este registro ya es histórico y no puede modificarse.'}
          </p>
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    );
  }

  const guardar = async (e) => {
    e.preventDefault();
    if (form.tipo_estado !== 'expulsion' && !form.fecha_fin) {
      setError('Indique la fecha de fin (excepto expulsión definitiva).');
      return;
    }
    if (!form.motivo.trim()) {
      setError('El motivo es obligatorio.');
      return;
    }

    if (form.tipo_estado === 'expulsion') {
      const ok = await confirm(optionsConfirmacionExpulsion(registro.nombre_completo));
      if (!ok) return;
    }

    setGuardando(true);
    setError('');
    try {
      await orientacionServicio.actualizarEstadoOrientacion(registro.id_estado_periodo, {
        tipo_estado: form.tipo_estado,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.tipo_estado === 'expulsion' && !form.fecha_fin ? null : form.fecha_fin || null,
        motivo: form.motivo.trim(),
      });
      onGuardado?.(registro);
      onClose();
    } catch (err) {
      setError(mapApiError(err, 'Error al guardar los cambios.'));
    } finally {
      setGuardando(false);
    }
  };

  const finalizarEstado = async () => {
    if (!(registro.isEditable ?? esRegistroEditable(registro))) return;

    const ok = await confirm({
      title: 'Finalizar estado especial',
      message:
        '¿Desea levantar o finalizar este estado de forma inmediata? El estudiante volverá a estar activo en las listas de asistencia.',
      confirmLabel: 'Finalizar estado',
      cancelLabel: 'Cancelar',
      variant: 'success',
      icon: 'success',
    });
    if (!ok) return;

    setAnulando(true);
    setError('');
    try {
      await orientacionServicio.anularEstadoOrientacion(registro.id_estado_periodo);
      onAnulado?.(registro);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible finalizar el estado.');
      await alert(err.response?.data?.error || 'No fue posible finalizar el estado.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-card rounded-xl shadow-xl max-w-xl w-full border max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Editar estado especial</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {registro.nombre_completo} · {registro.cedula}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar edición de estado">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={guardar} className="p-5 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium mb-2">Tipo de estado</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS_ESTADO.map((t) => {
                const activo = form.tipo_estado === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, tipo_estado: t.value })}
                    className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                      activo ? `${t.active} ring-2 ${t.ring} ring-offset-1` : t.idle
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Desde</label>
              <Input
                type="date"
                required
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Hasta
                {form.tipo_estado === 'expulsion' && (
                  <span className="font-normal text-muted-foreground"> (opcional)</span>
                )}
              </label>
              <Input
                type="date"
                required={form.tipo_estado !== 'expulsion'}
                value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Motivo / Justificación</label>
            <Textarea
              rows={4}
              required
              className="min-h-[96px]"
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          {editable && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
              <p className="text-sm text-emerald-800 mb-2">
                Este estado está vigente. Puede finalizarlo antes de la fecha programada.
              </p>
              <Button
                type="button"
                variant="outline"
                className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                disabled={anulando || guardando}
                onClick={finalizarEstado}
              >
                {anulando ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Finalizando...
                  </>
                ) : (
                  <>
                    <CirclePlay className="h-4 w-4 mr-2" />
                    Levantar sanción / Finalizar estado
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando || anulando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || anulando}>
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Guardar cambios
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ModalEditarEstado;
