import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, X } from 'lucide-react';
import servicio from '../../services/personaServices';
import { useAuth } from '../../context/AuthContext';
import { rutaInicioPorRol } from '../../lib/rutasPorRol';
import { mapApiError } from '../../lib/errors';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  placeholder,
  autoComplete,
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
          className="h-11 pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-accent/20"
          onClick={onToggleVisible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {visible ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}

function Cambio() {
  const [nuevaContra, setNuevaContra] = useState('');
  const [confirmaContra, setConfirmaContra] = useState('');
  const [showNueva, setShowNueva] = useState(false);
  const [showConfirma, setShowConfirma] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const esPrimerLogin = (() => {
    try {
      return JSON.parse(localStorage.getItem('infoUsuario') || 'null')?.usuario?.primer_login === true;
    } catch {
      return false;
    }
  })();

  const handleCerrar = useCallback(() => {
    if (esPrimerLogin || !user) {
      localStorage.removeItem('infoUsuario');
      navigate('/login');
      return;
    }
    let rol = user?.rol;
    if (!rol) {
      try {
        rol = JSON.parse(localStorage.getItem('infoUsuario') || '{}')?.usuario?.rol;
      } catch {
        rol = undefined;
      }
    }
    navigate(rutaInicioPorRol(rol));
  }, [esPrimerLogin, user, navigate]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleCerrar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCerrar]);

  async function cambiarContrasena(e) {
    e?.preventDefault?.();
    setStatus({ type: '', message: '' });

    let informacion;
    try {
      informacion = JSON.parse(localStorage.getItem('infoUsuario') || 'null');
    } catch {
      informacion = null;
    }

    const idDestino = user?.id ?? informacion?.usuario?.id;

    if (!idDestino) {
      setStatus({
        type: 'error',
        message: 'No se pudo identificar al usuario para cambiar la contraseña.',
      });
      return;
    }

    if (nuevaContra.length < 8) {
      setStatus({
        type: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }

    if (nuevaContra !== confirmaContra) {
      setStatus({ type: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    try {
      setLoading(true);
      const actualizar = { contrasena_hash: nuevaContra };
      const cambio = await servicio.updateUsuarios(actualizar, idDestino);

      if (cambio.respuesta === true) {
        const sesion = await refreshUser();
        localStorage.removeItem('infoUsuario');
        setStatus({ type: 'success', message: 'Contraseña actualizada correctamente.' });
        navigate(rutaInicioPorRol(sesion?.rol));
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: mapApiError(err, 'No se pudo actualizar la contraseña.'),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-start pt-16 sm:pt-20 px-4 pb-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cambio-contrasena-titulo"
    >
      <div
        id="main-content"
        tabIndex={-1}
        className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto outline-none"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b sticky top-0 bg-card z-10">
          <div>
            <h2 id="cambio-contrasena-titulo" className="font-semibold text-lg">
              Cambiar contraseña
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Defina una contraseña personal. Mínimo 8 caracteres.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCerrar}
            className="rounded-md border p-1 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={cambiarContrasena} className="p-5 space-y-4">
          {status.message && (
            <Alert
              role={status.type === 'error' ? 'alert' : 'status'}
              aria-live={status.type === 'error' ? 'assertive' : 'polite'}
              className={
                status.type === 'error'
                  ? 'border-destructive/20 bg-destructive/5'
                  : 'border-emerald-500/20 bg-emerald-500/5'
              }
            >
              <AlertDescription
                className={status.type === 'error' ? 'text-destructive' : 'text-emerald-800'}
              >
                {status.message}
              </AlertDescription>
            </Alert>
          )}

          <PasswordField
            id="nuevaContra"
            label="Nueva contraseña"
            value={nuevaContra}
            onChange={(e) => setNuevaContra(e.target.value)}
            visible={showNueva}
            onToggleVisible={() => setShowNueva((v) => !v)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
          />

          <PasswordField
            id="confirmaContra"
            label="Confirmar contraseña"
            value={confirmaContra}
            onChange={(e) => setConfirmaContra(e.target.value)}
            visible={showConfirma}
            onToggleVisible={() => setShowConfirma((v) => !v)}
            placeholder="Repita la contraseña"
            autoComplete="new-password"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCerrar} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Actualizar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Cambio;
