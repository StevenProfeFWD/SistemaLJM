import { useState, useEffect } from 'react';
import MainBar from '../../components/side-bar/mainBar';
import { mapApiError } from '../../lib/errors';
import servicio from '../../services/asignacionAsistenciaServices';
import personalServicio from '../../services/personalServices';
import { resumenHorariosLeccion } from '../../lib/formatLeccion';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useDialog } from '../../context/DialogContext';
import LoadingStatus from '../../components/ui/LoadingStatus';

const ESTADO_ESPECIAL_UI = {
  suspension: {
    label: 'Suspendido',
    badge: 'bg-red-100 text-red-700 border-red-200',
    fila: 'bg-red-50',
  },
  expulsion: {
    label: 'Expulsado',
    badge: 'bg-red-100 text-red-700 border-red-200',
    fila: 'bg-red-50',
  },
  permiso_institucional: {
    label: 'Permiso institucional',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    fila: 'bg-amber-50',
  },
};

function configEstadoEspecial(estadoEspecial) {
  const tipo = estadoEspecial?.tipo_estado;
  if (!tipo) return null;
  return (
    ESTADO_ESPECIAL_UI[tipo] ?? {
      label: tipo.replace(/_/g, ' '),
      badge: 'bg-blue-100 text-blue-700 border-blue-200',
      fila: 'bg-blue-50',
    }
  );
}

function estiloFila(estadoEspecial) {
  return configEstadoEspecial(estadoEspecial)?.fila ?? '';
}

function badgeEstado(estadoEspecial) {
  return configEstadoEspecial(estadoEspecial)?.label ?? null;
}

function clasesBadge(estadoEspecial) {
  return (
    configEstadoEspecial(estadoEspecial)?.badge ??
    'bg-blue-100 text-blue-700 border-blue-200'
  );
}

function esBloqueado(estadoEspecial) {
  const t = estadoEspecial?.tipo_estado;
  return t === 'suspension' || t === 'expulsion';
}

function tieneEstadoEspecial(estadoEspecial) {
  return Boolean(estadoEspecial?.tipo_estado);
}

function estadoInicialMarca(estudiante, asistenciaPrev) {
  if (asistenciaPrev != null) return asistenciaPrev;
  const ee = estudiante.estadoEspecial;
  if (ee?.tipo_estado === 'suspension' || ee?.tipo_estado === 'expulsion' || ee?.tipo_estado === 'permiso_institucional') {
    return 'justificado';
  }
  return 'presente';
}

export default function Asistencia() {
  const { toast, alert } = useDialog();
  const [asignaciones, setAsignaciones] = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [diaSemanaLabel, setDiaSemanaLabel] = useState(null);
  const [esFinDeSemana, setEsFinDeSemana] = useState(false);
  const [cargandoClases, setCargandoClases] = useState(false);
  const [estudiantes, setEstudiantes] = useState([]);
  const [marcas, setMarcas] = useState({});
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sustitucionVigente, setSustitucionVigente] = useState(null);

  useEffect(() => {
    personalServicio
      .getMiSustitucionVigente()
      .then((res) => setSustitucionVigente(res?.sustitucion || null))
      .catch(() => setSustitucionVigente(null));
  }, []);

  useEffect(() => {
    if (!fecha) return;
    setCargandoClases(true);
    servicio
      .getAsignaciones(fecha)
      .then((res) => {
        const list = Array.isArray(res) ? res : res.asignaciones || [];
        setAsignaciones(list);
        setDiaSemanaLabel(res.dia_semana_label || null);
        setEsFinDeSemana(Boolean(res.es_fin_de_semana));
        setSeleccionada((prev) => {
          if (!prev) return null;
          return list.find((a) => a.id_profesor_materia_seccion === prev.id_profesor_materia_seccion) || null;
        });
      })
      .catch(() => {
        setAsignaciones([]);
        setDiaSemanaLabel(null);
        setEsFinDeSemana(false);
        setSeleccionada(null);
      })
      .finally(() => setCargandoClases(false));
  }, [fecha]);

  useEffect(() => {
    if (!seleccionada || !fecha) return;
    setLoading(true);
    servicio
      .getEstudiantesParaAsistencia(seleccionada.id_profesor_materia_seccion, fecha)
      .then((res) => {
        const lista = res.estudiantes || [];
        setEstudiantes(lista);
        const prev = {};
        (res.asistencia_hoy || []).forEach((a) => {
          prev[a.id_persona_estudiante] = a.estado;
        });
        const map = {};
        lista.forEach((e) => {
          map[e.id_persona] = estadoInicialMarca(e, prev[e.id_persona]);
        });
        setMarcas(map);
      })
      .catch(() => {
        setEstudiantes([]);
        setMarcas({});
      })
      .finally(() => setLoading(false));
  }, [seleccionada, fecha]);

  const handleEstado = (idPersona, estado, estadoEspecial) => {
    if (esBloqueado(estadoEspecial)) return;
    setMarcas((prev) => ({ ...prev, [idPersona]: estado }));
  };

  const guardar = () => {
    if (!seleccionada) return;
    setGuardando(true);
    const lista = estudiantes.map((e) => ({
      id_persona_estudiante: e.id_persona,
      estado: esBloqueado(e.estadoEspecial)
        ? 'justificado'
        : (marcas[e.id_persona] || 'presente'),
    }));
    servicio
      .registrarAsistencia({
        id_profesor_materia_seccion: seleccionada.id_profesor_materia_seccion,
        fecha,
        lista,
      })
      .then(() => toast('Asistencia guardada correctamente.', 'success'))
      .catch((err) =>
        alert(mapApiError(err, 'Error al guardar la asistencia.'), { variant: 'error', title: 'Error' })
      )
      .finally(() => setGuardando(false));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        {sustitucionVigente && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <strong>Sesión activa como Profesor Sustituto.</strong>{' '}
            Cubriendo a: <strong>{sustitucionVigente.nombre_titular}</strong>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Pasar lista</CardTitle>
            <p className="text-sm text-muted-foreground">
              Elija la fecha y la clase programada. Los estados especiales (suspensión, permiso, expulsión) se aplican automáticamente.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Fecha</label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              {diaSemanaLabel && !esFinDeSemana && (
                <p className="text-sm text-muted-foreground pb-2">
                  Horario del día: <strong>{diaSemanaLabel}</strong>
                </p>
              )}
            </div>

            {esFinDeSemana && (
              <p className="text-amber-900 bg-amber-100 border border-amber-300 rounded px-3 py-2 text-sm">
                No hay lecciones programadas para los fines de semana.
              </p>
            )}

            {!esFinDeSemana && (
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium mb-1">Clase (materia / sección)</label>
                  <Select
                    className="min-w-[200px]"
                    value={seleccionada?.id_profesor_materia_seccion ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setSeleccionada(asignaciones.find((a) => a.id_profesor_materia_seccion === id) || null);
                    }}
                    disabled={cargandoClases || asignaciones.length === 0}
                  >
                    <option value="">
                      {cargandoClases ? 'Cargando clases...' : asignaciones.length === 0 ? 'Sin clases este día' : 'Seleccione'}
                    </option>
                    {asignaciones.map((a) => (
                      <option key={a.id_profesor_materia_seccion} value={a.id_profesor_materia_seccion}>
                        {a.nombre_materia} - {a.nombre_seccion}
                        {a.horarios?.length ? ` (${resumenHorariosLeccion(a.horarios)})` : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                {seleccionada?.horarios?.length > 0 && (
                  <p className="text-sm text-muted-foreground w-full">
                    Horario: {resumenHorariosLeccion(seleccionada.horarios)}
                  </p>
                )}
              </div>
            )}

            {cargandoClases && (
              <LoadingStatus label="Cargando clases del día…" className="py-1" />
            )}

            {!esFinDeSemana && !cargandoClases && asignaciones.length === 0 && fecha && (
              <p className="text-muted-foreground text-sm">No tiene clases asignadas en el horario para este día.</p>
            )}

            {loading && <LoadingStatus label="Cargando estudiantes de la sección…" />}
            {!loading && estudiantes.length > 0 && (
              <>
                <ul className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                  {estudiantes.map((e) => {
                    const bloqueado = esBloqueado(e.estadoEspecial);
                    const estadoEsp = tieneEstadoEspecial(e.estadoEspecial);
                    const filaCls = estiloFila(e.estadoEspecial);
                    const badge = badgeEstado(e.estadoEspecial);
                    const badgeCls = clasesBadge(e.estadoEspecial);
                    const valorAsistencia = bloqueado
                      ? 'justificado'
                      : (marcas[e.id_persona] || 'presente');

                    return (
                      <li
                        key={e.id_persona}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border-b border-slate-100 last:border-b-0 ${filaCls}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{e.nombre_completo}</span>
                            {badge && (
                              <span
                                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${badgeCls}`}
                              >
                                {badge}
                              </span>
                            )}
                          </div>
                          {bloqueado && (
                            <span className="text-xs text-red-700 mt-1 block font-medium">
                              Ausencia justificada (obligatoria) — no se puede modificar
                            </span>
                          )}
                          {!bloqueado && estadoEsp && e.estadoEspecial?.tipo_estado === 'permiso_institucional' && (
                            <span className="text-xs text-amber-800 mt-1 block">
                              Permiso activo — puede ajustar la marca si corresponde
                            </span>
                          )}
                        </div>
                        <Select
                          className={`w-full sm:w-56 shrink-0 ${bloqueado ? 'opacity-60 cursor-not-allowed' : ''}`}
                          aria-label={`Asistencia de ${e.nombre_completo}`}
                          aria-disabled={bloqueado}
                          title={
                            bloqueado
                              ? 'Estudiante suspendido o expulsado: asistencia fijada en Justificado'
                              : undefined
                          }
                          value={valorAsistencia}
                          disabled={bloqueado}
                          onChange={(ev) => handleEstado(e.id_persona, ev.target.value, e.estadoEspecial)}
                        >
                          <option value="presente">Presente</option>
                          <option value="ausente">Ausente</option>
                          <option value="justificado">Justificado</option>
                          <option value="tardanza">Tardanza</option>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
                <Button onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar asistencia'}
                </Button>
              </>
            )}
            {!loading && seleccionada && estudiantes.length === 0 && !esFinDeSemana && (
              <p className="text-muted-foreground">No hay estudiantes matriculados en esta sección para el curso actual.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
