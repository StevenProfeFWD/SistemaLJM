import { useCallback, useState } from 'react';
import { useDialog } from '../context/DialogContext';
import restablecimientoServicio from '../services/restablecimientoContrasenaServices';
import { mapApiError } from './errors';

/** Contraseña temporal que asigna el restablecimiento (el backend la guarda cifrada con bcrypt). */
export const CONTRASENA_TEMPORAL = 'liceomarti';

/**
 * Pide confirmación y restablece la contraseña de un usuario.
 * Devuelve true si se restableció.
 */
export function useRestablecerContrasena() {
  const { confirm, alert, toast } = useDialog();
  const [restableciendoId, setRestableciendoId] = useState(null);

  const restablecer = useCallback(
    async (usuario) => {
      const ok = await confirm({
        title: 'Restablecer contraseña',
        message:
          `¿Restablecer la contraseña de «${usuario.nombre_completo}»?\n\n` +
          `Su nueva contraseña temporal será «${CONTRASENA_TEMPORAL}». Al ingresar, el sistema le pedirá ` +
          'cambiarla por una personal. Las sesiones que tenga abiertas se cerrarán.',
        confirmLabel: 'Restablecer',
        cancelLabel: 'Cancelar',
        variant: 'destructive',
        icon: 'destructive',
      });
      if (!ok) return false;

      setRestableciendoId(usuario.id_persona);
      try {
        await restablecimientoServicio.restablecerContrasena(usuario.id_persona);
        toast(`Contraseña de ${usuario.nombre_completo} restablecida.`, 'success');
        await alert(
          `Indique a ${usuario.nombre_completo} que ingrese con la contraseña temporal «${CONTRASENA_TEMPORAL}». ` +
            'El sistema le pedirá cambiarla al iniciar sesión.',
          { variant: 'success', title: 'Contraseña restablecida' }
        );
        return true;
      } catch (err) {
        toast(mapApiError(err, 'No se pudo restablecer la contraseña'), 'error');
        return false;
      } finally {
        setRestableciendoId(null);
      }
    },
    [confirm, alert, toast]
  );

  return { restablecer, restableciendoId };
}
