import { useEffect, useId, useRef } from 'react';

import { Info, AlertCircle, CheckCircle2 } from 'lucide-react';

import { Button } from '../ui/button';



const ICONS = {

  info: Info,

  error: AlertCircle,

  success: CheckCircle2,

};



export default function AlertDialog({

  open,

  title = 'Aviso',

  message,

  variant = 'info',

  confirmLabel = 'Entendido',

  onClose,

}) {

  const titleId = useId();

  const closeRef = useRef(null);



  useEffect(() => {

    if (!open) return undefined;

    closeRef.current?.focus();

    const onKeyDown = (e) => {

      if (e.key === 'Escape') {

        e.preventDefault();

        onClose?.();

      }

    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);

  }, [open, onClose]);



  if (!open) return null;



  const Icon = ICONS[variant] || Info;

  const iconWrap =

    variant === 'error'

      ? 'bg-red-100 text-red-600'

      : variant === 'success'

        ? 'bg-green-100 text-green-600'

        : 'bg-blue-100 text-blue-600';



  return (

    <div

      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"

      role="alertdialog"

      aria-modal="true"

      aria-labelledby={titleId}

    >

      <div className="bg-card text-card-foreground w-full max-w-md rounded-xl border shadow-2xl animate-in zoom-in-95 duration-200">

        <div className="p-6">

          <div className="flex gap-4">

            <div className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-full ${iconWrap}`}>

              <Icon className="h-5 w-5" aria-hidden="true" />

            </div>

            <div className="min-w-0 flex-1 pt-0.5">

              <h2 id={titleId} className="text-lg font-semibold leading-tight">{title}</h2>

              {message && (

                <p className="mt-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">

                  {message}

                </p>

              )}

            </div>

          </div>

        </div>

        <div className="flex justify-end px-6 pb-6">

          <Button type="button" ref={closeRef} onClick={onClose}>

            {confirmLabel}

          </Button>

        </div>

      </div>

    </div>

  );

}


