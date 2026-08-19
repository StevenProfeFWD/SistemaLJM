import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Pencil,
  ArrowLeftRight,
  X,
  Loader2,
  History,
  FileDown,
  Eye,
} from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import personalServicio from '../../services/personalServices';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../../components/ui/button';
import LoadingStatus from '../../components/ui/LoadingStatus';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';

function mensajeError(err) {
  return err?.response?.data?.error || err?.error || err?.message || 'Error inesperado';
}

function badgeEstado(activo) {
  return activo
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-slate-200 text-slate-700 border-slate-300';
}

function badgeSustitucion(estado) {
  if (estado === 'vigente') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (estado === 'programada') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function formatFecha(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('es-CR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  return '—';
}

function ModalEditarDocente({ persona, onClose, onGuardar }) {
  const [form, setForm] = useState({
    cedula: persona?.cedula || '',
    nombre_completo: persona?.nombre_completo || '',
    correo: persona?.correo || '',
    telefono: persona?.telefono || '',
    direccion: persona?.direccion || '',
    fecha_nacimiento: persona?.fecha_nacimiento
      ? String(persona.fecha_nacimiento).slice(0, 10)
      : '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await onGuardar(form);
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  };

  if (!persona) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card">
          <h3 className="font-semibold text-lg">Editar datos del personal</h3>
          <button type="button" onClick={onClose} className="rounded-md border p-1" aria-label="Cerrar diálogo">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            {persona.rol_label} · ID interno {persona.id_persona}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-cedula">Cédula / DIMEX</Label>
              <Input
                id="edit-cedula"
                value={form.cedula}
                onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-nombre">Nombre completo</Label>
              <Input
                id="edit-nombre"
                value={form.nombre_completo}
                onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-correo">Correo</Label>
              <Input
                id="edit-correo"
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-telefono">Teléfono</Label>
              <Input
                id="edit-telefono"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-direccion">Dirección</Label>
              <Textarea
                id="edit-direccion"
                className="min-h-20"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-fecha">Fecha de nacimiento</Label>
              <Input
                id="edit-fecha"
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                required
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalSustitucion({ titular, onClose, onGuardar }) {
  const [idSustituto, setIdSustituto] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [materiasTitular, setMateriasTitular] = useState([]);
  const [candidatos, setCandidatos] = useState([]);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const data = await personalServicio.getCandidatosSustituto(titular.id_persona);
        if (cancel) return;
        setMateriasTitular(data.materias_titular || []);
        setCandidatos(data.candidatos || []);
        setAviso(data.mensaje || '');
      } catch (err) {
        if (!cancel) setError(mensajeError(err));
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [titular?.id_persona]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idSustituto || !fechaInicio || !fechaFin) {
      setError('Complete sustituto y rango de fechas.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar({
        id_profesor_titular: titular.id_persona,
        id_profesor_sustituto: Number(idSustituto),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  };

  if (!titular) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card">
          <h3 className="font-semibold text-lg">Registrar sustituto</h3>
          <button type="button" onClick={onClose} className="rounded-md border p-1" aria-label="Cerrar diálogo">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Titular: <span className="font-medium text-foreground">{titular.nombre_completo}</span>
          </p>

          {cargando ? (
            <LoadingStatus label="Cargando materias y candidatos…" />
          ) : (
            <>
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">Materias que imparte el titular (año actual):</p>
                {materiasTitular.length === 0 ? (
                  <p className="text-muted-foreground">Sin asignaciones activas.</p>
                ) : (
                  <ul className="list-disc list-inside text-muted-foreground">
                    {materiasTitular.map((m) => (
                      <li key={m.id_materia}>{m.nombre_materia}</li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Solo se listan docentes habilitados para <strong>todas</strong> esas materias. El sustituto heredará temporalmente las listas de asistencia; las actas históricas no se alteran.
              </p>
              <div className="space-y-2">
                <Label htmlFor="sustituto">Profesor sustituto</Label>
                <Select
                  id="sustituto"
                  value={idSustituto}
                  onChange={(e) => setIdSustituto(e.target.value)}
                  disabled={candidatos.length === 0}
                >
                  <option value="">
                    {candidatos.length === 0 ? 'No hay candidatos compatibles' : 'Seleccione docente'}
                  </option>
                  {candidatos.map((d) => (
                    <option key={d.id_persona} value={d.id_persona}>
                      {d.nombre_completo}
                    </option>
                  ))}
                </Select>
                {aviso && candidatos.length === 0 && (
                  <p className="text-xs text-amber-700">{aviso}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fecha-inicio">Desde</Label>
                  <Input
                    id="fecha-inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fecha-fin">Hasta</Label>
                  <Input
                    id="fecha-fin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || cargando || candidatos.length === 0}>
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Confirmar sustitución'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalHistorialSustituciones({ persona, onClose, onDescargarPdf, onActualizado }) {
  const { confirm, toast } = useDialog();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ sustituciones: [], anio_lectivo: '' });
  const [descargando, setDescargando] = useState(false);
  const [cancelandoId, setCancelandoId] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await personalServicio.getSustituciones(persona?.id_persona);
      setData(res);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, [persona?.id_persona]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const descargar = async () => {
    setDescargando(true);
    try {
      await onDescargarPdf(persona?.id_persona);
    } finally {
      setDescargando(false);
    }
  };

  const cancelarSustitucion = async (s) => {
    const idRef = s.id_sustitucion_referencia;
    if (!idRef) return;

    const ok = await confirm({
      title: 'Cancelar sustitución',
      message:
        s.estado === 'programada'
          ? '¿Anular esta sustitución programada antes de que entre en vigencia?'
          : '¿Finalizar anticipadamente esta sustitución vigente?',
      confirmLabel: 'Sí, cancelar',
      variant: 'destructive',
    });
    if (!ok) return;

    setCancelandoId(idRef);
    try {
      await personalServicio.cancelarSustitucion(idRef);
      toast('Sustitución cancelada correctamente.', 'success');
      await cargar();
      onActualizado?.();
    } catch (err) {
      toast(mensajeError(err), 'error');
    } finally {
      setCancelandoId(null);
    }
  };

  if (!persona) return null;

  const titulo = persona.nombre_rol === 'profesor'
    ? `Sustituciones — ${persona.nombre_completo}`
    : `Historial vinculado — ${persona.nombre_completo}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl max-w-3xl w-full border max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h3 className="font-semibold text-lg">{titulo}</h3>
            <p className="text-xs text-muted-foreground">
              Año lectivo {data.anio_lectivo || '—'} · Como titular o sustituto
            </p>
          </div>
          <div className="flex items-center gap-2">
            {persona.nombre_rol === 'profesor' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={descargar}
                disabled={descargando || cargando}
              >
                {descargando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-1" />
                    PDF
                  </>
                )}
              </Button>
            )}
            <button type="button" onClick={onClose} className="rounded-md border p-1" aria-label="Cerrar historial de sustituciones">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {cargando ? (
            <LoadingStatus label="Cargando historial de sustituciones…" />
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : data.sustituciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay sustituciones registradas para este docente en el año lectivo actual.
            </p>
          ) : (
            <div className="space-y-3">
              {data.sustituciones.map((s) => {
                const key = `${s.id_titular}-${s.id_sustituto}-${s.fecha_desde}-${s.fecha_hasta}`;
                const esTitular = s.id_titular === persona.id_persona;
                return (
                  <div key={key} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeSustitucion(s.estado)}`}
                      >
                        {s.estado === 'vigente'
                          ? 'Vigente'
                          : s.estado === 'programada'
                            ? 'Programada'
                            : 'Finalizada'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatFecha(s.fecha_desde)} — {formatFecha(s.fecha_hasta)}
                      </span>
                    </div>
                    <p className="text-sm">
                      {esTitular ? (
                        <>
                          <span className="text-muted-foreground">Sustituido por:</span>{' '}
                          <strong>{s.nombre_sustituto}</strong>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground">Cubrió a:</span>{' '}
                          <strong>{s.nombre_titular}</strong>
                        </>
                      )}
                    </p>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Asignaciones cubiertas:</span>
                      <ul className="mt-1 list-disc list-inside">
                        {s.asignaciones.map((a) => (
                          <li key={a.id_sustitucion}>
                            {a.nombre_materia} — {a.nombre_seccion}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {(s.estado === 'vigente' || s.estado === 'programada') && (
                      <div className="pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-200 hover:bg-red-50"
                          disabled={cancelandoId === s.id_sustitucion_referencia}
                          onClick={() => cancelarSustitucion(s)}
                        >
                          {cancelandoId === s.id_sustitucion_referencia ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Cancelando...
                            </>
                          ) : (
                            'Cancelar sustitución'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GestionDocentes() {
  const { confirm, toast, alert } = useDialog();
  const [personal, setPersonal] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [sustitucionTitular, setSustitucionTitular] = useState(null);
  const [historialPersona, setHistorialPersona] = useState(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await personalServicio.getPersonal();
      setPersonal(data.personal || []);
    } catch (err) {
      setPersonal([]);
      await alert(mensajeError(err), { variant: 'error', title: 'Error' });
    } finally {
      setCargando(false);
    }
  }, [alert]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarEdicion = async (form) => {
    await personalServicio.actualizarPersonal(editando.id_persona, form);
    toast('Datos actualizados correctamente.', 'success');
    setEditando(null);
    await cargar();
  };

  const toggleEstado = async (persona) => {
    const activo = persona.activo !== false;
    const ok = await confirm({
      title: activo ? '¿Inactivar personal?' : '¿Reactivar personal?',
      message: activo
        ? `${persona.nombre_completo} no podrá iniciar sesión hasta ser reactivado.`
        : `${persona.nombre_completo} volverá a poder acceder al sistema.`,
      confirmLabel: activo ? 'Inactivar' : 'Reactivar',
      cancelLabel: 'Cancelar',
      variant: activo ? 'destructive' : 'success',
      icon: activo ? 'destructive' : 'success',
    });
    if (!ok) return;

    try {
      const res = await personalServicio.cambiarEstadoPersonal(persona.id_persona, !activo);
      toast(res.message || 'Estado actualizado.', 'success');
      await cargar();
    } catch (err) {
      await alert(mensajeError(err), { variant: 'error', title: 'Error' });
    }
  };

  const guardarSustitucion = async (body) => {
    const res = await personalServicio.registrarSustitucion(body);
    toast(res.message || 'Sustitución registrada.', 'success');
    setSustitucionTitular(null);
    await cargar();
  };

  const descargarPdfSustituciones = async (idPersona = null) => {
    setDescargandoPdf(true);
    try {
      const blob = await personalServicio.descargarSustitucionesPdf(idPersona);
      const slug = idPersona ? `profesor_${idPersona}` : 'todas';
      personalServicio.guardarBlob(blob, `reporte_sustituciones_${slug}.pdf`);
      toast('PDF descargado correctamente.', 'success');
    } catch (err) {
      await alert(mensajeError(err), { variant: 'error', title: 'Error al generar PDF' });
    } finally {
      setDescargandoPdf(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold">Gestión de Personal Docente</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Consulte, edite, inactive o registre sustituciones. Los sustitutos deben estar habilitados
              para las mismas materias que imparte el titular. Revise el historial y exporte reportes en PDF.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => descargarPdfSustituciones()}
            disabled={descargandoPdf}
            className="shrink-0"
          >
            {descargandoPdf ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            PDF todas las sustituciones
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plantilla institucional</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <LoadingStatus label="Cargando personal…" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-2">Nombre</th>
                      <th className="py-2 px-2">Rol</th>
                      <th className="py-2 px-2">Correo</th>
                      <th className="py-2 px-2">Teléfono</th>
                      <th className="py-2 px-2">Estado</th>
                      <th className="py-2 px-2">Carga / Sust.</th>
                      <th className="py-2 px-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personal.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-muted-foreground">
                          No hay personal registrado.
                        </td>
                      </tr>
                    ) : (
                      personal.map((p) => (
                        <tr key={p.id_persona} className="border-b last:border-b-0">
                          <td className="py-2 px-2 font-medium">{p.nombre_completo}</td>
                          <td className="py-2 px-2">{p.rol_label}</td>
                          <td className="py-2 px-2">{p.correo}</td>
                          <td className="py-2 px-2">{p.telefono}</td>
                          <td className="py-2 px-2">
                            <button
                              type="button"
                              onClick={() => toggleEstado(p)}
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold cursor-pointer hover:opacity-80 ${badgeEstado(p.activo !== false)}`}
                              title="Clic para cambiar estado"
                            >
                              {p.activo !== false ? 'Activo' : 'Inactivo'}
                            </button>
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {p.nombre_rol === 'profesor' ? (
                              <button
                                type="button"
                                onClick={() => setHistorialPersona(p)}
                                className="text-left text-primary hover:underline"
                                title="Ver historial de sustituciones"
                              >
                                {p.total_asignaciones} asign.
                                {(p.sustituciones_activas_como_titular > 0 ||
                                  p.sustituciones_activas_como_sustituto > 0) && (
                                  <>
                                    {' '}
                                    ·{' '}
                                    {p.sustituciones_activas_como_titular > 0 && (
                                      <span className="text-blue-700">
                                        {p.sustituciones_activas_como_titular} sust. activa(s)
                                      </span>
                                    )}
                                    {p.sustituciones_activas_como_sustituto > 0 && (
                                      <span className="text-emerald-700">
                                        {p.sustituciones_activas_como_titular > 0 ? ' · ' : ''}
                                        cubre {p.sustituciones_activas_como_sustituto}
                                      </span>
                                    )}
                                  </>
                                )}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditando(p)}
                                title="Editar datos"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {p.nombre_rol === 'profesor' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setHistorialPersona(p)}
                                  title="Historial de sustituciones"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              )}
                              {p.nombre_rol === 'profesor' && p.activo !== false && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSustitucionTitular(p)}
                                  title="Registrar sustituto"
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Ayuda rápida
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Sustitución:</strong> solo aparecen docentes con formación habilitada en todas las materias
              que el titular imparte este año.
            </p>
            <p>
              <strong>Historial:</strong> clic en la columna &quot;Carga / Sust.&quot; o en el ícono de reloj para ver
              sustituto, fechas y materias cubiertas.
            </p>
            <p>
              <strong>PDF:</strong> use el botón superior para todas las sustituciones, o el PDF dentro del historial
              de cada profesor.
            </p>
          </CardContent>
        </Card>
      </main>

      {editando && (
        <ModalEditarDocente
          persona={editando}
          onClose={() => setEditando(null)}
          onGuardar={guardarEdicion}
        />
      )}

      {sustitucionTitular && (
        <ModalSustitucion
          titular={sustitucionTitular}
          onClose={() => setSustitucionTitular(null)}
          onGuardar={guardarSustitucion}
        />
      )}

      {historialPersona && (
        <ModalHistorialSustituciones
          persona={historialPersona}
          onClose={() => setHistorialPersona(null)}
          onDescargarPdf={descargarPdfSustituciones}
          onActualizado={cargar}
        />
      )}
    </div>
  );
}
