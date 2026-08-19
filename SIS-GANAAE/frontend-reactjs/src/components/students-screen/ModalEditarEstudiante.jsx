import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, AlertTriangle, Search, UserPlus, UserCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import servicio from '../../services/personaServices';
import { useDialog } from '../../context/DialogContext';
import LoadingStatus from '../ui/LoadingStatus';
import {
  notificarHaciendaIndisponible,
  MENSAJE_DATOS_MANUAL,
} from '../../utils/haciendaConsulta';

const emptyForm = {
  nombre_completo: '',
  cedula: '',
  correo: '',
  telefono: '',
  direccion: '',
  fecha_nacimiento: '',
};

const emptyNuevoEncargado = {
  cedula: '',
  nombre_completo: '',
  correo: '',
  telefono: '',
  direccion: '',
  fecha_nacimiento: '',
  patria_potestad: false,
};

function FieldLabel({ htmlFor, children }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </Label>
  );
}

function resetConsultaEncargado(setters) {
  setters.setConsultaEstado(null);
  setters.setConsultaMensaje('');
  setters.setEncargadoIdInterno(null);
}

function validarEncargadoCompleto(enc, { encargadoIdInterno }) {
  if (encargadoIdInterno) {
    return enc.patria_potestad ? null : 'Debe confirmar patria potestad del encargado.';
  }
  const obligatorios = [
    'nombre_completo',
    'cedula',
    'correo',
    'telefono',
    'direccion',
    'fecha_nacimiento',
  ];
  for (const key of obligatorios) {
    if (!String(enc[key] || '').trim()) {
      return 'Complete todos los datos del encargado: nombre completo, cédula, correo, teléfono, dirección y fecha de nacimiento.';
    }
  }
  if (!enc.patria_potestad) {
    return 'Debe confirmar patria potestad del encargado.';
  }
  return null;
}

export default function ModalEditarEstudiante({ estudiante, onClose, onGuardado }) {
  const { toast } = useDialog();
  const [tab, setTab] = useState('datos');
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [tutorActual, setTutorActual] = useState(null);
  const [encargadoSeleccionado, setEncargadoSeleccionado] = useState(null);
  const [busquedaEncargado, setBusquedaEncargado] = useState('');
  const [resultadosEncargado, setResultadosEncargado] = useState([]);
  const [buscandoEncargado, setBuscandoEncargado] = useState(false);
  const [modoNuevoEncargado, setModoNuevoEncargado] = useState(false);
  const [nuevoEncargado, setNuevoEncargado] = useState(emptyNuevoEncargado);
  const [patriaPotestadBusqueda, setPatriaPotestadBusqueda] = useState(false);
  const [consultaEstado, setConsultaEstado] = useState(null);
  const [consultaMensaje, setConsultaMensaje] = useState('');
  const [encargadoIdInterno, setEncargadoIdInterno] = useState(null);
  const [buscandoCedula, setBuscandoCedula] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!estudiante?.id_persona) return;

    let cancelado = false;
    setCargandoDetalle(true);
    setError('');

    servicio
      .getEstudianteDetalle(estudiante.id_persona)
      .then((detalle) => {
        if (cancelado) return;
        setForm({
          nombre_completo: detalle.nombre_completo || '',
          cedula: detalle.cedula || '',
          correo: detalle.correo || '',
          telefono: detalle.telefono || '',
          direccion: detalle.direccion || '',
          fecha_nacimiento: detalle.fecha_nacimiento
            ? String(detalle.fecha_nacimiento).slice(0, 10)
            : '',
        });
        setTutorActual(detalle.tutor || null);
        setEncargadoSeleccionado(detalle.tutor || null);
      })
      .catch((err) => {
        if (!cancelado) {
          setError(err?.error || err?.message || 'No se pudo cargar el detalle del estudiante');
        }
      })
      .finally(() => {
        if (!cancelado) setCargandoDetalle(false);
      });

    return () => {
      cancelado = true;
    };
  }, [estudiante?.id_persona]);

  useEffect(() => {
    const q = busquedaEncargado.trim();
    if (q.length < 2 || modoNuevoEncargado) {
      setResultadosEncargado([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setBuscandoEncargado(true);
      try {
        const data = await servicio.buscarEncargados(q);
        setResultadosEncargado(Array.isArray(data?.encargados) ? data.encargados : []);
      } catch {
        setResultadosEncargado([]);
      } finally {
        setBuscandoEncargado(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [busquedaEncargado, modoNuevoEncargado]);

  const validarFormulario = useCallback(() => {
    const obligatorios = [
      'nombre_completo',
      'cedula',
      'correo',
      'telefono',
      'direccion',
      'fecha_nacimiento',
    ];
    const errors = {};
    obligatorios.forEach((key) => {
      const value = form[key];
      if (value == null || String(value).trim() === '') errors[key] = true;
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form]);

  const consultarCedulaEncargado = async () => {
    const cedula = nuevoEncargado.cedula.trim();
    if (cedula.length < 5) {
      setConsultaMensaje('Ingrese una identificación válida (mínimo 5 caracteres).');
      setConsultaEstado(null);
      return;
    }

    setBuscandoCedula(true);
    setConsultaMensaje('');
    setEncargadoIdInterno(null);

    try {
      const data = await servicio.consultarCedula(cedula);

      if (data.existeInterno && data.persona) {
        const p = data.persona;
        setNuevoEncargado((prev) => ({
          ...prev,
          cedula: p.cedula || cedula,
          nombre_completo: p.nombre_completo || '',
          correo: p.correo || '',
          telefono: p.telefono || '',
          direccion: p.direccion || '',
          fecha_nacimiento: p.fecha_nacimiento || '',
        }));
        setEncargadoIdInterno(p.id_persona);
        setEncargadoSeleccionado(p);
        setConsultaEstado('interno');
        setConsultaMensaje(
          'Persona encontrada en el sistema. Se vinculará automáticamente como tutor de este estudiante.'
        );
        return;
      }

      if (data.encontradoExterno && data.persona) {
        const p = data.persona;
        setNuevoEncargado((prev) => ({
          ...prev,
          cedula: p.cedula || cedula,
          nombre_completo: p.nombre_completo || '',
          correo: '',
          telefono: '',
          direccion: '',
          fecha_nacimiento: '',
        }));
        setEncargadoIdInterno(null);
        setConsultaEstado('hacienda');
        setConsultaMensaje(
          'Datos obtenidos de Hacienda. Complete correo, teléfono, dirección y fecha de nacimiento del encargado.'
        );
        return;
      }

      setNuevoEncargado((prev) => ({
        ...prev,
        nombre_completo: '',
        correo: '',
        telefono: '',
        direccion: '',
        fecha_nacimiento: '',
      }));
      setEncargadoIdInterno(null);
      if (notificarHaciendaIndisponible(toast, data)) {
        setConsultaEstado('manual');
        setConsultaMensaje(MENSAJE_DATOS_MANUAL);
      } else {
        setConsultaEstado('no_encontrado');
        setConsultaMensaje(
          data.mensaje || 'No se encontró en el sistema ni en Hacienda. Complete los datos manualmente.'
        );
      }
    } catch (err) {
      if (notificarHaciendaIndisponible(toast, null, err)) {
        setConsultaEstado('manual');
        setConsultaMensaje(MENSAJE_DATOS_MANUAL);
      } else {
        setConsultaEstado('manual');
        setConsultaMensaje(
          err?.error || err?.message || 'No fue posible consultar la cédula. Puede ingresar los datos manualmente.'
        );
      }
    } finally {
      setBuscandoCedula(false);
    }
  };

  const onCedulaEncargadoChange = (value) => {
    setNuevoEncargado((n) => ({ ...n, cedula: value }));
    resetConsultaEncargado({ setConsultaEstado, setConsultaMensaje, setEncargadoIdInterno });
  };

  const bloqueoInterno = consultaEstado === 'interno';
  const bloqueoHacienda = consultaEstado === 'hacienda';
  const nombreReadOnly = bloqueoInterno || bloqueoHacienda;
  const datosIdentidadReadOnly = bloqueoInterno;

  const guardar = async () => {
    if (!estudiante?.id_persona) return;
    if (!validarFormulario()) {
      setError('Complete todos los datos personales del estudiante.');
      setTab('datos');
      return;
    }

    const tutorPrevioId = tutorActual?.id_persona ?? null;
    const encargadoCambio =
      modoNuevoEncargado ||
      (encargadoSeleccionado?.id_persona &&
        encargadoSeleccionado.id_persona !== tutorPrevioId);

    if (modoNuevoEncargado) {
      const errEnc = validarEncargadoCompleto(nuevoEncargado, { encargadoIdInterno });
      if (errEnc) {
        setError(errEnc);
        setTab('tutor');
        return;
      }
    } else if (
      encargadoSeleccionado?.id_persona &&
      encargadoSeleccionado.id_persona !== tutorPrevioId &&
      !patriaPotestadBusqueda
    ) {
      setError('Debe confirmar patria potestad del encargado seleccionado.');
      setTab('tutor');
      return;
    }

    setGuardando(true);
    setError('');

    try {
      const body = {
        nombre_completo: form.nombre_completo.trim(),
        cedula: form.cedula.trim(),
        correo: form.correo.trim(),
        telefono: form.telefono.trim(),
        direccion: form.direccion.trim(),
        fecha_nacimiento: form.fecha_nacimiento,
      };

      if (encargadoCambio) {
        if (modoNuevoEncargado) {
          if (encargadoIdInterno) {
            body.encargado_id = encargadoIdInterno;
            body.patria_potestad = nuevoEncargado.patria_potestad;
          } else {
            body.nuevo_encargado = {
              cedula: nuevoEncargado.cedula.trim(),
              nombre_completo: nuevoEncargado.nombre_completo.trim(),
              correo: nuevoEncargado.correo.trim(),
              telefono: nuevoEncargado.telefono.trim(),
              direccion: nuevoEncargado.direccion.trim(),
              fecha_nacimiento: nuevoEncargado.fecha_nacimiento,
              patria_potestad: nuevoEncargado.patria_potestad,
            };
            body.patria_potestad = nuevoEncargado.patria_potestad;
          }
        } else if (encargadoSeleccionado?.id_persona) {
          body.encargado_id = encargadoSeleccionado.id_persona;
          body.patria_potestad = patriaPotestadBusqueda;
        }
      }

      await servicio.updateEstudiante(estudiante.id_persona, body);
      toast('Los datos se han actualizado correctamente.', 'success');
      onGuardado?.();
      onClose?.();
    } catch (err) {
      setError(err?.error || err?.message || 'Error al guardar los cambios');
    } finally {
      setGuardando(false);
    }
  };

  if (!estudiante) return null;

  const sinTutor = !tutorActual?.id_persona && !encargadoSeleccionado?.id_persona && !modoNuevoEncargado;

  const renderPatriaPotestad = (checked, onChange, id) => (
    <label
      htmlFor={id}
      className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 cursor-pointer hover:bg-muted/30"
    >
      <Checkbox
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="text-sm leading-snug">
        <span className="font-medium">Confirmo patria potestad</span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          Declaro que el encargado tiene patria potestad o representación legal sobre el estudiante.
        </span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-card rounded-xl shadow-2xl border w-full max-w-2xl max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-editar-estudiante-titulo"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b shrink-0">
          <div>
            <h2 id="modal-editar-estudiante-titulo" className="text-lg font-semibold">
              Editar estudiante
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Actualice los datos del alumno y asigne un tutor o encargado legal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b shrink-0">
          <button
            type="button"
            onClick={() => setTab('datos')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'datos'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Datos personales
          </button>
          <button
            type="button"
            onClick={() => setTab('tutor')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'tutor'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tutor / Encargado
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cargandoDetalle ? (
            <div className="flex items-center justify-center py-16">
              <LoadingStatus label="Cargando información del estudiante…" />
            </div>
          ) : (
            <>
              {error && (
                <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {tab === 'datos' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <FieldLabel htmlFor="nombre_completo">Nombre completo</FieldLabel>
                    <Input
                      id="nombre_completo"
                      value={form.nombre_completo}
                      onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
                      className={fieldErrors.nombre_completo ? 'border-red-500' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="cedula">Cédula / Identificación</FieldLabel>
                    <Input
                      id="cedula"
                      value={form.cedula}
                      onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))}
                      className={fieldErrors.cedula ? 'border-red-500' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="correo">Correo electrónico</FieldLabel>
                    <Input
                      id="correo"
                      type="email"
                      value={form.correo}
                      onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
                      placeholder="ej. alumno@pendiente.sistema.local"
                      className={fieldErrors.correo ? 'border-red-500' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="telefono">Teléfono</FieldLabel>
                    <Input
                      id="telefono"
                      value={form.telefono}
                      onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                      className={fieldErrors.telefono ? 'border-red-500' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="fecha_nacimiento">Fecha de nacimiento</FieldLabel>
                    <Input
                      id="fecha_nacimiento"
                      type="date"
                      value={form.fecha_nacimiento}
                      onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
                      className={fieldErrors.fecha_nacimiento ? 'border-red-500' : ''}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <FieldLabel htmlFor="direccion">Dirección</FieldLabel>
                    <Textarea
                      id="direccion"
                      value={form.direccion}
                      onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                      rows={3}
                      className={fieldErrors.direccion ? 'border-red-500' : ''}
                    />
                  </div>
                </div>
              )}

              {tab === 'tutor' && (
                <div className="space-y-5">
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Estado actual
                    </p>
                    {encargadoSeleccionado?.id_persona && !modoNuevoEncargado ? (
                      <div className="flex items-start gap-3">
                        <UserCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{encargadoSeleccionado.nombre_completo}</p>
                          <p className="text-sm text-muted-foreground">
                            {encargadoSeleccionado.cedula}
                            {encargadoSeleccionado.correo ? ` · ${encargadoSeleccionado.correo}` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Sin tutor asociado
                      </span>
                    )}
                  </div>

                  {!modoNuevoEncargado && (
                    <div className="space-y-3">
                      <FieldLabel htmlFor="buscar_encargado">Buscar encargado existente</FieldLabel>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="buscar_encargado"
                          value={busquedaEncargado}
                          onChange={(e) => setBusquedaEncargado(e.target.value)}
                          placeholder="Nombre, cédula o correo (mín. 2 caracteres)…"
                          className="pl-9"
                        />
                      </div>
                      {buscandoEncargado && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Buscando…
                        </p>
                      )}
                      {resultadosEncargado.length > 0 && (
                        <ul className="rounded-lg border divide-y max-h-44 overflow-y-auto">
                          {resultadosEncargado.map((enc) => (
                            <li key={enc.id_persona}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEncargadoSeleccionado(enc);
                                  setPatriaPotestadBusqueda(false);
                                  setBusquedaEncargado('');
                                  setResultadosEncargado([]);
                                }}
                                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors ${
                                  encargadoSeleccionado?.id_persona === enc.id_persona ? 'bg-accent' : ''
                                }`}
                              >
                                <span className="font-medium">{enc.nombre_completo}</span>
                                <span className="text-muted-foreground"> · {enc.cedula}</span>
                                {enc.correo && (
                                  <span className="block text-xs text-muted-foreground truncate">
                                    {enc.correo}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {encargadoSeleccionado?.id_persona && (
                        <div className="pt-2">
                          {renderPatriaPotestad(
                            patriaPotestadBusqueda,
                            setPatriaPotestadBusqueda,
                            'patria_busqueda'
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setModoNuevoEncargado((v) => !v);
                        setNuevoEncargado(emptyNuevoEncargado);
                        setPatriaPotestadBusqueda(false);
                        setResultadosEncargado([]);
                        resetConsultaEncargado({
                          setConsultaEstado,
                          setConsultaMensaje,
                          setEncargadoIdInterno,
                        });
                      }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <UserPlus className="h-4 w-4" />
                      {modoNuevoEncargado ? 'Buscar encargado existente' : 'Registrar nuevo tutor / encargado'}
                    </button>

                    {modoNuevoEncargado && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-dashed p-4 bg-muted/20">
                        <div className="space-y-1.5 sm:col-span-2">
                          <FieldLabel htmlFor="enc_cedula">Cédula del encargado</FieldLabel>
                          <div className="flex gap-2">
                            <Input
                              id="enc_cedula"
                              value={nuevoEncargado.cedula}
                              onChange={(e) => onCedulaEncargadoChange(e.target.value)}
                              onBlur={() => {
                                if (nuevoEncargado.cedula.trim().length >= 5) {
                                  consultarCedulaEncargado();
                                }
                              }}
                              placeholder="Ej. 1-2345-6789"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={consultarCedulaEncargado}
                              disabled={buscandoCedula}
                              title="Consultar cédula"
                            >
                              {buscandoCedula ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          {consultaMensaje && (
                            <p
                              className={`text-xs rounded-lg px-3 py-2 mt-2 ${
                                consultaEstado === 'interno'
                                  ? 'bg-sky-50 text-sky-900 border border-sky-200'
                                  : consultaEstado === 'hacienda'
                                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                    : consultaEstado === 'no_encontrado'
                                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                      : 'bg-muted text-muted-foreground border'
                              }`}
                            >
                              {consultaMensaje}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <FieldLabel htmlFor="enc_nombre_completo">Nombre completo</FieldLabel>
                          <Input
                            id="enc_nombre_completo"
                            value={nuevoEncargado.nombre_completo}
                            readOnly={nombreReadOnly}
                            onChange={(e) =>
                              setNuevoEncargado((n) => ({ ...n, nombre_completo: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <FieldLabel htmlFor="enc_correo">Correo electrónico</FieldLabel>
                          <Input
                            id="enc_correo"
                            type="email"
                            value={nuevoEncargado.correo}
                            readOnly={datosIdentidadReadOnly}
                            onChange={(e) =>
                              setNuevoEncargado((n) => ({ ...n, correo: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <FieldLabel htmlFor="enc_telefono">Teléfono</FieldLabel>
                          <Input
                            id="enc_telefono"
                            value={nuevoEncargado.telefono}
                            readOnly={datosIdentidadReadOnly}
                            onChange={(e) =>
                              setNuevoEncargado((n) => ({ ...n, telefono: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <FieldLabel htmlFor="enc_fecha_nacimiento">Fecha de nacimiento</FieldLabel>
                          <Input
                            id="enc_fecha_nacimiento"
                            type="date"
                            value={nuevoEncargado.fecha_nacimiento}
                            readOnly={datosIdentidadReadOnly}
                            onChange={(e) =>
                              setNuevoEncargado((n) => ({ ...n, fecha_nacimiento: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <FieldLabel htmlFor="enc_direccion">Dirección</FieldLabel>
                          <Textarea
                            id="enc_direccion"
                            value={nuevoEncargado.direccion}
                            readOnly={datosIdentidadReadOnly}
                            onChange={(e) =>
                              setNuevoEncargado((n) => ({ ...n, direccion: e.target.value }))
                            }
                            rows={2}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          {renderPatriaPotestad(
                            nuevoEncargado.patria_potestad,
                            (v) => setNuevoEncargado((n) => ({ ...n, patria_potestad: v })),
                            'patria_nuevo'
                          )}
                        </div>

                        {!encargadoIdInterno && (
                          <p className="sm:col-span-2 text-xs text-muted-foreground">
                            Si la persona no existe, se registrará como padre/tutor con contraseña inicial
                            «liceomarti».
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {sinTutor && tab === 'tutor' && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Este estudiante proviene de precarga masiva sin encargado. Consulte la cédula del tutor
                      para autocompletar datos o complete el formulario manualmente.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t shrink-0 bg-muted/20">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando || cargandoDetalle}>
            {guardando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
