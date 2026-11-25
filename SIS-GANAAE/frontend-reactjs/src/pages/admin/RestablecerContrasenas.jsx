import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Search } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';
import restablecimientoServicio from '../../services/restablecimientoContrasenaServices';
import { mapApiError } from '../../lib/errors';
import { CONTRASENA_TEMPORAL, useRestablecerContrasena } from '../../lib/useRestablecerContrasena';

function estadoCuenta(u) {
  if (u.activo === false || u.cuenta_activa === false) return { texto: 'Inactiva', clase: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (u.primer_login === true) return { texto: 'Pendiente de cambio', clase: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { texto: 'Activa', clase: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
}

/** Pantalla del administrador: restablecer contraseñas de profesores, orientadores, EPI y encargados. */
export default function RestablecerContrasenas() {
  const [busqueda, setBusqueda] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const { restablecer, restableciendoId } = useRestablecerContrasena();

  const cargar = useCallback(async (texto) => {
    setCargando(true);
    setError('');
    try {
      setUsuarios(await restablecimientoServicio.buscarUsuariosRestablecibles(texto));
    } catch (err) {
      setUsuarios([]);
      setError(mapApiError(err, 'No se pudo cargar la lista de usuarios'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar('');
  }, [cargar]);

  const onRestablecer = async (u) => {
    const hecho = await restablecer(u);
    if (hecho) await cargar(busqueda.trim());
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 pt-16 lg:p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Restablecer contraseñas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Para profesores, orientadores, Equipo de Permanencia Estudiantil (EPI) y encargados que olvidaron su
            contraseña. La contraseña temporal será «{CONTRASENA_TEMPORAL}» y el usuario deberá cambiarla al ingresar.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Buscar usuario</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-3"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                cargar(busqueda.trim());
              }}
            >
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="restablecer-busqueda" className="block text-sm font-medium mb-1">
                  Nombre, cédula o correo
                </label>
                <Input
                  id="restablecer-busqueda"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Ej.: María Rodríguez, 1-1234-5678 o correo"
                  maxLength={100}
                />
              </div>
              <Button type="submit" variant="outline" disabled={cargando}>
                <Search className="h-4 w-4 mr-2" aria-hidden="true" />
                Buscar
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <Card>
          <CardContent className="pt-6">
            {cargando ? (
              <LoadingStatus label="Cargando usuarios…" />
            ) : usuarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se encontraron usuarios.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="p-3 font-medium">Nombre</th>
                      <th className="p-3 font-medium">Cédula</th>
                      <th className="p-3 font-medium">Correo</th>
                      <th className="p-3 font-medium">Rol</th>
                      <th className="p-3 font-medium">Cuenta</th>
                      <th className="p-3 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => {
                      const estado = estadoCuenta(u);
                      return (
                        <tr key={u.id_persona} className="border-t border-border">
                          <td className="p-3 font-medium">{u.nombre_completo}</td>
                          <td className="p-3">{u.cedula || '—'}</td>
                          <td className="p-3 text-muted-foreground">{u.correo || '—'}</td>
                          <td className="p-3">{u.rol_label}</td>
                          <td className="p-3">
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${estado.clase}`}>
                              {estado.texto}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onRestablecer(u)}
                              disabled={restableciendoId != null}
                              aria-label={`Restablecer contraseña de ${u.nombre_completo}`}
                            >
                              {restableciendoId === u.id_persona ? 'Restableciendo…' : 'Restablecer contraseña'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {usuarios.length >= 50 && (
                  <p className="pt-3 text-xs text-muted-foreground">
                    Se muestran los primeros 50 resultados. Afine la búsqueda para encontrar a otra persona.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
