import { useState, useEffect, useCallback, useMemo } from 'react';
import MainBar from '../../components/side-bar/mainBar';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Shield, Loader2, UserPlus } from 'lucide-react';
import superadminApi from '../../services/superadminServices';
import { useDialog } from '../../context/DialogContext';
import LoadingStatus from '../../components/ui/LoadingStatus';

const emptyForm = {
  nombre_completo: '',
  cedula: '',
  correo: '',
  telefono: '',
  direccion: '',
  fecha_nacimiento: '',
};

function badgeActivo(activo) {
  return activo
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';
}

function etiquetaRol(rol) {
  if (rol === 'super_administrador') return 'Super Administrador';
  if (rol === 'administrador') return 'Administrador';
  return rol || '—';
}

function badgeRol(rol) {
  if (rol === 'super_administrador') {
    return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800';
  }
  return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800';
}

function esSuperAdmin(rol) {
  return rol === 'super_administrador';
}

export default function GestionAdministradores() {
  const { confirm, toast } = useDialog();
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(true);

  const cargar = useCallback(async () => {
    setCargandoLista(true);
    try {
      const data = await superadminApi.getAdministradores();
      setLista(Array.isArray(data?.administradores) ? data.administradores : []);
    } catch (e) {
      toast(e?.error || e?.message || 'No se pudo cargar la lista de administradores', 'error');
    } finally {
      setCargandoLista(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((a) => {
      const n = (a.nombre_completo || '').toLowerCase();
      const c = (a.cedula || '').toLowerCase();
      const e = (a.correo || '').toLowerCase();
      const r = etiquetaRol(a.nombre_rol).toLowerCase();
      return n.includes(q) || c.includes(q) || e.includes(q) || r.includes(q);
    });
  }, [lista, filtro]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditandoId(null);
  };

  const onEditar = (admin) => {
    setEditandoId(admin.id_persona);
    setForm({
      nombre_completo: admin.nombre_completo || '',
      cedula: admin.cedula || '',
      correo: admin.correo || '',
      telefono: admin.telefono || '',
      direccion: admin.direccion || '',
      fecha_nacimiento: admin.fecha_nacimiento ? String(admin.fecha_nacimiento).slice(0, 10) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const guardar = async (e) => {
    e.preventDefault();
    const campos = Object.values(form);
    if (campos.some((v) => !String(v || '').trim())) {
      toast('Todos los campos son obligatorios.', 'error');
      return;
    }

    const ok = await confirm({
      title: editandoId ? 'Confirmar actualización' : 'Registrar administrador',
      message: editandoId
        ? `¿Guardar los cambios del administrador «${form.nombre_completo}»?`
        : `¿Registrar a «${form.nombre_completo}» como administrador? La contraseña inicial será «liceomarti».`,
      confirmLabel: editandoId ? 'Guardar cambios' : 'Crear cuenta',
      cancelLabel: 'Cancelar',
      icon: 'default',
    });
    if (!ok) return;

    setLoading(true);
    try {
      if (editandoId) {
        await superadminApi.actualizarAdministrador(editandoId, form);
        toast('Administrador actualizado correctamente.', 'success');
      } else {
        const res = await superadminApi.crearAdministrador(form);
        toast(res?.message || 'Administrador registrado. Contraseña inicial: liceomarti', 'success');
      }
      resetForm();
      await cargar();
    } catch (err) {
      toast(err?.error || err?.message || 'Error al guardar', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleActivo = async (admin) => {
    const activo = !(admin.cuenta_activa !== false && admin.activo !== false);
    const accion = activo ? 'reactivar' : 'desactivar';
    const ok = await confirm({
      title: activo ? 'Reactivar cuenta' : 'Desactivar cuenta',
      message: activo
        ? `¿Reactivar el acceso de «${admin.nombre_completo}» al sistema?`
        : `¿Desactivar la cuenta de «${admin.nombre_completo}»? No podrá iniciar sesión hasta ser reactivada.`,
      confirmLabel: activo ? 'Reactivar' : 'Desactivar',
      cancelLabel: 'Cancelar',
      variant: activo ? 'default' : 'destructive',
      icon: activo ? 'default' : 'destructive',
    });
    if (!ok) return;

    setLoading(true);
    try {
      await superadminApi.setAdministradorActivo(admin.id_persona, activo);
      toast(
        activo ? 'Cuenta reactivada correctamente.' : 'Cuenta desactivada correctamente.',
        'success'
      );
      await cargar();
    } catch (err) {
      toast(err?.error || err?.message || 'Error al cambiar el estado de la cuenta', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Gestión de administradores</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Alta, edición y control de acceso de los administradores operativos del liceo.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {editandoId ? 'Editar administrador' : 'Nuevo administrador'}
            </CardTitle>
            {!editandoId && (
              <p className="text-sm text-muted-foreground">
                Al crear la cuenta, la contraseña inicial será <strong>liceomarti</strong> (cambio obligatorio en el primer inicio).
              </p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              <div className="space-y-2">
                <Label htmlFor="nombre_completo">Nombre completo</Label>
                <Input
                  id="nombre_completo"
                  value={form.nombre_completo}
                  onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cedula">Cédula</Label>
                <Input
                  id="cedula"
                  value={form.cedula}
                  onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="correo">Correo institucional</Label>
                <Input
                  id="correo"
                  type="email"
                  value={form.correo}
                  onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  value={form.direccion}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
                <Input
                  id="fecha_nacimiento"
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
                  required
                />
              </div>
              <div className="md:col-span-2 flex gap-2 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando…
                    </>
                  ) : editandoId ? (
                    'Actualizar administrador'
                  ) : (
                    'Registrar administrador'
                  )}
                </Button>
                {editandoId && (
                  <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
                    Cancelar edición
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administradores del liceo ({filtrados.length})</CardTitle>
            <div className="pt-2">
              <Input
                placeholder="Buscar por nombre, cédula, correo o rol…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="max-w-md"
              />
            </div>
          </CardHeader>
          <CardContent>
            {cargandoLista ? (
              <LoadingStatus label="Cargando administradores…" className="justify-center py-8" />
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Nombre</th>
                      <th className="text-left p-3 font-medium">Cédula</th>
                      <th className="text-left p-3 font-medium">Correo</th>
                      <th className="text-left p-3 font-medium">Rol</th>
                      <th className="text-left p-3 font-medium">Estado</th>
                      <th className="text-right p-3 font-medium w-48">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((a) => {
                      const activo = a.cuenta_activa !== false && a.activo !== false;
                      const soloConsulta = esSuperAdmin(a.nombre_rol);
                      return (
                        <tr key={a.id_persona} className="border-t border-border">
                          <td className="p-3 font-medium">{a.nombre_completo}</td>
                          <td className="p-3">{a.cedula}</td>
                          <td className="p-3 text-muted-foreground">{a.correo}</td>
                          <td className="p-3">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badgeRol(a.nombre_rol)}`}
                            >
                              {etiquetaRol(a.nombre_rol)}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeActivo(activo)}`}
                            >
                              {activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-2 whitespace-nowrap">
                            {soloConsulta ? (
                              <span className="text-xs text-muted-foreground italic">Cuenta protegida</span>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onEditar(a)}
                                  disabled={loading}
                                >
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={activo ? 'destructive' : 'default'}
                                  onClick={() => toggleActivo(a)}
                                  disabled={loading}
                                >
                                  {activo ? 'Desactivar' : 'Reactivar'}
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtrados.length === 0 && (
                  <p className="p-6 text-center text-muted-foreground text-sm">
                    No hay administradores registrados.
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
