import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmDialog from '../components/dialog/ConfirmDialog';
import AlertDialog from '../components/dialog/AlertDialog';
import ToastStack from '../components/dialog/ToastStack';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [alertState, setAlertState] = useState(null);
  const [toasts, setToasts] = useState([]);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({
        title: 'Confirmar acción',
        confirmLabel: 'Confirmar acción',
        cancelLabel: 'Cancelar',
        variant: 'default',
        icon: 'warning',
        ...options,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setAlertState({
        title: options.title || 'Aviso',
        message,
        variant: options.variant || 'info',
        confirmLabel: options.confirmLabel || 'Entendido',
        resolve,
      });
    });
  }, []);

  const toast = useCallback((message, variant = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const closeConfirm = useCallback((result) => {
    setConfirmState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((current) => {
      current?.resolve();
      return null;
    });
  }, []);

  const value = useMemo(
    () => ({ confirm, alert, toast }),
    [confirm, alert, toast]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        variant={confirmState?.variant}
        icon={confirmState?.icon}
        loading={confirmState?.loading}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
      <AlertDialog
        open={Boolean(alertState)}
        title={alertState?.title}
        message={alertState?.message}
        variant={alertState?.variant}
        confirmLabel={alertState?.confirmLabel}
        onClose={closeAlert}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog debe usarse dentro de DialogProvider');
  }
  return ctx;
}
