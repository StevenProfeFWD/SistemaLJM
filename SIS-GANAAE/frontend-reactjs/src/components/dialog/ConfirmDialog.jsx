import { useEffect, useId, useRef } from 'react';

import { AlertTriangle, HelpCircle, Trash2, CirclePlay } from 'lucide-react';

import { Button } from '../ui/button';



const ICONS = {

  warning: AlertTriangle,

  help: HelpCircle,

  destructive: Trash2,

  success: CirclePlay,

};



export default function ConfirmDialog({

  open,

  title = 'Confirmar acción',

  message,

  confirmLabel = 'Confirmar acción',

  cancelLabel = 'Cancelar',

  variant = 'default',

  icon = 'warning',

  loading = false,

  onConfirm,

  onCancel,

}) {

  const titleId = useId();

  const cancelRef = useRef(null);



  useEffect(() => {

    if (!open) return undefined;

    cancelRef.current?.focus();

    const onKeyDown = (e) => {

      if (e.key === 'Escape') {

        e.preventDefault();

        onCancel?.();

      }

    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);

  }, [open, onCancel]);



  if (!open) return null;



  const Icon = ICONS[icon] || AlertTriangle;

  const iconWrap =

    variant === 'destructive'

      ? 'bg-red-100 text-red-600'

      : variant === 'success'

        ? 'bg-emerald-100 text-emerald-700'

        : 'bg-amber-100 text-amber-700';



  return (

    <div

      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"

      role={variant === 'destructive' ? 'alertdialog' : 'dialog'}

      aria-modal="true"

      aria-labelledby={titleId}

    >

      <div

        className="bg-card text-card-foreground w-full max-w-md rounded-xl border shadow-2xl animate-in zoom-in-95 duration-200"

        onClick={(e) => e.stopPropagation()}

      >

        <div className="p-6">

          <div className="flex gap-4">

            <div className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-full ${iconWrap}`}>

              <Icon className="h-5 w-5" aria-hidden="true" />

            </div>

            <div className="min-w-0 flex-1 pt-0.5">

              <h2 id={titleId} className="text-lg font-semibold leading-tight">

                {title}

              </h2>

              {message && (

                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{message}</p>

              )}

            </div>

          </div>

        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-6 pb-6">

          <Button

            type="button"

            variant="outline"

            disabled={loading}

            ref={cancelRef}

            onClick={onCancel}

          >

            {cancelLabel}

          </Button>

          <Button

            type="button"

            variant={variant === 'destructive' ? 'destructive' : 'default'}

            disabled={loading}

            className={variant === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : undefined}

            onClick={onConfirm}

          >

            {loading ? 'Procesando...' : confirmLabel}

          </Button>

        </div>

      </div>

    </div>

  );

}


