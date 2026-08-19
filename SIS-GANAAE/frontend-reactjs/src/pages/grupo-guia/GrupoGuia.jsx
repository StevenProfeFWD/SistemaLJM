import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap,
  BarChart3,
  ClipboardList,
  AlertTriangle,
  Eye,
  MessageSquare,
  X,
} from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import grupoGuiaServicio from '../../services/grupoGuiaServices';
import ModalComentarioGuia from './ModalComentarioGuia';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

const BADGE_ASISTENCIA = {
  Presente: 'bg-green-100 text-green-800 border-green-200',
  'Tardía': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Ausencia Justificada': 'bg-blue-100 text-blue-800 border-blue-200',
  'Ausencia Injustificada': 'bg-red-100 text-red-800 border-red-200',
  'Permiso Especial': 'bg-purple-100 text-purple-800 border-purple-200',
  Suspendido: 'bg-orange-100 text-orange-800 border-orange-200',
  Expulsado: 'bg-gray-900 text-white border-gray-700',
};

function badgeTipoOrientacion(tipo) {
  if (tipo === 'suspension') return 'bg-red-100 text-red-800 border-red-200';
  if (tipo === 'permiso_institucional') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (tipo === 'expulsion') return 'bg-gray-900 text-white border-gray-700';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatPeriodo(inicio, fin) {
  if (!inicio) return '—';
  if (!fin) return `${formatFecha(inicio)} en adelante`;
  return `${formatFecha(inicio)} al ${formatFecha(fin)}`;
}

function inicioAnioActual() {
  return `${new Date().getFullYear()}-01-01`;
}

function hoyIso() {
  const h = new Date();
  const m = String(h.getMonth() + 1).padStart(2, '0');
  const d = String(h.getDate()).padStart(2, '0');
  return `${h.getFullYear()}-${m}-${d}`;
}

function ModalDetalleAsistencia({ datos, onClose }) {
  if (!datos) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl shadow-xl max-w-3xl w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Auditoría de marcas</h3>
            <p className="text-sm text-muted-foreground">{datos.estudiante?.nombre_completo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border p-1" aria-label="Cerrar auditoría de marcas">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {datos.resumen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Asistencia</p>
                <p className="text-xl font-bold text-blue-700">{datos.resumen.nivel_asistencia_pct}%</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ausencias totales</p>
                <p className="text-xl font-bold text-red-700">{datos.resumen.ausencias_totales}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Justificadas</p>
                <p className="text-lg font-semibold">{datos.resumen.ausencias_justificadas}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Injustificadas</p>
                <p className="text-lg font-semibold">{datos.resumen.ausencias_injustificadas}</p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Materia</th>
                  <th className="py-2 px-2">Condición</th>
                  <th className="py-2 px-2">Observación</th>
                </tr>
              </thead>
              <tbody>
                {(datos.registros || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-muted-foreground">
                      Sin marcas en el periodo consultado.
                    </td>
                  </tr>
                ) : (
                  datos.registros.map((r) => (
                    <tr key={r.id_asistencia} className="border-b last:border-b-0">
                      <td className="py-2 px-2">{formatFecha(r.fecha)}</td>
                      <td className="py-2 px-2">{r.nombre_materia}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-xs ${
                            BADGE_ASISTENCIA[r.condicion] || 'bg-slate-100'
                          }`}
                        >
                          {r.condicion}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{r.observacion || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function GrupoGuia() {
  const { toast, alert } = useDialog();
  const [tab, setTab] = useState('asistencia');
  const [seccionesGuia, setSeccionesGuia] = useState([]);
  const [idSeccionActiva, setIdSeccionActiva] = useState(null);
  const [anioLectivo, setAnioLectivo] = useState(null);
  const [cargandoInicio, setCargandoInicio] = useState(true);
  const [sinSeccion, setSinSeccion] = useState(false);

  const [asistencia, setAsistencia] = useState(null);
  const [cargandoAsistencia, setCargandoAsistencia] = useState(false);
  const [detalleAsistencia, setDetalleAsistencia] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [reportes, setReportes] = useState([]);
  const [cargandoReportes, setCargandoReportes] = useState(false);
  const [comentarioModal, setComentarioModal] = useState(null);

  const seccionInfo = seccionesGuia.find((s) => s.id_seccion === idSeccionActiva) || null;

  const cargarSeccion = useCallback(async () => {
    setCargandoInicio(true);
    try {
      const data = await grupoGuiaServicio.getMiSeccionGuia();
      const lista = data.seccionesGuia || (data.seccionGuia ? [data.seccionGuia] : []);
      if (lista.length === 0) {
        setSinSeccion(true);
        setSeccionesGuia([]);
        setIdSeccionActiva(null);
        return;
      }
      setSinSeccion(false);
      setSeccionesGuia(lista);
      setAnioLectivo(lista[0]?.anio_curso_lectivo || data.seccionGuia?.anio_curso_lectivo);
      setIdSeccionActiva((prev) => {
        if (prev && lista.some((s) => s.id_seccion === prev)) return prev;
        return lista[0].id_seccion;
      });
    } catch (err) {
      setSinSeccion(true);
      await alert(err?.error || err?.message || 'No fue posible verificar su sección guía.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setCargandoInicio(false);
    }
  }, [alert]);

  const cargarAsistencia = useCallback(async () => {
    if (!idSeccionActiva) return;
    setCargandoAsistencia(true);
    try {
      const data = await grupoGuiaServicio.getAsistenciaSeccionGuia({
        id_seccion: idSeccionActiva,
        fecha_inicio: inicioAnioActual(),
        fecha_fin: hoyIso(),
      });
      setAsistencia(data);
    } catch (err) {
      setAsistencia(null);
      await alert(err?.error || err?.message || 'Error al cargar asistencia.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setCargandoAsistencia(false);
    }
  }, [alert, idSeccionActiva]);

  const cargarReportes = useCallback(async () => {
    if (!idSeccionActiva) return;
    setCargandoReportes(true);
    try {
      const data = await grupoGuiaServicio.getReportesOrientacionSeccionGuia({
        id_seccion: idSeccionActiva,
      });
      setReportes(data.registros || []);
    } catch (err) {
      setReportes([]);
      await alert(err?.error || err?.message || 'Error al cargar casos de orientación.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setCargandoReportes(false);
    }
  }, [alert, idSeccionActiva]);

  useEffect(() => {
    cargarSeccion();
  }, [cargarSeccion]);

  useEffect(() => {
    if (sinSeccion || !idSeccionActiva) return;
    if (tab === 'asistencia') cargarAsistencia();
    if (tab === 'orientacion') cargarReportes();
  }, [tab, sinSeccion, idSeccionActiva, cargarAsistencia, cargarReportes]);

  const auditarEstudiante = async (idEstudiante) => {
    setCargandoDetalle(true);
    try {
      const data = await grupoGuiaServicio.getAsistenciaSeccionGuia({
        id_seccion: idSeccionActiva,
        id_estudiante: idEstudiante,
        fecha_inicio: inicioAnioActual(),
        fecha_fin: hoyIso(),
      });
      setDetalleAsistencia(data);
    } catch (err) {
      await alert(err?.error || err?.message || 'No fue posible cargar el detalle.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setCargandoDetalle(false);
    }
  };

  const guardarComentario = async (texto) => {
    await grupoGuiaServicio.postComentarioSeguimiento({
      id_estado_periodo: comentarioModal.id_estado_periodo,
      comentario: texto,
    });
    toast('Observación de seguimiento registrada correctamente.', 'success');
    setComentarioModal(null);
    await cargarReportes();
  };

  if (cargandoInicio) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <MainBar />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
          <LoadingStatus label="Verificando asignación de sección guía…" />
        </main>
      </div>
    );
  }

  if (sinSeccion) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <MainBar />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="text-lg">Sin sección guía asignada</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Actualmente no figura como profesor guía de ninguna sección. Si cree que esto es un error,
              contacte a la administración del liceo.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Mi Grupo Guía</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Supervisión integral de sus grupos a cargo · Año lectivo {anioLectivo || '—'}
            {seccionInfo && (
              <>
                {' '}
                · Sección <span className="font-medium text-foreground">{seccionInfo.nombre_seccion}</span>
                {' '}
                · {seccionInfo.total_estudiantes} estudiantes
              </>
            )}
          </p>
        </div>

        {seccionesGuia.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {seccionesGuia.map((s) => (
              <button
                key={s.id_seccion}
                type="button"
                onClick={() => setIdSeccionActiva(s.id_seccion)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  idSeccionActiva === s.id_seccion
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {s.nombre_seccion}
                <span className="ml-1.5 text-xs opacity-80">({s.total_estudiantes})</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setTab('asistencia')}
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium ${
              tab === 'asistencia'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Control de Asistencia
          </button>
          <button
            type="button"
            onClick={() => setTab('orientacion')}
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium ${
              tab === 'orientacion'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Casos de Orientación
          </button>
        </div>

        {tab === 'asistencia' && (
          <div className="space-y-4">
            {asistencia?.resumen_global && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase">Nivel asistencia grupal</p>
                    <p className="text-3xl font-bold text-blue-700">
                      {asistencia.resumen_global.nivel_asistencia_general_pct}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase">Ausencias totales</p>
                    <p className="text-3xl font-bold text-red-700">
                      {asistencia.resumen_global.ausencias_totales}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase">Justificadas</p>
                    <p className="text-2xl font-bold">{asistencia.resumen_global.ausencias_justificadas}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase">Injustificadas</p>
                    <p className="text-2xl font-bold">{asistencia.resumen_global.ausencias_injustificadas}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asistencia acumulada del año ({inicioAnioActual()} — {hoyIso()})</CardTitle>
              </CardHeader>
              <CardContent>
                {cargandoAsistencia ? (
                  <LoadingStatus label="Cargando matriz de asistencia…" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-2">Estudiante</th>
                          <th className="py-2 px-2 text-center">Asistencia %</th>
                          <th className="py-2 px-2 text-center">Ausencias</th>
                          <th className="py-2 px-2 text-center">Alerta</th>
                          <th className="py-2 px-2">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(asistencia?.estudiantes || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-muted-foreground">
                              No hay estudiantes matriculados en esta sección.
                            </td>
                          </tr>
                        ) : (
                          asistencia.estudiantes.map((e) => (
                            <tr key={e.id_persona_estudiante} className="border-b last:border-b-0">
                              <td className="py-2 px-2 font-medium">{e.nombre_completo}</td>
                              <td className="py-2 px-2 text-center">{e.nivel_asistencia_pct}%</td>
                              <td className="py-2 px-2 text-center">
                                <span className="text-xs text-muted-foreground">
                                  J: {e.ausencias_justificadas} · I: {e.ausencias_injustificadas}
                                </span>
                                <span className="block font-medium">{e.ausencias_totales} total</span>
                              </td>
                              <td className="py-2 px-2 text-center">
                                {e.en_riesgo_exclusion ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-xs font-semibold">
                                    <AlertTriangle className="h-3 w-3" />
                                    Riesgo
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-2 px-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => auditarEstudiante(e.id_persona_estudiante)}
                                  disabled={cargandoDetalle}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Auditar marcas
                                </Button>
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
          </div>
        )}

        {tab === 'orientacion' && (
          <div className="space-y-4">
            {cargandoReportes ? (
              <LoadingStatus label="Cargando casos de orientación…" />
            ) : reportes.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No hay suspensiones, permisos ni expulsiones registrados para alumnos de su sección.
                </CardContent>
              </Card>
            ) : (
              reportes.map((r) => (
                <Card key={r.id_estado_periodo} className="overflow-hidden">
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-semibold">{r.nombre_completo}</p>
                        <p className="text-xs text-muted-foreground">
                          Cédula: {r.cedula}
                          {r.nombre_seccion && seccionesGuia.length > 1 && (
                            <> · Sección: {r.nombre_seccion}</>
                          )}
                        </p>
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTipoOrientacion(r.tipo_estado)}`}
                        >
                          {r.tipo_estado_label}
                        </span>
                        <p className="text-sm text-muted-foreground mt-2">
                          Periodo: {formatPeriodo(r.fecha_inicio, r.fecha_fin)}
                        </p>
                        <p className="text-sm mt-2 line-clamp-2">{r.motivo || 'Sin motivo registrado.'}</p>
                        {(r.comentarios || []).length > 0 && (
                          <p className="text-xs text-emerald-700 mt-1">
                            {r.comentarios.length} observación(es) de seguimiento registrada(s)
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setComentarioModal(r)}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Añadir observación de guía
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>

      {detalleAsistencia && (
        <ModalDetalleAsistencia
          datos={detalleAsistencia}
          onClose={() => setDetalleAsistencia(null)}
        />
      )}

      {comentarioModal && (
        <ModalComentarioGuia
          registro={comentarioModal}
          onClose={() => setComentarioModal(null)}
          onGuardar={guardarComentario}
        />
      )}
    </div>
  );
}
