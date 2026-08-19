import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import servicio from '../../services/asignacionAsistenciaServices';
import personaServicio from '../../services/personaServices';
import { MATERIAS_CATALOGO_EVENT } from '../../lib/materiasCatalogEvents';
import { etiquetaLeccion, resumenHorariosLeccion } from '../../lib/formatLeccion';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { useDialog } from '../../context/DialogContext';
import DocenteSearchCombobox from '../../components/asignacion/DocenteSearchCombobox';

const DIAS = [
  { v: 1, label: 'Lunes' },
  { v: 2, label: 'Martes' },
  { v: 3, label: 'Miércoles' },
  { v: 4, label: 'Jueves' },
  { v: 5, label: 'Viernes' },
];

const esLeccionAlmuerzo = (lec) => lec.id_leccion === 7 || Boolean(lec.es_recreo_almuerzo);

const etiquetaLeccionAsignacion = (lec) => {
  const base = lec.etiqueta || etiquetaLeccion(lec);
  if (esLeccionAlmuerzo(lec)) {
    return `${base.replace(/\s*—\s*Almuerzo\s*$/, '')} [ALMUERZO - BLOQUEADO]`;
  }
  return base;
};

const bloqueInicial = () => ({ dia_semana: 1, id_leccion: 1 });

function msgErr(err) {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  return err.message || err.error || 'Error al procesar la solicitud';
}

function HabilitarMateriasDocentes() {
  const [materiasCatalogo, setMateriasCatalogo] = useState([]);
  const [profesoresLista, setProfesoresLista] = useState([]);
  const [editProfesorId, setEditProfesorId] = useState('');
  const [materiasEditSeleccion, setMateriasEditSeleccion] = useState([]);
  const [statusEdit, setStatusEdit] = useState({ type: '', message: '' });
  const [loadingEdit, setLoadingEdit] = useState(false);

  const cargarCatalogos = useCallback(async () => {
    try {
      const cat = await servicio.getCatalogos();
      setMateriasCatalogo(cat.materias || []);
      const personas = await personaServicio.getPersonas();
      setProfesoresLista((personas || []).filter((p) => p.nombre_rol === 'profesor'));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    const onMateriasActualizadas = () => cargarCatalogos();
    window.addEventListener(MATERIAS_CATALOGO_EVENT, onMateriasActualizadas);
    return () => window.removeEventListener(MATERIAS_CATALOGO_EVENT, onMateriasActualizadas);
  }, [cargarCatalogos]);

  useEffect(() => {
    if (!editProfesorId) {
      setMateriasEditSeleccion([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await personaServicio.getMateriasHabilitadasProfesor(editProfesorId);
        if (!cancelled) {
          setMateriasEditSeleccion((data.materias || []).map((m) => m.id_materia));
        }
      } catch (e) {
        if (!cancelled) {
          setMateriasEditSeleccion([]);
          setStatusEdit({ type: 'error', message: msgErr(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editProfesorId]);

  const toggleMateriaEdit = (idMateria) => {
    setMateriasEditSeleccion((prev) =>
      prev.includes(idMateria) ? prev.filter((id) => id !== idMateria) : [...prev, idMateria]
    );
  };

  const guardarMateriasEdit = async () => {
    if (!editProfesorId) return;
    try {
      setLoadingEdit(true);
      setStatusEdit({ type: '', message: '' });
      await personaServicio.putMateriasHabilitadasProfesor(editProfesorId, materiasEditSeleccion);
      setStatusEdit({ type: 'success', message: 'Materias habilitadas actualizadas.' });
    } catch (error) {
      setStatusEdit({ type: 'error', message: msgErr(error) });
    } finally {
      setLoadingEdit(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Habilitar materias a docentes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Defina qué materias puede dictar cada docente antes de asignarle carga en la pestaña de
          asignación a secciones.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusEdit.message && (
          <Alert
            className={
              statusEdit.type === 'error'
                ? 'border-destructive/20 bg-destructive/5'
                : 'border-emerald-500/20 bg-emerald-500/5'
            }
          >
            <AlertDescription
              className={statusEdit.type === 'error' ? 'text-destructive' : 'text-emerald-700'}
            >
              {statusEdit.message}
            </AlertDescription>
          </Alert>
        )}
        <DocenteSearchCombobox
          docentes={profesoresLista}
          value={editProfesorId}
          onChange={(id) => {
            setEditProfesorId(id);
            setStatusEdit({ type: '', message: '' });
          }}
        />
        {editProfesorId && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {materiasCatalogo.map((m) => (
                <label key={m.id_materia} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={materiasEditSeleccion.includes(m.id_materia)}
                    onChange={() => toggleMateriaEdit(m.id_materia)}
                  />
                  {m.nombre_materia}
                </label>
              ))}
            </div>
            <Button type="button" onClick={guardarMateriasEdit} disabled={loadingEdit}>
              {loadingEdit ? 'Guardando...' : 'Guardar materias habilitadas'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ModalEditarAsignacion({
  asignacion,
  catalogos,
  lecciones,
  onClose,
  onGuardado,
}) {
  const { alert } = useDialog();
  const [materiasHabilitadas, setMateriasHabilitadas] = useState([]);
  const [form, setForm] = useState({
    id_persona_profesor: String(asignacion?.id_persona_profesor || ''),
    id_materia: String(asignacion?.id_materia || ''),
    id_seccion: String(asignacion?.id_seccion || ''),
    horarios:
      asignacion?.horarios?.length > 0
        ? asignacion.horarios.map((h) => ({
            dia_semana: h.dia_semana,
            id_leccion: h.id_leccion,
          }))
        : [bloqueInicial()],
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const id = form.id_persona_profesor;
    if (!id) {
      setMateriasHabilitadas([]);
      return;
    }
    personaServicio
      .getMateriasHabilitadasProfesor(id)
      .then((data) => setMateriasHabilitadas(data.materias || []))
      .catch(() => setMateriasHabilitadas([]));
  }, [form.id_persona_profesor]);

  const addHorario = () => {
    setForm((f) => ({ ...f, horarios: [...f.horarios, bloqueInicial()] }));
  };

  const updateHorario = (i, field, value) => {
    setForm((f) => ({
      ...f,
      horarios: f.horarios.map((h, j) => (j === i ? { ...h, [field]: value } : h)),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await servicio.actualizarAsignacion(asignacion.id_profesor_materia_seccion, {
        id_persona_profesor: Number(form.id_persona_profesor),
        id_materia: Number(form.id_materia),
        id_seccion: Number(form.id_seccion),
        horarios: form.horarios.map((h) => ({
          dia_semana: Number(h.dia_semana),
          id_leccion: Number(h.id_leccion),
        })),
      });
      await onGuardado();
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 && data?.detalle) {
        await alert(`Conflicto de horario: ${data.detalle}`, { variant: 'error', title: 'Conflicto' });
      } else {
        await alert(data?.error || data?.message || 'Error al actualizar.', {
          variant: 'error',
          title: 'Error',
        });
      }
    } finally {
      setGuardando(false);
    }
  };

  if (!asignacion) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card">
          <h3 className="font-semibold text-lg">Editar asignación</h3>
          <button type="button" onClick={onClose} className="rounded-md border p-1" aria-label="Cerrar diálogo">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Profesor</label>
              <Select
                value={form.id_persona_profesor}
                onChange={(e) =>
                  setForm({ ...form, id_persona_profesor: e.target.value, id_materia: '' })
                }
              >
                {(catalogos.profesores || []).map((p) => (
                  <option key={p.id_persona} value={p.id_persona}>
                    {p.nombre_completo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Materia</label>
              <Select
                value={form.id_materia}
                onChange={(e) => setForm({ ...form, id_materia: e.target.value })}
              >
                {materiasHabilitadas.map((m) => (
                  <option key={m.id_materia} value={m.id_materia}>
                    {m.nombre_materia}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sección</label>
              <Select
                value={form.id_seccion}
                onChange={(e) => setForm({ ...form, id_seccion: e.target.value })}
              >
                {(catalogos.secciones || []).map((s) => (
                  <option key={s.id_seccion} value={s.id_seccion}>
                    {s.nombre_seccion}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Lecciones</label>
              <Button type="button" variant="outline" size="sm" onClick={addHorario}>
                + Añadir
              </Button>
            </div>
            {form.horarios.map((h, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center mb-2">
                <Select
                  value={h.dia_semana}
                  onChange={(e) => updateHorario(i, 'dia_semana', Number(e.target.value))}
                >
                  {DIAS.map((d) => (
                    <option key={d.v} value={d.v}>
                      {d.label}
                    </option>
                  ))}
                </Select>
                <Select
                  className="min-w-[200px]"
                  value={h.id_leccion}
                  onChange={(e) => updateHorario(i, 'id_leccion', Number(e.target.value))}
                >
                  {lecciones.map((lec) => (
                    <option
                      key={lec.id_leccion}
                      value={lec.id_leccion}
                      disabled={esLeccionAlmuerzo(lec)}
                    >
                      {etiquetaLeccionAsignacion(lec)}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
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

function AsignarMateriasSecciones() {
  const { toast, alert, confirm } = useDialog();
  const [asignaciones, setAsignaciones] = useState([]);
  const [lecciones, setLecciones] = useState([]);
  const [catalogos, setCatalogos] = useState({ materias: [], secciones: [], profesores: [] });
  const [materiasHabilitadasProfesor, setMateriasHabilitadasProfesor] = useState([]);
  const [form, setForm] = useState({
    id_persona_profesor: '',
    id_materia: '',
    id_seccion: '',
    horarios: [bloqueInicial()],
  });
  const [editando, setEditando] = useState(null);

  const recargarAsignaciones = () => {
    servicio.getAsignaciones().then(setAsignaciones).catch(() => setAsignaciones([]));
  };

  useEffect(() => {
    servicio.getAsignaciones().then(setAsignaciones).catch(() => setAsignaciones([]));
    servicio.getCatalogos().then(setCatalogos).catch(() => ({}));
    servicio.getLecciones().then(setLecciones).catch(() => setLecciones([]));
  }, []);

  useEffect(() => {
    const onCatalogoMaterias = () => {
      servicio.getCatalogos().then(setCatalogos).catch(() => {});
      const id = form.id_persona_profesor;
      if (id) {
        personaServicio
          .getMateriasHabilitadasProfesor(id)
          .then((data) => setMateriasHabilitadasProfesor(data.materias || []))
          .catch(() => {});
      }
    };
    window.addEventListener(MATERIAS_CATALOGO_EVENT, onCatalogoMaterias);
    return () => window.removeEventListener(MATERIAS_CATALOGO_EVENT, onCatalogoMaterias);
  }, [form.id_persona_profesor]);

  useEffect(() => {
    const id = form.id_persona_profesor;
    if (!id) {
      setMateriasHabilitadasProfesor([]);
      return;
    }
    setMateriasHabilitadasProfesor([]);
    let cancelled = false;
    personaServicio
      .getMateriasHabilitadasProfesor(id)
      .then((data) => {
        if (!cancelled) {
          setMateriasHabilitadasProfesor(data.materias || []);
          setForm((f) => ({ ...f, id_materia: '' }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMateriasHabilitadasProfesor([]);
          setForm((f) => ({ ...f, id_materia: '' }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.id_persona_profesor]);

  const addHorario = () => {
    setForm((f) => ({ ...f, horarios: [...f.horarios, bloqueInicial()] }));
  };

  const updateHorario = (i, field, value) => {
    setForm((f) => ({
      ...f,
      horarios: f.horarios.map((h, j) => (j === i ? { ...h, [field]: value } : h)),
    }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!form.id_persona_profesor || !form.id_materia || !form.id_seccion) {
      await alert('Complete profesor, materia y sección.', { variant: 'info', title: 'Datos incompletos' });
      return;
    }
    try {
      await servicio.crearAsignacion({
        id_persona_profesor: Number(form.id_persona_profesor),
        id_materia: Number(form.id_materia),
        id_seccion: Number(form.id_seccion),
        horarios: form.horarios.map((h) => ({
          dia_semana: Number(h.dia_semana),
          id_leccion: Number(h.id_leccion),
        })),
      });
      toast('Asignación creada correctamente.', 'success');
      recargarAsignaciones();
      setForm({ ...form, horarios: [bloqueInicial()] });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 && data?.detalle) {
        await alert(`Conflicto de horario: ${data.detalle}`, { variant: 'error', title: 'Conflicto de horario' });
        return;
      }
      await alert(data?.error || data?.message || 'Error al crear la asignación.', {
        variant: 'error',
        title: 'Error',
      });
    }
  };

  const eliminarAsignacion = async (a) => {
    const ok = await confirm({
      title: '¿Está seguro de eliminar esta asignación?',
      message: `Se borrará el horario vinculado a ${a.nombre_profesor} — ${a.nombre_materia} — ${a.nombre_seccion}. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'destructive',
      icon: 'destructive',
    });
    if (!ok) return;

    try {
      await servicio.eliminarAsignacion(a.id_profesor_materia_seccion);
      toast('Asignación eliminada correctamente.', 'success');
      recargarAsignaciones();
    } catch (err) {
      await alert(err?.response?.data?.error || err?.message || 'Error al eliminar.', {
        variant: 'error',
        title: 'Error',
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Asignar materias a secciones</CardTitle>
          <p className="text-sm text-muted-foreground">
            Asigne un profesor a una materia y sección para el año en curso. Elija día (1–5) y lección
            del catálogo oficial (15 periodos, 7:00–17:40).
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Profesor</label>
                <Select
                  value={form.id_persona_profesor}
                  onChange={(e) =>
                    setForm({ ...form, id_persona_profesor: e.target.value, id_materia: '' })
                  }
                >
                  <option value="">Seleccione</option>
                  {(catalogos.profesores || []).map((p) => (
                    <option key={p.id_persona} value={p.id_persona}>
                      {p.nombre_completo}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Materia (habilitadas)</label>
                <Select
                  value={form.id_materia}
                  onChange={(e) => setForm({ ...form, id_materia: e.target.value })}
                  disabled={!form.id_persona_profesor}
                >
                  <option value="">{form.id_persona_profesor ? 'Seleccione' : 'Primero elija docente'}</option>
                  {(materiasHabilitadasProfesor.length ? materiasHabilitadasProfesor : []).map((m) => (
                    <option key={m.id_materia} value={m.id_materia}>
                      {m.nombre_materia}
                    </option>
                  ))}
                </Select>
                {form.id_persona_profesor && materiasHabilitadasProfesor.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Este docente no tiene materias habilitadas. Habilítelas en la pestaña anterior antes de asignar carga.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sección</label>
                <Select
                  value={form.id_seccion}
                  onChange={(e) => setForm({ ...form, id_seccion: e.target.value })}
                >
                  <option value="">Seleccione</option>
                  {(catalogos.secciones || []).map((s) => (
                    <option key={s.id_seccion} value={s.id_seccion}>
                      {s.nombre_seccion}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Lecciones (día + periodo)</label>
                <Button type="button" variant="outline" size="sm" onClick={addHorario}>
                  + Añadir
                </Button>
              </div>
              {form.horarios.map((h, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center mb-2">
                  <Select
                    value={h.dia_semana}
                    onChange={(e) => updateHorario(i, 'dia_semana', Number(e.target.value))}
                  >
                    {DIAS.map((d) => (
                      <option key={d.v} value={d.v}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="min-w-[220px]"
                    value={h.id_leccion}
                    onChange={(e) => updateHorario(i, 'id_leccion', Number(e.target.value))}
                  >
                    {lecciones.map((lec) => {
                      const bloqueada = esLeccionAlmuerzo(lec);
                      return (
                        <option key={lec.id_leccion} value={lec.id_leccion} disabled={bloqueada}>
                          {etiquetaLeccionAsignacion(lec)}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              ))}
            </div>
            <Button type="submit">Crear asignación</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignaciones actuales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Profesor</th>
                  <th className="py-2 px-2">Materia</th>
                  <th className="py-2 px-2">Sección</th>
                  <th className="py-2 px-2">Horario</th>
                  <th className="py-2 px-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {asignaciones.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-muted-foreground">
                      No hay asignaciones.
                    </td>
                  </tr>
                ) : (
                  asignaciones.map((a) => (
                    <tr key={a.id_profesor_materia_seccion} className="border-b last:border-b-0">
                      <td className="py-2 px-2">{a.nombre_profesor}</td>
                      <td className="py-2 px-2">{a.nombre_materia}</td>
                      <td className="py-2 px-2">{a.nombre_seccion}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">
                        {resumenHorariosLeccion(a.horarios)}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditando(a)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => eliminarAsignacion(a)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editando && (
        <ModalEditarAsignacion
          asignacion={editando}
          catalogos={catalogos}
          lecciones={lecciones}
          onClose={() => setEditando(null)}
          onGuardado={async () => {
            toast('Asignación actualizada correctamente.', 'success');
            setEditando(null);
            recargarAsignaciones();
          }}
        />
      )}
    </>
  );
}

export default function Asignacion() {
  const [tab, setTab] = useState('habilitar');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Asignación de Materias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure primero las materias habilitadas de cada docente y luego asigne la carga académica por sección.
          </p>
        </div>

        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setTab('habilitar')}
            className={`px-4 py-3 text-sm font-medium ${
              tab === 'habilitar'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Habilitar materias a docentes
          </button>
          <button
            type="button"
            onClick={() => setTab('asignar')}
            className={`px-4 py-3 text-sm font-medium ${
              tab === 'asignar'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Asignar materias a secciones
          </button>
        </div>

        {tab === 'habilitar' && <HabilitarMateriasDocentes />}
        {tab === 'asignar' && <AsignarMateriasSecciones />}
      </main>
    </div>
  );
}
