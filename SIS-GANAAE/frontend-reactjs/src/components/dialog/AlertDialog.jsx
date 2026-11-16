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

  const messageId = useId();

  const closeRef = useRef(null);

  const dialogRef = useRef(null);

  // onClose en una ref: si su identidad cambia mientras el diálogo está abierto no se re-ejecuta el efecto

  // (eso movería el foco y perdería el elemento al que hay que devolverlo).

  const onCloseRef = useRef(onClose);



  useEffect(() => {

    onCloseRef.current = onClose;

  }, [onClose]);



  useEffect(() => {

    if (!open) return undefined;

    // Elemento que tenía el foco al abrir: se le devuelve al cerrar (WCAG 2.4.3).

    const previo = document.activeElement;

    closeRef.current?.focus();

    const onKeyDown = (e) => {

      if (e.key === 'Escape') {

        e.preventDefault();

        onCloseRef.current?.();

        return;

      }

      if (e.key !== 'Tab') return;

      // Trampa de foco: Tab / Shift+Tab no salen del diálogo modal.

      const cont = dialogRef.current;

      if (!cont) return;

      const enfocables = [

        ...cont.querySelectorAll(

          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

        ),

      ];

      if (enfocables.length === 0) {

        e.preventDefault();

        return;

      }

      const primero = enfocables[0];

      const ultimo = enfocables[enfocables.length - 1];

      const activo = document.activeElement;

      if (e.shiftKey && (activo === primero || !cont.contains(activo))) {

        e.preventDefault();

        ultimo.focus();

      } else if (!e.shiftKey && (activo === ultimo || !cont.contains(activo))) {

        e.preventDefault();

        primero.focus();

      }

    };

    document.addEventListener('keydown', onKeyDown);

    return () => {

      document.removeEventListener('keydown', onKeyDown);

      if (previo && typeof previo.focus === 'function' && previo.isConnected) {

        previo.focus();

      }

    };

  }, [open]);



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

      ref={dialogRef}

      role="alertdialog"

      aria-modal="true"

      aria-labelledby={titleId}

      aria-describedby={message ? messageId : undefined}

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

                <p id={messageId} className="mt-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">

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


