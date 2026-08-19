import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Home,
  BarChart3,
  ClipboardList,
  FileDown,
  Loader2,
  ShieldAlert,
  Users,
  ChevronRight,
} from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import servicioEstudiantes from '../../services/asignacionAsistenciaServices';
import padresServicio from '../../services/padresServices';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

function formatFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function badgeTipo(tipo) {
  if (tipo === 'suspension' || tipo === 'expulsion') {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (tipo === 'permiso_institucional') {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function esEstadoVigente(registro) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (registro.tipo_estado === 'expulsion') return true;
  if (!registro.fecha_fin) return registro.fecha_inicio <= hoy;
  return registro.fecha_inicio <= hoy && registro.fecha_fin >= hoy;
}

export default function InicioPadre() {
  const { alert, toast } = useDialog();
  const [hijos, setHijos] = useState([]);
  const [idEstudiante, setIdEstudiante] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [cargandoHijos, setCargandoHijos] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [descargandoOrientId, setDescargandoOrientId] = useState(null);

  useEffect(() => {
    servicioEstudiantes
      .getMisEstudiantes()
      .then((lista) => {
        setHijos(lista);
        if (lista.length > 0) {
          setIdEstudiante(String(lista[0].id_persona));
        }
      })
      .catch(() => setHijos([]))
      .finally(() => setCargandoHijos(false));
  }, []);

  useEffect(() => {
    if (!idEstudiante) return;

    setCargando(true);
    padresServicio
      .getDashboardHijo(idEstudiante)
      .then(setDashboard)
      .catch(async (err) => {
        setDashboard(null);
        await alert(
          err?.response?.data?.error || err?.message || 'No fue posible cargar el panel.',
          { variant: 'error', title: 'Error' }
        );
      })
      .finally(() => setCargando(false));
  }, [idEstudiante, alert]);

  const hijoSeleccionado = useMemo(
    () => hijos.find((h) => String(h.id_persona) === String(idEstudiante)),
    [hijos, idEstudiante]
  );

  const resumen = dashboard?.resumen_anual;
  const resumenMes = dashboard?.resumen_mes;
  const rangoMes = dashboard?.rango_mes;

  const descargarReporteMes = async () => {
    if (!idEstudiante || !rangoMes) return;
    setDescargandoPdf(true);
    try {
      const blob = await padresServicio.descargarReporteAsistenciaPdf({
        id_estudiante: idEstudiante,
        fecha_inicio: rangoMes.fecha_inicio,
        fecha_fin: rangoMes.fecha_fin,
      });
      const nombre = (hijoSeleccionado?.nombre_completo || 'estudiante').replace(/\s+/g, '_');
      padresServicio.guardarBlob(
        blob,
        `reporte_asistencia_${nombre}_${rangoMes.fecha_inicio}_${rangoMes.fecha_fin}.pdf`
      );
      toast('Comprobante de asistencia descargado.', 'success');
    } catch (err) {
      await alert(err?.response?.data?.error || 'Error al generar el PDF.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setDescargandoPdf(false);
    }
  };

  const descargarComprobanteOrientacion = async (registro) => {
    try {
      setDescargandoOrientId(registro.id_estado_periodo);
      const blob = await padresServicio.descargarComprobanteEstadoEspecialPdf(
        registro.id_estado_periodo
      );
      const nombre = (hijoSeleccionado?.nombre_completo || 'estudiante').replace(/\s+/g, '_');
      padresServicio.guardarBlob(
        blob,
        `comprobante_orientacion_${nombre}_${registro.id_estado_periodo}.pdf`
      );
      toast('Comprobante oficial descargado.', 'success');
    } catch (err) {
      await alert(err?.response?.data?.error || 'Error al descargar el comprobante.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setDescargandoOrientId(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Home className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold">Panel del Encargado Legal</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Consulte el expediente de asistencia y los estados de orientación de su representado(a).
              Las notificaciones críticas también se envían al correo registrado en el sistema.
            </p>
          </div>

          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1 space-y-2">
                  <label htmlFor="selector-hijo" className="text-sm font-medium">
                    Estudiante a consultar
                  </label>
                  {cargandoHijos && (
                    <LoadingStatus label="Cargando estudiantes vinculados…" className="mb-1" />
                  )}
                  <Select
                    id="selector-hijo"
                    className="h-10"
                    value={idEstudiante}
                    onChange={(e) => setIdEstudiante(e.target.value)}
                    disabled={cargandoHijos || hijos.length === 0}
                  >
                    {cargandoHijos ? (
                      <option value="">Espere…</option>
                    ) : hijos.length === 0 ? (
                      <option value="">Sin estudiantes vinculados</option>
                    ) : (
                      hijos.map((h) => (
                        <option key={h.id_persona} value={h.id_persona}>
                          {h.nombre_completo}
                          {h.nombre_seccion ? ` — ${h.nombre_seccion}` : ''}
                        </option>
                      ))
                    )}
                  </Select>
                </div>
                {dashboard?.estudiante && (
                  <div className="text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Sección:</span>{' '}
                      {dashboard.estudiante.nombre_seccion}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Año lectivo:</span>{' '}
                      {dashboard.anio_lectivo}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {cargando ? (
            <LoadingStatus label="Cargando expediente del estudiante…" />
          ) : dashboard ? (
            <>
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Expediente de Asistencia</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="md:col-span-1 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Nivel de asistencia (año)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-4xl font-bold text-primary">
                        {resumen?.nivel_asistencia_pct ?? 100}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {resumen?.total_registros ?? 0} marcas registradas
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-blue-800">Ausencias justificadas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{resumen?.ausencias_justificadas ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Año lectivo actual</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-red-800">Ausencias injustificadas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-red-700">
                        {resumen?.ausencias_injustificadas ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Año lectivo actual</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-amber-800">Tardías</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{resumen?.tardias ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Año lectivo actual</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Mes actual: {resumenMes?.presentes ?? 0} presentes ·{' '}
                    {resumenMes?.ausencias_injustificadas ?? 0} injustificadas ·{' '}
                    {resumenMes?.tardias ?? 0} tardías
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={descargarReporteMes}
                      disabled={descargandoPdf}
                    >
                      {descargandoPdf ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4 mr-1" />
                      )}
                      PDF asistencia (mes)
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link to="/historial-asistencia-hijos">
                        Ver historial completo
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Historial de Orientación</h2>
                </div>

                {(dashboard.estados_activos || []).length > 0 && (
                  <Card className="border-amber-300/50 bg-amber-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
                        <ShieldAlert className="h-4 w-4" />
                        Estados vigentes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dashboard.estados_activos.map((r) => (
                        <div
                          key={`activo-${r.id_estado_periodo}`}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold mr-2 ${badgeTipo(r.tipo_estado)}`}
                            >
                              {r.tipo_estado_label}
                            </span>
                            {formatFecha(r.fecha_inicio)}
                            {r.fecha_fin ? ` al ${formatFecha(r.fecha_fin)}` : ' — permanente'}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="pt-6">
                    {(dashboard.estados_orientacion || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No hay registros de orientación para este estudiante.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {dashboard.estados_orientacion.map((r) => (
                          <div
                            key={r.id_estado_periodo}
                            className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b last:border-b-0 pb-4 last:pb-0"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeTipo(r.tipo_estado)}`}
                                >
                                  {r.tipo_estado_label}
                                </span>
                                {esEstadoVigente(r) && (
                                  <span className="text-xs text-emerald-700 font-medium">Vigente</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {formatFecha(r.fecha_inicio)}
                                {r.fecha_fin
                                  ? ` al ${formatFecha(r.fecha_fin)}`
                                  : r.es_expulsion
                                    ? ' — permanente'
                                    : ''}
                              </p>
                              {r.motivo && (
                                <p className="text-sm">{r.motivo}</p>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => descargarComprobanteOrientacion(r)}
                              disabled={descargandoOrientId === r.id_estado_periodo}
                            >
                              {descargandoOrientId === r.id_estado_periodo ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4 mr-1" />
                              )}
                              Comprobante oficial
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Button type="button" variant="ghost" size="sm" asChild className="text-primary">
                  <Link to="/estados-especiales-hijos">
                    Ver módulo completo de estados
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <Link to="/mis-estudiantes">
                  <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                    <CardHeader>
                      <Users className="h-8 w-8 text-primary mb-2" />
                      <CardTitle className="text-lg">Mis estudiantes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Datos de matrícula y comprobantes de inscripción.
                      </p>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/historial-asistencia-hijos">
                  <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                    <CardHeader>
                      <BarChart3 className="h-8 w-8 text-primary mb-2" />
                      <CardTitle className="text-lg">Historial detallado</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Matriz diaria de asistencia con filtros por rango de fechas.
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </>
          ) : (
            !cargandoHijos &&
            hijos.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No tiene estudiantes vinculados a su cuenta. Contacte a la administración del liceo.
                </CardContent>
              </Card>
            )
          )}
        </div>
      </main>
    </div>
  );
}
