import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

const STYLES = {
  success: {
    wrap: 'border-green-200 bg-green-50 text-green-900',
    icon: CheckCircle2,
    iconClass: 'text-green-600',
    close: 'text-green-600 hover:text-green-800',
  },
  error: {
    wrap: 'border-red-200 bg-red-50 text-red-900',
    icon: AlertCircle,
    iconClass: 'text-red-600',
    close: 'text-red-600 hover:text-red-800',
  },
  info: {
    wrap: 'border-blue-200 bg-blue-50 text-blue-900',
    icon: Info,
    iconClass: 'text-blue-600',
    close: 'text-blue-600 hover:text-blue-800',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: AlertCircle,
    iconClass: 'text-amber-600',
    close: 'text-amber-700 hover:text-amber-900',
  },
};

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[110] flex flex-col gap-2 max-w-md w-[min(100vw-2rem,24rem)]"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => {
        const style = STYLES[t.variant] || STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right-4 fade-in duration-300 ${style.wrap}`}
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.iconClass}`} />
            <p className="text-sm flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className={style.close}
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
