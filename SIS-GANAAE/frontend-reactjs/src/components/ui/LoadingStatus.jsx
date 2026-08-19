/**
 * Indicador de carga accesible (WCAG: role="status", aria-busy).
 */
export function LoadingStatus({ label = 'Cargando…', className = '' }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`.trim()}
    >
      <span
        className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-2 border-primary/25 border-t-primary motion-reduce:border-primary"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

export default LoadingStatus;
