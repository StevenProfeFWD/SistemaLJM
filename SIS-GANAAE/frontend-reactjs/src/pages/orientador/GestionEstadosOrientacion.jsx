import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Loader2, User, CheckCircle2, X, History } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import orientacionServicio from '../../services/orientacionServices';
import {
  esRegistroEditable,
  esExpulsionDefinitiva,
  MENSAJE_EXPULSION_DEFINITIVA,
  optionsConfirmacionExpulsion,
} from '../../utils/vigenciaEstadoOrientacion';
import { mapApiError } from '../../lib/errors';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useDialog } from '../../context/DialogContext';

const TIPOS_ESTADO = [
  {
    value: 'suspension',
    label: 'Suspensión',
    desc: 'Restricción temporal de clases',
    ring: 'ring-red-500',
    bg: 'bg-red-50 border-red-200 text-red-900',
    active: 'bg-red-600 text-white border-red-600',
  },
  {
    value: 'permiso_institucional',
    label: 'Permiso institucional',
    desc: 'Autorización oficial del día',
    ring: 'ring-yellow-500',
    bg: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    active: 'bg-yellow-500 text-white border-yellow-500',
  },
  {
    value: 'expulsion',
    label: 'Expulsión',
    desc: 'Separación del plantel',
    ring: 'ring-gray-700',
    bg: 'bg-gray-100 border-gray-300 text-gray-900',
    active: 'bg-gray-900 text-white border-gray-900',
  },
];

const LABEL_TIPO = Object.fromEntries(TIPOS_ESTADO.map((t) => [t.value, t.label]));

function mensajeConfirmacionRegistro(tipoEstado) {
  if (tipoEstado === 'permiso_institucional') {
    return '¿Confirmar el registro de este permiso especial? El estudiante quedará justificado de sus lecciones durante el rango de fechas estipulado.';
  }
  return '¿Está seguro de aplicar esta sanción conductual? Este registro afectará el expediente del estudiante y notificará de inmediato a sus encargados legales.';
}

function tituloConfirmacionRegistro(tipoEstado) {
  if (tipoEstado === 'permiso_institucional') {
    return 'Confirmar permiso especial';
  }
  return 'Confirmar sanción conductual';
}

function formInicial() {
  return {
    tipo_estado: 'suspension',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_fin: '',
    motivo: '',
  };
}

function Toast({ mensaje, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 max-w-md rounded-lg border border-green-200 bg-green-50 px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2">
      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
      <p className="text-sm text-green-800 flex-1">{mensaje}</p>
      <button type="button" onClick={onClose} className="text-green-600 hover:text-green-800" aria-label="Cerrar notificación">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function GestionEstadosOrientacion() {
  const location = useLocation();
  const buscadorRef = useRef(null);
  const { confirm } = useDialog();

  const [consulta, setConsulta] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const [estudiante, setEstudiante] = useState(null);

  const [historial, setHistorial] = useState([]);
  const [form, setForm] = useState(formInicial());
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const [errorForm, setErrorForm] = useState('');

  const cargarHistorial = useCallback(async (idPersona) => {
    if (!idPersona) {
      setHistorial([]);
      return;
    }
    try {
      const data = await orientacionServicio.getEstadosOrientacion(idPersona);
      setHistorial(Array.isArray(data) ? data : []);
    } catch {
      setHistorial([]);
    }
  }, []);

  const seleccionarEstudiante = useCallback(async (item) => {
    setEstudiante(item);
    setConsulta(item.nombre_completo);
    setMostrarSugerencias(false);
    setSinResultados(false);
    setEditId(null);
    setForm(formInicial());
    setErrorForm('');
    await cargarHistorial(item.id_persona);
  }, [cargarHistorial]);

  useEffect(() => {
    const idFromNav = location.state?.idEstudiante;
    if (!idFromNav) return;
    orientacionServicio
      .buscarEstudiantesOrientacion({ id_estudiante: idFromNav })
      .then((res) => {
        if (res?.[0]) seleccionarEstudiante(res[0]);
      })
      .catch(() => {});
    window.history.replaceState({}, document.title);
  }, [location.state?.idEstudiante, seleccionarEstudiante]);

  useEffect(() => {
    const term = consulta.trim();
    if (estudiante && term === estudiante.nombre_completo) {
      return undefined;
    }
    if (term.length < 2) {
      setSugerencias([]);
      setSinResultados(false);
      setBuscando(false);
      return undefined;
    }

    setBuscando(true);
    const timer = setTimeout(async () => {
      try {
        const res = await orientacionServicio.buscarEstudiantesOrientacion({ q: term });
        const lista = Array.isArray(res) ? res : [];
        setSugerencias(lista);
        setSinResultados(lista.length === 0);
        setMostrarSugerencias(true);
      } catch {
        setSugerencias([]);
        setSinResultados(true);
      } finally {
        setBuscando(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [consulta, estudiante]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setMostrarSugerencias(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const reiniciarBusqueda = () => {
    setEstudiante(null);
    setConsulta('');
    setSugerencias([]);
    setSinResultados(false);
    setHistorial([]);
    setForm(formInicial());
    setEditId(null);
    setErrorForm('');
  };

  const editarRegistro = (r) => {
    if (!esRegistroEditable(r)) return;
    setEditId(r.id_estado_periodo);
    setForm({
      tipo_estado: r.tipo_estado,
      fecha_inicio: r.fecha_inicio?.slice(0, 10) || '',
      fecha_fin: r.fecha_fin?.slice(0, 10) || '',
      motivo: r.motivo || '',
    });
    setErrorForm('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const mensajeExitoTipo = (tipo) => {
    const map = {
      suspension: 'Suspensión registrada',
      permiso_institucional: 'Permiso institucional registrado',
      expulsion: 'Expulsión registrada',
    };
    return map[tipo] || 'Estado registrado';
  };

  const tieneExpulsionDefinitiva = Boolean(
    estudiante?.expulsado_definitivo || historial.some((r) => esExpulsionDefinitiva(r))
  );

  const validarFormulario = () => {
    if (tieneExpulsionDefinitiva) {
      setErrorForm(MENSAJE_EXPULSION_DEFINITIVA);
      return false;
    }
    if (!estudiante) {
      setErrorForm('Debe seleccionar un estudiante antes de registrar.');
      return false;
    }
    if (form.tipo_estado !== 'expulsion' && !form.fecha_fin) {
      setErrorForm('Indique la fecha de fin del periodo (excepto expulsión definitiva).');
      return false;
    }
    if (!form.motivo.trim()) {
      setErrorForm('El motivo oficial es obligatorio.');
      return false;
    }
    return true;
  };

  const ejecutarGuardado = async () => {
    setGuardando(true);
    setErrorForm('');
    try {
      const body = {
        id_persona_estudiante: estudiante.id_persona,
        tipo_estado: form.tipo_estado,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.tipo_estado === 'expulsion' && !form.fecha_fin ? null : form.fecha_fin || null,
        motivo: form.motivo.trim(),
      };

      if (editId) {
        await orientacionServicio.actualizarEstadoOrientacion(editId, body);
        setToast(`${mensajeExitoTipo(form.tipo_estado)} correctamente para ${estudiante.nombre_completo}.`);
        setEditId(null);
        setForm(formInicial());
        await cargarHistorial(estudiante.id_persona);
      } else {
        await orientacionServicio.crearEstadoOrientacion(body);
        setToast(`${mensajeExitoTipo(form.tipo_estado)} correctamente para ${estudiante.nombre_completo}.`);
        reiniciarBusqueda();
      }
    } catch (err) {
      setErrorForm(mapApiError(err, 'No fue posible guardar el registro.'));
    } finally {
      setGuardando(false);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    if (!editId) {
      if (form.tipo_estado === 'expulsion') {
        const ok = await confirm(optionsConfirmacionExpulsion(estudiante.nombre_completo));
        if (!ok) return;
      } else {
        const esPermiso = form.tipo_estado === 'permiso_institucional';
        const ok = await confirm({
          title: tituloConfirmacionRegistro(form.tipo_estado),
          message: mensajeConfirmacionRegistro(form.tipo_estado),
          confirmLabel: 'Confirmar registro',
          cancelLabel: 'Cancelar',
          variant: esPermiso ? 'default' : 'destructive',
          icon: esPermiso ? 'help' : 'warning',
        });
        if (!ok) return;
      }
    }

    await ejecutarGuardado();
  };

  const tipoSel = TIPOS_ESTADO.find((t) => t.value === form.tipo_estado);

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-background to-slate-100">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
          <header className="text-center space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Gestión de estados especiales
            </h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Busque al estudiante, confirme su identidad y registre suspensiones, permisos o expulsiones.
            </p>
          </header>

          {/* Paso 1: Buscador */}
          {!estudiante && (
            <section ref={buscadorRef} className="relative">
              <label htmlFor="buscar-estudiante" className="sr-only">
                Buscar estudiante
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                <Input
                  id="buscar-estudiante"
                  type="search"
                  autoComplete="off"
                  placeholder="Buscar por cédula o nombre completo..."
                  className="pl-12 pr-12 py-4 h-auto rounded-xl shadow-sm"
                  value={consulta}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setEstudiante(null);
                  }}
                  onFocus={() => {
                    if (consulta.trim().length >= 2) setMostrarSugerencias(true);
                  }}
                />
                {buscando && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground animate-spin" />
                )}
              </div>

              {mostrarSugerencias && consulta.trim().length >= 2 && !buscando && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                  {sugerencias.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-center text-muted-foreground">
                      No se encontraron estudiantes con esa cédula o nombre.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {sugerencias.map((s) => (
                        <li key={s.id_persona}>
                          <button
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-accent/60 transition-colors flex items-center gap-3"
                            onClick={() => seleccionarEstudiante(s)}
                          >
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{s.nombre_completo}</p>
                              <p className="text-xs text-muted-foreground">
                                Cédula {s.cedula}
                                {s.nombre_seccion ? ` · ${s.nombre_seccion}` : ''}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {sinResultados && !mostrarSugerencias && consulta.trim().length >= 2 && !buscando && (
                <p className="mt-3 text-sm text-center text-muted-foreground">
                  No se encontraron estudiantes con esa cédula o nombre.
                </p>
              )}
            </section>
          )}

          {/* Paso 2: Ficha de confirmación */}
          {estudiante && (
            <Card className="border-primary/20 shadow-md">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex gap-4">
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        Estudiante seleccionado
                      </p>
                      <h2 className="text-xl font-bold text-foreground">{estudiante.nombre_completo}</h2>
                      <p className="text-sm font-semibold text-primary mt-1">Cédula: {estudiante.cedula}</p>
                      <p className="text-sm text-muted-foreground">{estudiante.correo || 'Sin correo registrado'}</p>
                      {estudiante.nombre_seccion && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Sección {estudiante.nombre_seccion}
                          {estudiante.ano_a_cursar ? ` · ${estudiante.ano_a_cursar}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {tieneExpulsionDefinitiva ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900 border border-red-300">
                        Expulsión definitiva
                      </span>
                    ) : estudiante.matricula_activa ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 border border-green-200">
                        Matrícula activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                        Sin matrícula vigente
                      </span>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={reiniciarBusqueda}>
                      Cambiar estudiante
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Paso 3: Formulario */}
          {estudiante && !tieneExpulsionDefinitiva && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">
                  {editId ? 'Editar estado especial' : 'Registrar estado especial'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={guardar} className="space-y-6">
                  <fieldset>
                    <legend className="text-sm font-medium mb-3">Tipo de estado</legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {TIPOS_ESTADO.map((t) => {
                        const activo = form.tipo_estado === t.value;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setForm({ ...form, tipo_estado: t.value })}
                            className={`rounded-xl border-2 p-4 text-left transition-all ${
                              activo
                                ? `${t.active} ring-2 ${t.ring} ring-offset-2`
                                : `${t.bg} hover:opacity-90`
                            }`}
                          >
                            <span className="block font-semibold text-sm">{t.label}</span>
                            <span className={`block text-xs mt-1 ${activo ? 'opacity-90' : 'opacity-70'}`}>
                              {t.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="fecha-inicio" className="block text-sm font-medium mb-1.5">
                        Desde
                      </label>
                      <Input
                        id="fecha-inicio"
                        type="date"
                        required
                        value={form.fecha_inicio}
                        onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="fecha-fin" className="block text-sm font-medium mb-1.5">
                        Hasta
                        {form.tipo_estado === 'expulsion' && (
                          <span className="font-normal text-muted-foreground"> (opcional)</span>
                        )}
                      </label>
                      <Input
                        id="fecha-fin"
                        type="date"
                        required={form.tipo_estado !== 'expulsion'}
                        value={form.fecha_fin}
                        onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="motivo" className="block text-sm font-medium mb-1.5">
                      Motivo oficial (Departamento de Orientación)
                    </label>
                    <Textarea
                      id="motivo"
                      rows={4}
                      required
                      placeholder="Describa la justificación institucional del estado..."
                      className="min-h-[100px]"
                      value={form.motivo}
                      onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                    />
                  </div>

                  {errorForm && (
                    <p
                      role="alert"
                      className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                    >
                      {errorForm}
                    </p>
                  )}

                  <div className="flex flex-col items-center gap-3 pt-2">
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full sm:w-auto min-w-[240px] h-12 text-base"
                      disabled={guardando}
                    >
                      {guardando ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Registrando...
                        </>
                      ) : (
                        editId ? 'Actualizar estado especial' : 'Registrar estado especial'
                      )}
                    </Button>
                    {editId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditId(null);
                          setForm(formInicial());
                          setErrorForm('');
                        }}
                      >
                        Cancelar edición
                      </Button>
                    )}
                    {tipoSel && !editId && (
                      <p className="text-xs text-muted-foreground text-center">
                        Se aplicará como <strong>{tipoSel.label}</strong> en la toma de asistencia.
                      </p>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {estudiante && tieneExpulsionDefinitiva && (
            <Card className="border-red-200 bg-red-50/60 shadow-sm">
              <CardContent className="pt-6">
                <p className="text-sm text-red-900 leading-relaxed">
                  <strong>{MENSAJE_EXPULSION_DEFINITIVA}.</strong> La matrícula vigente fue cancelada y la ficha del
                  estudiante quedó archivada. Solo puede consultar el historial; no es posible registrar nuevos estados
                  especiales.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Historial (solo con estudiante seleccionado) */}
          {estudiante && historial.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Historial de estados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left py-2.5 px-3 font-medium">Tipo</th>
                        <th className="text-left py-2.5 px-3 font-medium">Desde</th>
                        <th className="text-left py-2.5 px-3 font-medium">Hasta</th>
                        <th className="text-left py-2.5 px-3 font-medium">Motivo</th>
                        <th className="py-2.5 px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((r) => (
                        <tr key={r.id_estado_periodo} className="border-t">
                          <td className="py-2.5 px-3">{LABEL_TIPO[r.tipo_estado] || r.tipo_estado}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{r.fecha_inicio}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{r.fecha_fin || '—'}</td>
                          <td className="py-2.5 px-3 max-w-[200px] truncate" title={r.motivo || ''}>
                            {r.motivo || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            {esRegistroEditable(r) ? (
                              <button
                                type="button"
                                className="text-primary text-xs font-medium hover:underline"
                                onClick={() => editarRegistro(r)}
                              >
                                Editar
                              </button>
                            ) : (
                              <span
                                className="text-xs text-muted-foreground"
                                title={esExpulsionDefinitiva(r) ? MENSAJE_EXPULSION_DEFINITIVA : 'Registro histórico'}
                              >
                                {esExpulsionDefinitiva(r) ? 'Definitiva' : 'Histórico'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {toast && <Toast mensaje={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
