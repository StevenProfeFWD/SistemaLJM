import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, UserPlus, UserMinus, X } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import seccionServicio from '../../services/seccionServices';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

function ModalAsignarGuia({ seccion, profesores, onClose, onConfirmar }) {
  const [idProfesor, setIdProfesor] = useState(
    seccion?.id_persona_profesor_guia ? String(seccion.id_persona_profesor_guia) : ''
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idProfesor) {
      setError('Seleccione un docente.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onConfirmar(Number(idProfesor));
    } catch (err) {
      setError(err?.error || err?.message || 'No fue posible asignar el profesor guía.');
      setGuardando(false);
    }
  };

  if (!seccion) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-2xl max-w-md w-full border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">
            {seccion.id_persona_profesor_guia ? 'Cambiar profesor guía' : 'Asignar profesor guía'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md border p-1" aria-label="Cerrar diálogo">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Sección <span className="font-medium text-foreground">{seccion.nombre_seccion}</span>
            {seccion.total_estudiantes > 0 && (
              <> · {seccion.total_estudiantes} estudiante(s) matriculados</>
            )}
          </p>
          <div>
            <label htmlFor="select-profesor-guia" className="text-sm font-medium block mb-1">
              Docente
            </label>
            <Select
              id="select-profesor-guia"
              value={idProfesor}
              onChange={(e) => {
                setIdProfesor(e.target.value);
                setError('');
              }}
              disabled={guardando}
            >
              <option value="">Seleccione un docente</option>
              {profesores.map((p) => (
                <option key={p.id_persona} value={p.id_persona}>
                  {p.nombre_completo}
                </option>
              ))}
            </Select>
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
              {guardando ? 'Procesando...' : 'Confirmar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GestionSecciones() {
  const { confirm, toast, alert } = useDialog();
  const [secciones, setSecciones] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [anio, setAnio] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modalSeccion, setModalSeccion] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await seccionServicio.getSeccionesGuias();
      setSecciones(data.secciones || []);
      setProfesores(data.profesores || []);
      setAnio(data.anio_curso_lectivo);
    } catch (err) {
      setSecciones([]);
      await alert(err?.error || err?.message || 'Error al cargar secciones.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setCargando(false);
    }
  }, [alert]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const confirmarAsignacion = async (idProfesor) => {
    const res = await seccionServicio.asignarProfesorGuia(modalSeccion.id_seccion, idProfesor);
    toast(
      res.message ||
        `Profesor asignado como guía de la sección ${modalSeccion.nombre_seccion} exitosamente.`,
      'success'
    );
    setModalSeccion(null);
    await cargar();
  };

  const revocarGuia = async (seccion) => {
    const ok = await confirm({
      title: '¿Revocar profesor guía?',
      message: `Se removerá al encargado actual de la sección ${seccion.nombre_seccion}. El grupo quedará temporalmente sin profesor guía.`,
      confirmLabel: 'Revocar',
      cancelLabel: 'Cancelar',
      variant: 'destructive',
      icon: 'destructive',
    });
    if (!ok) return;

    try {
      const res = await seccionServicio.revocarProfesorGuia(seccion.id_seccion);
      toast(res.message || 'Profesor guía revocado correctamente.', 'success');
      await cargar();
    } catch (err) {
      await alert(err?.error || err?.message || 'Error al revocar.', {
        variant: 'error',
        title: 'Error',
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Gestión de Profesores Guía</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Asigne, actualice o revoque el docente encargado de cada sección del año lectivo{' '}
            {anio || '—'}. Un profesor puede ser guía de hasta 2 grupos (máximo recomendado).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Control de secciones</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <LoadingStatus label="Cargando secciones…" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Secciones del año lectivo con total de estudiantes, profesor guía y acciones de asignación
                  </caption>
                  <thead>
                    <tr className="border-b text-left">
                      <th scope="col" className="py-2 px-2 font-medium">Sección / Grupo</th>
                      <th scope="col" className="py-2 px-2 font-medium">Estudiantes</th>
                      <th scope="col" className="py-2 px-2 font-medium">Profesor guía actual</th>
                      <th scope="col" className="py-2 px-2 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secciones.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-muted-foreground">
                          No hay secciones registradas.
                        </td>
                      </tr>
                    ) : (
                      secciones.map((s) => (
                        <tr key={s.id_seccion} className="border-b last:border-b-0">
                          <td className="py-2 px-2 font-medium">{s.nombre_seccion}</td>
                          <td className="py-2 px-2 text-muted-foreground">{s.total_estudiantes}</td>
                          <td className="py-2 px-2">
                            {s.nombre_profesor_guia ? (
                              <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                                {s.nombre_profesor_guia}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                                Sin profesor guía
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setModalSeccion(s)}
                              >
                                <UserPlus className="h-4 w-4 mr-1" />
                                {s.id_persona_profesor_guia ? 'Cambiar guía' : 'Asignar guía'}
                              </Button>
                              {s.id_persona_profesor_guia && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="text-red-700 border-red-200 hover:bg-red-50"
                                  onClick={() => revocarGuia(s)}
                                >
                                  <UserMinus className="h-4 w-4 mr-1" />
                                  Revocar
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
      </main>

      {modalSeccion && (
        <ModalAsignarGuia
          seccion={modalSeccion}
          profesores={profesores}
          onClose={() => setModalSeccion(null)}
          onConfirmar={confirmarAsignacion}
        />
      )}
    </div>
  );
}
