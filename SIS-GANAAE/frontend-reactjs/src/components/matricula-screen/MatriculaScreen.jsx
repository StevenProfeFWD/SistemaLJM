import { useState } from 'react';
import servicioMatricula from '../../services/matriculaServices';
import { useDialog } from '../../context/DialogContext';
import {
  notificarHaciendaIndisponible,
} from '../../utils/haciendaConsulta';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Radio } from '../ui/radio';
import { filledChoiceLabel } from '../ui/form-control-styles';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { mapApiError } from '../../lib/errors';

const HORARIO_REFERENCIA = 'Lunes a Viernes 7:00 am a 5:40 pm';

/** Valor enviado al backend (enum ano_a_cursar). Nuevo ingreso siempre séptimo. */
const ANO_NUEVO_INGRESO_API = 'septimo';
/** Texto mostrado en solo lectura en la pestaña Nuevo ingreso */
const ANO_NUEVO_INGRESO_LABEL = 'Sétimo Año';

const isBlank = (v) => v == null || String(v).trim() === '';

const initialNuevo = {
  cedula: '',
  nombre_completo: '',
  correo: '',
  telefono: '',
  direccion: '',
  fecha_nacimiento: '',
  ano_a_cursar: ANO_NUEVO_INGRESO_API,
  viene_de_otro_colegio: false,
  colegio_anterior: '',
  cedula_encargado: '',
  nombre_completo_encargado: '',
  correo_encargado: '',
  telefono_encargado: '',
  direccion_encargado: '',
  fecha_nacimiento_encargado: '',
  patria_potestad: false,
  id_persona_encargado: '',
};

const initialTraslado = {
  ...initialNuevo,
  colegio_anterior: '',
  ano_a_cursar: '',
};

const emptyFormRegular = () => ({
  id_persona_estudiante: '',
  ano_a_cursar: '',
  mismo_tutor: true,
  id_persona_tutor: '',
  id_curso_lectivo: '',
  patria_potestad: false,
  cedula_encargado: '',
  nombre_completo_encargado: '',
  correo_encargado: '',
  telefono_encargado: '',
  direccion_encargado: '',
  fecha_nacimiento_encargado: '',
});

function MatriculaScreen() {
  const { toast } = useDialog();
  const [tipoMatricula, setTipoMatricula] = useState('nuevo_ingreso');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [anoActual] = useState(new Date().getFullYear());
  const [cedulaBusqueda, setCedulaBusqueda] = useState('');
  const [estudianteEncontrado, setEstudianteEncontrado] = useState(null);
  const [buscandoEstudiante, setBuscandoEstudiante] = useState(false);
  const [formNuevoIngreso, setFormNuevoIngreso] = useState(initialNuevo);
  const [formRegular, setFormRegular] = useState(emptyFormRegular);
  const [cedulaBusquedaTutor, setCedulaBusquedaTutor] = useState('');
  const [buscandoTutor, setBuscandoTutor] = useState(false);
  /** null | 'local' | 'hacienda' — tutor distinto al periodo anterior */
  const [tutorFuenteSeleccion, setTutorFuenteSeleccion] = useState(null);
  const [formTraslado, setFormTraslado] = useState(initialTraslado);
  /** Búsqueda previa encargado: Nuevo ingreso */
  const [tutorFuenteNuevo, setTutorFuenteNuevo] = useState(null);
  const [buscandoEncNuevo, setBuscandoEncNuevo] = useState(false);
  const [editarEncNuevo, setEditarEncNuevo] = useState(false);
  /** Búsqueda previa encargado: Traslado */
  const [tutorFuenteTraslado, setTutorFuenteTraslado] = useState(null);
  const [buscandoEncTraslado, setBuscandoEncTraslado] = useState(false);
  const [editarEncTraslado, setEditarEncTraslado] = useState(false);

  const setMsg = (type, message) => setStatus({ type, message });

  const handleInputChange = (setter, e) => {
    const { name, value, type, checked } = e.target;
    setter((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const consultarIdentificacion = async (identificacion, setter, field) => {
    if (!identificacion || identificacion.length < 9) return;
    try {
      const data = await servicioMatricula.consultarIdentificacion(identificacion);
      if (data?.encontrado && data?.nombreCompleto) {
        setter((prev) => ({ ...prev, [field]: data.nombreCompleto }));
        return;
      }
      notificarHaciendaIndisponible(toast, data);
    } catch (err) {
      notificarHaciendaIndisponible(toast, null, err);
    }
  };

  const buscarEstudianteRegular = async () => {
    if (!cedulaBusqueda.trim()) return;
    setBuscandoEstudiante(true);
    setEstudianteEncontrado(null);
    setTutorFuenteSeleccion(null);
    setCedulaBusquedaTutor('');
    try {
      const est = await servicioMatricula.buscarEstudiantePorCedula(cedulaBusqueda.trim());
      setEstudianteEncontrado(est);
      const t = est.tutor_ultimo_periodo;
      const mp = est.matricula_pendiente;
      setFormRegular({
        ...emptyFormRegular(),
        id_persona_estudiante: est.id_persona,
        mismo_tutor: Boolean(t?.id_persona),
        id_persona_tutor: t?.id_persona ? String(t.id_persona) : '',
        id_curso_lectivo: mp?.id_curso_lectivo != null ? String(mp.id_curso_lectivo) : '',
        ano_a_cursar: mp?.ano_a_cursar || '',
      });
    } catch (e) {
      setMsg('error', mapApiError(e, 'No se encontró estudiante con esa identificación.'));
    } finally {
      setBuscandoEstudiante(false);
    }
  };

  const buscarTutorMatriculaRegular = async () => {
    const c = cedulaBusquedaTutor.trim();
    if (!c || c.length < 5) {
      setMsg('error', 'Ingrese una identificación válida del tutor.');
      return;
    }
    setBuscandoTutor(true);
    setStatus({ type: '', message: '' });
    try {
      const r = await servicioMatricula.buscarTutorParaMatriculaRegular(c);
      if (r.fuente === 'registro_local' && r.persona) {
        setTutorFuenteSeleccion('local');
        const p = r.persona;
        setFormRegular((prev) => ({
          ...prev,
          id_persona_tutor: String(p.id_persona),
          cedula_encargado: p.cedula || '',
          nombre_completo_encargado: p.nombre_completo || '',
          correo_encargado: p.correo || '',
          telefono_encargado: p.telefono || '',
          direccion_encargado: p.direccion || '',
          fecha_nacimiento_encargado: p.fecha_nacimiento
            ? String(p.fecha_nacimiento).slice(0, 10)
            : '',
        }));
      } else if (r.fuente === 'hacienda' && r.nombreCompleto) {
        setTutorFuenteSeleccion('hacienda');
        setFormRegular((prev) => ({
          ...prev,
          id_persona_tutor: '',
          cedula_encargado: r.identificacion || c,
          nombre_completo_encargado: r.nombreCompleto,
          correo_encargado: '',
          telefono_encargado: '',
          direccion_encargado: '',
          fecha_nacimiento_encargado: '',
        }));
      } else {
        setTutorFuenteSeleccion(null);
        if (notificarHaciendaIndisponible(toast, r)) {
          setStatus({ type: '', message: '' });
        } else {
          setMsg('error', r.mensaje || 'No se encontró información para esa identificación.');
        }
      }
    } catch (e) {
      setTutorFuenteSeleccion(null);
      if (!notificarHaciendaIndisponible(toast, null, e)) {
        setMsg('error', mapApiError(e, 'Error al buscar tutor.'));
      } else {
        setStatus({ type: '', message: '' });
      }
    } finally {
      setBuscandoTutor(false);
    }
  };

  const validarEncargadoAntiVacio = (f) => {
    if (
      isBlank(f.cedula_encargado) ||
      isBlank(f.nombre_completo_encargado) ||
      isBlank(f.correo_encargado) ||
      isBlank(f.telefono_encargado) ||
      isBlank(f.direccion_encargado) ||
      isBlank(f.fecha_nacimiento_encargado)
    ) {
      return 'Complete todos los datos del encargado (sin campos vacíos ni solo espacios).';
    }
    if (!f.patria_potestad) {
      return 'Debe confirmar patria potestad.';
    }
    return null;
  };

  const validarEncargadoNuevoIngresoTraslado = (f, tutorFuente) => {
    if (!f.patria_potestad) return 'Debe confirmar patria potestad.';
    if (f.id_persona_encargado) return null;
    if (tutorFuente === 'hacienda') {
      return validarEncargadoAntiVacio(f);
    }
    return 'Realice la búsqueda previa del encargado (identificación en el sistema o Hacienda) antes de enviar.';
  };

  const aplicarResultadoBusquedaEncargado = (setter, r, c) => {
    if (r.fuente === 'registro_local' && r.persona) {
      const p = r.persona;
      setter((prev) => ({
        ...prev,
        id_persona_encargado: String(p.id_persona),
        cedula_encargado: p.cedula || '',
        nombre_completo_encargado: p.nombre_completo || '',
        correo_encargado: p.correo || '',
        telefono_encargado: p.telefono || '',
        direccion_encargado: p.direccion || '',
        fecha_nacimiento_encargado: p.fecha_nacimiento ? String(p.fecha_nacimiento).slice(0, 10) : '',
      }));
      return 'local';
    }
    if (r.fuente === 'hacienda' && r.nombreCompleto) {
      setter((prev) => ({
        ...prev,
        id_persona_encargado: '',
        cedula_encargado: r.identificacion || c,
        nombre_completo_encargado: r.nombreCompleto,
        correo_encargado: '',
        telefono_encargado: '',
        direccion_encargado: '',
        fecha_nacimiento_encargado: '',
      }));
      return 'hacienda';
    }
    return null;
  };

  const buscarEncargadoNuevo = async (fromBlur = false) => {
    const c = formNuevoIngreso.cedula_encargado.trim();
    if (!c || c.length < 5) {
      if (!fromBlur) setMsg('error', 'Ingrese la identificación del encargado.');
      return;
    }
    setBuscandoEncNuevo(true);
    setEditarEncNuevo(false);
    setStatus({ type: '', message: '' });
    try {
      const r = await servicioMatricula.buscarTutorParaMatriculaRegular(c);
      const fuente = aplicarResultadoBusquedaEncargado(setFormNuevoIngreso, r, c);
      if (fuente) {
        setTutorFuenteNuevo(fuente);
        setMsg(
          'success',
          fuente === 'local'
            ? 'Tutor encontrado en el sistema. Datos cargados automáticamente.'
            : 'Nombre obtenido desde Hacienda. Complete correo, teléfono, dirección y fecha de nacimiento.'
        );
      } else {
        setTutorFuenteNuevo(null);
        if (notificarHaciendaIndisponible(toast, r)) {
          setStatus({ type: '', message: '' });
        } else {
          setMsg('error', r.mensaje || 'No se encontró información para esa identificación.');
        }
      }
    } catch (e) {
      setTutorFuenteNuevo(null);
      if (!notificarHaciendaIndisponible(toast, null, e)) {
        setMsg('error', mapApiError(e, 'Error al buscar encargado.'));
      } else {
        setStatus({ type: '', message: '' });
      }
    } finally {
      setBuscandoEncNuevo(false);
    }
  };

  const buscarEncargadoTraslado = async (fromBlur = false) => {
    const c = formTraslado.cedula_encargado.trim();
    if (!c || c.length < 5) {
      if (!fromBlur) setMsg('error', 'Ingrese la identificación del encargado.');
      return;
    }
    setBuscandoEncTraslado(true);
    setEditarEncTraslado(false);
    setStatus({ type: '', message: '' });
    try {
      const r = await servicioMatricula.buscarTutorParaMatriculaRegular(c);
      const fuente = aplicarResultadoBusquedaEncargado(setFormTraslado, r, c);
      if (fuente) {
        setTutorFuenteTraslado(fuente);
        setMsg(
          'success',
          fuente === 'local'
            ? 'Tutor encontrado en el sistema. Datos cargados automáticamente.'
            : 'Nombre obtenido desde Hacienda. Complete correo, teléfono, dirección y fecha de nacimiento.'
        );
      } else {
        setTutorFuenteTraslado(null);
        if (notificarHaciendaIndisponible(toast, r)) {
          setStatus({ type: '', message: '' });
        } else {
          setMsg('error', r.mensaje || 'No se encontró información para esa identificación.');
        }
      }
    } catch (e) {
      setTutorFuenteTraslado(null);
      if (!notificarHaciendaIndisponible(toast, null, e)) {
        setMsg('error', mapApiError(e, 'Error al buscar encargado.'));
      } else {
        setStatus({ type: '', message: '' });
      }
    } finally {
      setBuscandoEncTraslado(false);
    }
  };

  const onCedulaEncargadoChange = (setter, setFuente, setEditar, e) => {
    const { value } = e.target;
    setter((prev) => ({ ...prev, cedula_encargado: value, id_persona_encargado: '' }));
    setFuente(null);
    setEditar(false);
  };

  const onSubmitNuevo = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });
    const errEnc = validarEncargadoNuevoIngresoTraslado(formNuevoIngreso, tutorFuenteNuevo);
    if (errEnc) {
      setMsg('error', errEnc);
      setLoading(false);
      return;
    }
    try {
      const payload = {
        ...formNuevoIngreso,
        ano_a_cursar: ANO_NUEVO_INGRESO_API,
        id_persona_encargado: formNuevoIngreso.id_persona_encargado
          ? parseInt(formNuevoIngreso.id_persona_encargado, 10)
          : undefined,
        actualizar_datos_encargado: tutorFuenteNuevo === 'local' && editarEncNuevo,
      };
      await servicioMatricula.crearMatriculaNuevoIngreso(payload);
      setMsg('success', 'Matrícula de nuevo ingreso registrada correctamente.');
      setFormNuevoIngreso(initialNuevo);
      setTutorFuenteNuevo(null);
      setEditarEncNuevo(false);
    } catch (e2) {
      setMsg('error', mapApiError(e2, 'Error al registrar matrícula.'));
    } finally {
      setLoading(false);
    }
  };

  const onSubmitRegular = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });
    if (!formRegular.id_persona_estudiante) {
      setMsg('error', 'Busque y seleccione un estudiante primero.');
      setLoading(false);
      return;
    }
    try {
      let payload;
      const cursoOpt =
        formRegular.id_curso_lectivo && String(formRegular.id_curso_lectivo).trim() !== ''
          ? { id_curso_lectivo: parseInt(formRegular.id_curso_lectivo, 10) }
          : {};

      if (formRegular.mismo_tutor) {
        if (!formRegular.id_persona_tutor) {
          setMsg('error', 'No hay tutor del periodo anterior para heredar. Indique un encargado distinto.');
          setLoading(false);
          return;
        }
        payload = {
          id_persona_estudiante: formRegular.id_persona_estudiante,
          ano_a_cursar: formRegular.ano_a_cursar,
          mismo_tutor: true,
          id_persona_tutor: parseInt(formRegular.id_persona_tutor, 10),
          ...cursoOpt,
        };
      } else {
        if (!formRegular.patria_potestad) {
          setMsg('error', 'Debe confirmar patria potestad para el nuevo encargado.');
          setLoading(false);
          return;
        }
        if (formRegular.id_persona_tutor) {
          payload = {
            id_persona_estudiante: formRegular.id_persona_estudiante,
            ano_a_cursar: formRegular.ano_a_cursar,
            mismo_tutor: false,
            id_persona_tutor: parseInt(formRegular.id_persona_tutor, 10),
            patria_potestad: formRegular.patria_potestad,
            ...cursoOpt,
          };
        } else {
          const errEnc = validarEncargadoAntiVacio(formRegular);
          if (errEnc) {
            setMsg('error', errEnc);
            setLoading(false);
            return;
          }
          if (tutorFuenteSeleccion !== 'hacienda') {
            setMsg('error', 'Busque al tutor por identificación (persona existente o Hacienda) antes de enviar.');
            setLoading(false);
            return;
          }
          payload = {
            id_persona_estudiante: formRegular.id_persona_estudiante,
            ano_a_cursar: formRegular.ano_a_cursar,
            mismo_tutor: false,
            patria_potestad: formRegular.patria_potestad,
            cedula_encargado: formRegular.cedula_encargado,
            nombre_completo_encargado: formRegular.nombre_completo_encargado,
            correo_encargado: formRegular.correo_encargado,
            telefono_encargado: formRegular.telefono_encargado,
            direccion_encargado: formRegular.direccion_encargado,
            fecha_nacimiento_encargado: formRegular.fecha_nacimiento_encargado,
            ...cursoOpt,
          };
        }
      }

      await servicioMatricula.crearMatriculaRegular(payload);
      setMsg('success', 'Matrícula regular registrada correctamente.');
      setFormRegular(emptyFormRegular());
      setEstudianteEncontrado(null);
      setCedulaBusqueda('');
      setCedulaBusquedaTutor('');
      setTutorFuenteSeleccion(null);
    } catch (e2) {
      setMsg('error', mapApiError(e2, 'Error al registrar matrícula regular.'));
    } finally {
      setLoading(false);
    }
  };

  const onSubmitTraslado = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });
    const errEnc = validarEncargadoNuevoIngresoTraslado(formTraslado, tutorFuenteTraslado);
    if (errEnc) {
      setMsg('error', errEnc);
      setLoading(false);
      return;
    }
    try {
      const payload = {
        ...formTraslado,
        id_persona_encargado: formTraslado.id_persona_encargado
          ? parseInt(formTraslado.id_persona_encargado, 10)
          : undefined,
        actualizar_datos_encargado: tutorFuenteTraslado === 'local' && editarEncTraslado,
      };
      await servicioMatricula.crearMatriculaTraslado(payload);
      setMsg('success', 'Matrícula por traslado registrada correctamente.');
      setFormTraslado(initialTraslado);
      setTutorFuenteTraslado(null);
      setEditarEncTraslado(false);
    } catch (e2) {
      setMsg('error', mapApiError(e2, 'Error al registrar matrícula por traslado.'));
    } finally {
      setLoading(false);
    }
  };

  const renderHorarioReferencia = () => (
    <div className="space-y-2">
      <Label>Horario de referencia del centro</Label>
      <Input value={HORARIO_REFERENCIA} readOnly disabled />
    </div>
  );

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent/10 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Módulo de Matrícula</CardTitle>
            <p className="text-sm text-muted-foreground">Proceso rápido para profesores: capture identificación, autorrellene nombre y registre.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.message && (
              <Alert className={status.type === 'error' ? 'border-destructive/20 bg-destructive/5' : 'border-emerald-500/20 bg-emerald-500/5'}>
                <AlertDescription className={status.type === 'error' ? 'text-destructive' : 'text-emerald-700'}>
                  {status.message}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button type="button" variant={tipoMatricula === 'nuevo_ingreso' ? 'default' : 'outline'} onClick={() => setTipoMatricula('nuevo_ingreso')}>Nuevo ingreso</Button>
              <Button type="button" variant={tipoMatricula === 'regular' ? 'default' : 'outline'} onClick={() => setTipoMatricula('regular')}>Regular</Button>
              <Button type="button" variant={tipoMatricula === 'traslado' ? 'default' : 'outline'} onClick={() => setTipoMatricula('traslado')}>Traslado</Button>
            </div>
          </CardContent>
        </Card>

        {tipoMatricula === 'nuevo_ingreso' && (
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm">
            <CardHeader><CardTitle>Nuevo Ingreso</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={onSubmitNuevo} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Identificación (Cédula o DIMEX)</Label>
                  <Input
                    name="cedula"
                    value={formNuevoIngreso.cedula}
                    onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                    onBlur={(e) => consultarIdentificacion(e.target.value, setFormNuevoIngreso, 'nombre_completo')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre completo</Label>
                  <Input
                    name="nombre_completo"
                    value={formNuevoIngreso.nombre_completo}
                    onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Correo</Label>
                  <Input
                    name="correo"
                    type="email"
                    value={formNuevoIngreso.correo}
                    onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    name="telefono"
                    value={formNuevoIngreso.telefono}
                    onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2"><Label>Dirección</Label><Input name="direccion" value={formNuevoIngreso.direccion} onChange={(e) => handleInputChange(setFormNuevoIngreso, e)} required /></div>
                <div className="space-y-2">
                  <Label>Fecha de nacimiento</Label>
                  <Input
                    name="fecha_nacimiento"
                    type="date"
                    value={formNuevoIngreso.fecha_nacimiento}
                    onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Año a cursar</Label>
                  <Input readOnly value={ANO_NUEVO_INGRESO_LABEL} aria-readonly="true" />
                  <p className="text-xs text-muted-foreground">Para otros grados use las pestañas Traslado o Regular.</p>
                </div>
                {renderHorarioReferencia()}
                <div className="md:col-span-2 border-t pt-4 mt-2 space-y-3">
                  <h4 className="font-medium">Encargado / Tutor</h4>
                  <p className="text-sm text-muted-foreground">Búsqueda previa: si la identificación ya existe en el sistema se vincula sin duplicar; si no, se consulta Hacienda para el nombre y usted completa el resto.</p>
                </div>
                <div className="md:col-span-2 space-y-4 rounded-lg border border-dashed border-border bg-card/50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label>Identificación del encargado</Label>
                      <Input
                        name="cedula_encargado"
                        value={formNuevoIngreso.cedula_encargado}
                        onChange={(e) => onCedulaEncargadoChange(setFormNuevoIngreso, setTutorFuenteNuevo, setEditarEncNuevo, e)}
                        onBlur={() => buscarEncargadoNuevo(true)}
                        required
                      />
                    </div>
                    <Button type="button" variant="secondary" onClick={() => buscarEncargadoNuevo(false)} disabled={buscandoEncNuevo}>
                      {buscandoEncNuevo ? 'Buscando...' : 'Buscar encargado'}
                    </Button>
                  </div>
                  {tutorFuenteNuevo === 'local' && (
                    <p className="text-xs font-medium text-emerald-700">Tutor encontrado en el sistema. Datos cargados automáticamente.</p>
                  )}
                  {tutorFuenteNuevo === 'hacienda' && (
                    <p className="text-xs font-medium text-sky-700">Nombre obtenido desde Hacienda — complete correo, teléfono, dirección y fecha de nacimiento.</p>
                  )}
                  {tutorFuenteNuevo === 'local' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditarEncNuevo((v) => !v)}>
                      {editarEncNuevo ? 'Bloquear edición de datos' : 'Actualizar datos del tutor'}
                    </Button>
                  )}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nombre completo encargado</Label>
                      <Input
                        name="nombre_completo_encargado"
                        value={formNuevoIngreso.nombre_completo_encargado}
                        onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                        readOnly={tutorFuenteNuevo === 'local' && !editarEncNuevo}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Correo encargado</Label>
                      <Input
                        name="correo_encargado"
                        type="email"
                        value={formNuevoIngreso.correo_encargado}
                        onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                        readOnly={tutorFuenteNuevo === 'local' && !editarEncNuevo}
                        required={tutorFuenteNuevo !== 'local' || editarEncNuevo}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Teléfono encargado</Label>
                      <Input
                        name="telefono_encargado"
                        value={formNuevoIngreso.telefono_encargado}
                        onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                        readOnly={tutorFuenteNuevo === 'local' && !editarEncNuevo}
                        required={tutorFuenteNuevo !== 'local' || editarEncNuevo}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Dirección encargado</Label>
                      <Input
                        name="direccion_encargado"
                        value={formNuevoIngreso.direccion_encargado}
                        onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                        readOnly={tutorFuenteNuevo === 'local' && !editarEncNuevo}
                        required={tutorFuenteNuevo !== 'local' || editarEncNuevo}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha nacimiento encargado</Label>
                      <Input
                        name="fecha_nacimiento_encargado"
                        type="date"
                        value={formNuevoIngreso.fecha_nacimiento_encargado}
                        onChange={(e) => handleInputChange(setFormNuevoIngreso, e)}
                        readOnly={tutorFuenteNuevo === 'local' && !editarEncNuevo}
                        required={tutorFuenteNuevo !== 'local' || editarEncNuevo}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-6 md:col-span-2">
                      <Checkbox id="patria_potestad_nuevo" name="patria_potestad" checked={formNuevoIngreso.patria_potestad} onChange={(e) => handleInputChange(setFormNuevoIngreso, e)} />
                      <Label htmlFor="patria_potestad_nuevo">Patria potestad</Label>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 flex justify-end"><Button disabled={loading}>{loading ? 'Guardando...' : 'Registrar matrícula'}</Button></div>
              </form>
            </CardContent>
          </Card>
        )}

        {tipoMatricula === 'regular' && (
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Matrícula Regular</CardTitle>
              <p className="text-sm text-muted-foreground">Ratificación: herede el tutor del último periodo o asigne uno nuevo sin duplicar personas en el sistema.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                <Input value={cedulaBusqueda} onChange={(e) => setCedulaBusqueda(e.target.value)} placeholder="Cédula o DIMEX del estudiante" className="flex-1" />
                <Button type="button" variant="outline" onClick={buscarEstudianteRegular} disabled={buscandoEstudiante}>{buscandoEstudiante ? 'Buscando...' : 'Buscar estudiante'}</Button>
              </div>
              {estudianteEncontrado && (
                <Alert className="border-emerald-500/20 bg-emerald-500/5">
                  <AlertDescription className="text-emerald-700">
                    <span className="font-medium">Estudiante:</span> {estudianteEncontrado.nombre_completo} — {estudianteEncontrado.cedula}
                  </AlertDescription>
                </Alert>
              )}

              {estudianteEncontrado?.tutor_ultimo_periodo && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-foreground">Tutor del periodo anterior</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Según la matrícula más reciente
                    {estudianteEncontrado.tutor_ultimo_periodo.anio_curso_lectivo != null
                      ? ` (curso lectivo ${estudianteEncontrado.tutor_ultimo_periodo.anio_curso_lectivo})`
                      : ''}
                    .
                  </p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <div><span className="text-muted-foreground">Nombre completo:</span> <span className="font-medium">{estudianteEncontrado.tutor_ultimo_periodo.nombre_completo}</span></div>
                    <div><span className="text-muted-foreground">Identificación:</span> <span className="font-medium">{estudianteEncontrado.tutor_ultimo_periodo.cedula}</span></div>
                    <div><span className="text-muted-foreground">Correo:</span> {estudianteEncontrado.tutor_ultimo_periodo.correo || '—'}</div>
                    <div><span className="text-muted-foreground">Teléfono:</span> {estudianteEncontrado.tutor_ultimo_periodo.telefono || '—'}</div>
                  </dl>
                </div>
              )}

              {estudianteEncontrado && !estudianteEncontrado.tutor_ultimo_periodo && (
                <Alert className="border-amber-500/20 bg-amber-500/5">
                  <AlertDescription className="text-amber-900">
                    No hay tutor asociado a una matrícula previa. Debe registrar al encargado para este curso lectivo (opción &quot;No es el mismo&quot; o equivalente).
                  </AlertDescription>
                </Alert>
              )}

              {estudianteEncontrado?.puede_completar_matricula_pendiente && estudianteEncontrado.matricula_pendiente && (
                <Alert className="border-sky-500/20 bg-sky-500/5">
                  <AlertDescription className="text-sm text-sky-950">
                    Hay una <span className="font-semibold">matrícula pendiente</span> (precarga) para el año lectivo{' '}
                    {estudianteEncontrado.matricula_pendiente.anio_curso_lectivo}, sección{' '}
                    {estudianteEncontrado.matricula_pendiente.nombre_seccion || '—'}. Al ratificar con tutor, el sistema{' '}
                    <span className="font-semibold">completará</span> esa matrícula (no creará un duplicado).
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={onSubmitRegular} className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Curso lectivo</Label>
                    <Input
                      value={
                        estudianteEncontrado?.matricula_pendiente && formRegular.id_curso_lectivo
                          ? estudianteEncontrado.matricula_pendiente.anio_curso_lectivo
                          : anoActual
                      }
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Año a cursar</Label>
                    <Select name="ano_a_cursar" value={formRegular.ano_a_cursar} onChange={(e) => handleInputChange(setFormRegular, e)} required>
                      <option value="">Seleccione</option>
                      <option value="septimo">Séptimo</option><option value="octavo">Octavo</option><option value="noveno">Noveno</option><option value="decimo">Décimo</option><option value="undecimo">Undécimo</option>
                    </Select>
                  </div>
                </div>
                {renderHorarioReferencia()}

                {estudianteEncontrado && (
                  <div className="space-y-4 border-t pt-4">
                    <Label className="text-base font-medium">¿El encargado para este curso lectivo es el mismo?</Label>
                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                      <label className={filledChoiceLabel}>
                        <Radio
                          name="mismo_tutor_regular"
                          checked={formRegular.mismo_tutor === true}
                          disabled={!estudianteEncontrado.tutor_ultimo_periodo}
                          onChange={() => {
                            const t = estudianteEncontrado.tutor_ultimo_periodo;
                            setTutorFuenteSeleccion(null);
                            setCedulaBusquedaTutor('');
                            setFormRegular((prev) => ({
                              ...prev,
                              mismo_tutor: true,
                              id_persona_tutor: t?.id_persona ? String(t.id_persona) : '',
                              patria_potestad: false,
                              cedula_encargado: '',
                              nombre_completo_encargado: '',
                              correo_encargado: '',
                              telefono_encargado: '',
                              direccion_encargado: '',
                              fecha_nacimiento_encargado: '',
                            }));
                          }}
                        />
                        <span>Sí, es el mismo tutor</span>
                      </label>
                      <label className={filledChoiceLabel}>
                        <Radio
                          name="mismo_tutor_regular"
                          checked={formRegular.mismo_tutor === false}
                          onChange={() => {
                            setTutorFuenteSeleccion(null);
                            setCedulaBusquedaTutor('');
                            setFormRegular((prev) => ({
                              ...prev,
                              mismo_tutor: false,
                              id_persona_tutor: '',
                              patria_potestad: false,
                              cedula_encargado: '',
                              nombre_completo_encargado: '',
                              correo_encargado: '',
                              telefono_encargado: '',
                              direccion_encargado: '',
                              fecha_nacimiento_encargado: '',
                            }));
                          }}
                        />
                        <span>No — otro encargado / tutor</span>
                      </label>
                    </div>

                    {formRegular.mismo_tutor && estudianteEncontrado.tutor_ultimo_periodo && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Nombre completo (solo lectura)</Label>
                          <Input value={estudianteEncontrado.tutor_ultimo_periodo.nombre_completo || ''} readOnly disabled />
                        </div>
                        <div className="space-y-2">
                          <Label>Identificación (solo lectura)</Label>
                          <Input value={estudianteEncontrado.tutor_ultimo_periodo.cedula || ''} readOnly disabled />
                        </div>
                      </div>
                    )}

                    {formRegular.mismo_tutor === false && (
                      <div className="space-y-4 rounded-lg border border-dashed border-border bg-card/50 p-4">
                        <p className="text-sm text-muted-foreground">Busque por identificación: si ya existe en el sistema se vincula a ese registro; si no, se consulta Hacienda para el nombre y usted completa el resto.</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={cedulaBusquedaTutor}
                            onChange={(e) => setCedulaBusquedaTutor(e.target.value)}
                            placeholder="Identificación del nuevo tutor"
                            className="flex-1"
                          />
                          <Button type="button" variant="secondary" onClick={buscarTutorMatriculaRegular} disabled={buscandoTutor}>
                            {buscandoTutor ? 'Buscando...' : 'Buscar tutor'}
                          </Button>
                        </div>
                        {tutorFuenteSeleccion === 'local' && (
                          <p className="text-xs font-medium text-emerald-700">Persona encontrada en el sistema — datos enlazados al ID existente.</p>
                        )}
                        {tutorFuenteSeleccion === 'hacienda' && (
                          <p className="text-xs font-medium text-sky-700">Nombre obtenido de Hacienda — complete correo, teléfono, dirección y fecha de nacimiento.</p>
                        )}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Identificación tutor</Label>
                            <Input
                              name="cedula_encargado"
                              value={formRegular.cedula_encargado}
                              onChange={(e) => handleInputChange(setFormRegular, e)}
                              readOnly={tutorFuenteSeleccion === 'local'}
                              required={formRegular.mismo_tutor === false}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Nombre completo</Label>
                            <Input
                              name="nombre_completo_encargado"
                              value={formRegular.nombre_completo_encargado}
                              onChange={(e) => handleInputChange(setFormRegular, e)}
                              readOnly={tutorFuenteSeleccion === 'local'}
                              required={formRegular.mismo_tutor === false}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Correo</Label>
                            <Input name="correo_encargado" type="email" value={formRegular.correo_encargado} onChange={(e) => handleInputChange(setFormRegular, e)} readOnly={tutorFuenteSeleccion === 'local'} required={formRegular.mismo_tutor === false && tutorFuenteSeleccion === 'hacienda'} />
                          </div>
                          <div className="space-y-2">
                            <Label>Teléfono</Label>
                            <Input name="telefono_encargado" value={formRegular.telefono_encargado} onChange={(e) => handleInputChange(setFormRegular, e)} readOnly={tutorFuenteSeleccion === 'local'} required={formRegular.mismo_tutor === false && tutorFuenteSeleccion === 'hacienda'} />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>Dirección</Label>
                            <Input name="direccion_encargado" value={formRegular.direccion_encargado} onChange={(e) => handleInputChange(setFormRegular, e)} readOnly={tutorFuenteSeleccion === 'local'} required={formRegular.mismo_tutor === false && tutorFuenteSeleccion === 'hacienda'} />
                          </div>
                          <div className="space-y-2">
                            <Label>Fecha de nacimiento</Label>
                            <Input name="fecha_nacimiento_encargado" type="date" value={formRegular.fecha_nacimiento_encargado} onChange={(e) => handleInputChange(setFormRegular, e)} readOnly={tutorFuenteSeleccion === 'local'} required={formRegular.mismo_tutor === false && tutorFuenteSeleccion === 'hacienda'} />
                          </div>
                          <div className="flex items-center gap-2 pt-6 md:col-span-2">
                            <Checkbox id="patria_potestad_regular" name="patria_potestad" checked={formRegular.patria_potestad} onChange={(e) => handleInputChange(setFormRegular, e)} />
                            <Label htmlFor="patria_potestad_regular">Patria potestad (obligatorio si el encargado cambia)</Label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end border-t pt-4">
                  <Button type="submit" disabled={loading || !formRegular.id_persona_estudiante}>{loading ? 'Guardando...' : 'Ratificar matrícula'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {tipoMatricula === 'traslado' && (
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm">
            <CardHeader><CardTitle>Matrícula por Traslado</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={onSubmitTraslado} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Identificación (Cédula o DIMEX)</Label>
                  <Input name="cedula" value={formTraslado.cedula} onChange={(e) => handleInputChange(setFormTraslado, e)} onBlur={(e) => consultarIdentificacion(e.target.value, setFormTraslado, 'nombre_completo')} required />
                </div>
                <div className="space-y-2"><Label>Nombre completo</Label><Input name="nombre_completo" value={formTraslado.nombre_completo} onChange={(e) => handleInputChange(setFormTraslado, e)} required /></div>
                <div className="space-y-2"><Label>Colegio anterior</Label><Input name="colegio_anterior" value={formTraslado.colegio_anterior} onChange={(e) => handleInputChange(setFormTraslado, e)} required /></div>
                <div className="space-y-2"><Label>Correo</Label><Input name="correo" type="email" value={formTraslado.correo} onChange={(e) => handleInputChange(setFormTraslado, e)} required /></div>
                <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" value={formTraslado.telefono} onChange={(e) => handleInputChange(setFormTraslado, e)} required /></div>
                <div className="space-y-2 md:col-span-2"><Label>Dirección</Label><Input name="direccion" value={formTraslado.direccion} onChange={(e) => handleInputChange(setFormTraslado, e)} required /></div>
                <div className="space-y-2"><Label>Fecha de nacimiento</Label><Input name="fecha_nacimiento" type="date" value={formTraslado.fecha_nacimiento} onChange={(e) => handleInputChange(setFormTraslado, e)} required /></div>
                <div className="space-y-2">
                  <Label>Año a cursar</Label>
                  <Select name="ano_a_cursar" value={formTraslado.ano_a_cursar} onChange={(e) => handleInputChange(setFormTraslado, e)} required>
                    <option value="">Seleccione</option>
                    <option value="septimo">Séptimo</option><option value="octavo">Octavo</option><option value="noveno">Noveno</option><option value="decimo">Décimo</option><option value="undecimo">Undécimo</option>
                  </Select>
                </div>
                {renderHorarioReferencia()}
                <div className="md:col-span-2 border-t pt-4 mt-2 space-y-3">
                  <h4 className="font-medium">Encargado / Tutor</h4>
                  <p className="text-sm text-muted-foreground">Búsqueda previa: mismo criterio que en Nuevo ingreso y Regulares (sin duplicar personas).</p>
                </div>
                <div className="md:col-span-2 space-y-4 rounded-lg border border-dashed border-border bg-card/50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label>Identificación del encargado</Label>
                      <Input
                        name="cedula_encargado"
                        value={formTraslado.cedula_encargado}
                        onChange={(e) => onCedulaEncargadoChange(setFormTraslado, setTutorFuenteTraslado, setEditarEncTraslado, e)}
                        onBlur={() => buscarEncargadoTraslado(true)}
                        required
                      />
                    </div>
                    <Button type="button" variant="secondary" onClick={() => buscarEncargadoTraslado(false)} disabled={buscandoEncTraslado}>
                      {buscandoEncTraslado ? 'Buscando...' : 'Buscar encargado'}
                    </Button>
                  </div>
                  {tutorFuenteTraslado === 'local' && (
                    <p className="text-xs font-medium text-emerald-700">Tutor encontrado en el sistema. Datos cargados automáticamente.</p>
                  )}
                  {tutorFuenteTraslado === 'hacienda' && (
                    <p className="text-xs font-medium text-sky-700">Nombre obtenido desde Hacienda — complete correo, teléfono, dirección y fecha de nacimiento.</p>
                  )}
                  {tutorFuenteTraslado === 'local' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditarEncTraslado((v) => !v)}>
                      {editarEncTraslado ? 'Bloquear edición de datos' : 'Actualizar datos del tutor'}
                    </Button>
                  )}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nombre completo encargado</Label>
                      <Input
                        name="nombre_completo_encargado"
                        value={formTraslado.nombre_completo_encargado}
                        onChange={(e) => handleInputChange(setFormTraslado, e)}
                        readOnly={tutorFuenteTraslado === 'local' && !editarEncTraslado}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Correo encargado</Label>
                      <Input
                        name="correo_encargado"
                        type="email"
                        value={formTraslado.correo_encargado}
                        onChange={(e) => handleInputChange(setFormTraslado, e)}
                        readOnly={tutorFuenteTraslado === 'local' && !editarEncTraslado}
                        required={tutorFuenteTraslado !== 'local' || editarEncTraslado}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Teléfono encargado</Label>
                      <Input
                        name="telefono_encargado"
                        value={formTraslado.telefono_encargado}
                        onChange={(e) => handleInputChange(setFormTraslado, e)}
                        readOnly={tutorFuenteTraslado === 'local' && !editarEncTraslado}
                        required={tutorFuenteTraslado !== 'local' || editarEncTraslado}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Dirección encargado</Label>
                      <Input
                        name="direccion_encargado"
                        value={formTraslado.direccion_encargado}
                        onChange={(e) => handleInputChange(setFormTraslado, e)}
                        readOnly={tutorFuenteTraslado === 'local' && !editarEncTraslado}
                        required={tutorFuenteTraslado !== 'local' || editarEncTraslado}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha nacimiento encargado</Label>
                      <Input
                        name="fecha_nacimiento_encargado"
                        type="date"
                        value={formTraslado.fecha_nacimiento_encargado}
                        onChange={(e) => handleInputChange(setFormTraslado, e)}
                        readOnly={tutorFuenteTraslado === 'local' && !editarEncTraslado}
                        required={tutorFuenteTraslado !== 'local' || editarEncTraslado}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-6 md:col-span-2">
                      <Checkbox id="patria_potestad_traslado" name="patria_potestad" checked={formTraslado.patria_potestad} onChange={(e) => handleInputChange(setFormTraslado, e)} />
                      <Label htmlFor="patria_potestad_traslado">Patria potestad</Label>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 flex justify-end"><Button disabled={loading}>{loading ? 'Guardando...' : 'Registrar traslado'}</Button></div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

export default MatriculaScreen;
