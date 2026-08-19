import Cambio from '../../components/change-password/Cambio';
import { LoginBackground } from '../../components/login/LoginBackground';

/**
 * Ruta /cambiar-contraseña: login visible al fondo + scrim suave + modal encima.
 */
function CambioContra() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <LoginBackground blurred />
      {/* Scrim ligero: deja ver logo, título e inputs del login */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] pointer-events-none"
        aria-hidden="true"
      />
      <Cambio />
    </div>
  );
}

export default CambioContra;
