import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileDown, RefreshCw } from 'lucide-react';
import MainBar from '@/components/side-bar/mainBar';
import epiServicio from '@/services/epiServices';
import { useDialog } from '@/context/DialogContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingStatus from '@/components/ui/LoadingStatus';

const PERIODOS = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'anual', label: 'Anual' },
  { value: 'personalizado', label: 'Rango personalizado' },
];

function hoyIso() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function formatoFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function colorPorcentaje(pct) {
  if (pct >= 90) return 'text-green-700';
  if (pct >= 80) return 'text-yellow-700';
  return 'text-red-700';
}

function FilaTotales({ etiqueta, totales, className = '', children }) {
  return (
    <>
      <td className="px-3 py-2">{children ?? etiqueta}</td>
      <td className="px-3 py-2 text-center">{totales.presentes}</td>
      <td className="px-3 py-2 text-center">{totales.tardias}</td>
      <td className="px-3 py-2 text-center">{totales.ausencias_justificadas}</td>
      <td className="px-3 py-2 text-center">{totales.ausencias_injustificadas}</td>
      <td className="px-3 py-2 text-center">{totales.total}</td>
      <td className={`px-3 py-2 text-center font-semibold ${colorPorcentaje(totales.porcentaje_asistencia)} ${className}`}>
        {totales.porcentaje_asistencia}%
      </td>
    </>
  );
}

export default function ReportesAsistenciaEpi() {
  const { alert } = useDialog();
  const hoy = hoyIso();
  const [periodo, setPeriodo] = useState('mensual');
  const [fechaSemana, setFechaSemana] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [anio, setAnio] = useState(hoy.slice(0, 4));
  const [fechaInicio, setFechaInicio] = useState(`${hoy.slice(0, 7)}-01`);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [idSeccion, setIdSeccion] = useState('');
  const [idMateria, setIdMateria] = useState('');
  const [idEstudiante, setIdEstudiante] = useState('');
  const [estudiantes, setEstudiantes] = useState([]);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(false);
  const [reporte, setReporte] = useState(null);
  // Parámetros con los que se generó el reporte en pantalla (el PDF usa exactamente estos)
  const [paramsReporte, setParamsReporte] = useState(null);
  const [catalogos, setCatalogos] = useState({ secciones: [], materias: [] });
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(() => {
    const p = { periodo };
    if (periodo === 'semanal') p.fecha_referencia = fechaSemana;
    if (periodo === 'mensual') p.fecha_referencia = `${mes}-01`;
    if (periodo === 'anual') p.fecha_referencia = `${anio}-01-01`;
    if (periodo === 'personalizado') {
      p.fecha_inicio = fechaInicio;
      p.fecha_fin = fechaFin;
    }
    if (idSeccion) p.id_seccion = idSeccion;
    if (idMateria) p.id_materia = idMateria;
    if (idEstudiante) p.id_estudiante = idEstudiante;
    return p;
  }, [periodo, fechaSemana, mes, anio, fechaInicio, fechaFin, idSeccion, idMateria, idEstudiante]);

  // Año usado para listar los estudiantes de la sección
  const anioEstudiantes = useMemo(() => {
    if (periodo === 'semanal') return fechaSemana.slice(0, 4);
    if (periodo === 'mensual') return mes.slice(0, 4);
    if (periodo === 'anual') return anio;
    return fechaInicio.slice(0, 4);
  }, [periodo, fechaSemana, mes, anio, fechaInicio]);

  useEffect(() => {
    if (!idSeccion) {
      setEstudiantes([]);
      return undefined;
    }
    let cancelado = false;
    setCargandoEstudiantes(true);
    epiServicio
      .getEstudiantesSeccionEpi(idSeccion, { anio: anioEstudiantes })
      .then((data) => {
        if (!cancelado) setEstudiantes(data.estudiantes || []);
      })
      .catch(() => {
        if (!cancelado) setEstudiantes([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoEstudiantes(false);
      });
    return () => {
      cancelado = true;
    };
  }, [idSeccion, anioEstudiantes]);

  const generar = useCallback(() => {
    setCargando(true);
    setError('');
    epiServicio
      .getReporteAsistenciaEpi(params)
      .then((data) => {
        setReporte(data);
        setParamsReporte(params);
        if (data.catalogos) setCatalogos(data.catalogos);
        setAbiertas(new Set());
      })
      .catch((err) => {
        setReporte(null);
        setParamsReporte(null);
        setError(err.response?.data?.error || 'No se pudo generar el reporte');
      })
      .finally(() => setCargando(false));
  }, [params]);

  // Carga inicial (mes en curso); luego se genera con el botón.
  useEffect(() => {
    generar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const descargarPdf = async () => {
    if (!reporte || !paramsReporte || reporte.secciones.length === 0) {
      await alert('No hay datos de asistencia para el periodo seleccionado.', {
        variant: 'info',
        title: 'Sin datos',
      });
      return;
    }
    setDescargando(true);
    try {
      const blob = await epiServicio.descargarReporteAsistenciaEpiPdf(paramsReporte);
      const f = reporte.filtros;
      epiServicio.guardarBlob(blob, `reporte_asistencia_epi_${f.periodo}_${f.fecha_inicio}_${f.fecha_fin}.pdf`);
    } catch {
      await alert('No se pudo descargar el PDF. Intente de nuevo.', { variant: 'error', title: 'Error' });
    } finally {
      setDescargando(false);
    }
  };

  const alternarSeccion = (id) => {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const secciones = reporte?.secciones || [];
  const todasAbiertas = secciones.length > 0 && secciones.every((s) => abiertas.has(s.id_seccion));
  const general = reporte?.resumen_general;

  const anios = useMemo(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(actual - i));
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 pt-16 lg:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Reportes de asistencia</h1>
            <p className="text-sm text-muted-foreground">
              Equipo de Permanencia Estudiantil (EPI) · Conteo por sección y materia
            </p>
          </div>
          <Button type="button" onClick={descargarPdf} disabled={cargando || descargando || !reporte}>
            <FileDown className="h-4 w-4 mr-2" />
            {descargando ? 'Generando PDF…' : 'Descargar PDF'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parámetros del reporte</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap gap-4 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                generar();
              }}
            >
              <div>
                <label htmlFor="epi-periodo" className="block text-sm font-medium mb-1">Tipo de reporte</label>
                <Select id="epi-periodo" className="min-w-[170px]" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                  {PERIODOS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
              </div>

              {periodo === 'semanal' && (
                <div>
                  <label htmlFor="epi-semana" className="block text-sm font-medium mb-1">Un día de la semana</label>
                  <Input id="epi-semana" type="date" value={fechaSemana} onChange={(e) => setFechaSemana(e.target.value)} required />
                </div>
              )}
              {periodo === 'mensual' && (
                <div>
                  <label htmlFor="epi-mes" className="block text-sm font-medium mb-1">Mes</label>
                  <Input id="epi-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} required />
                </div>
              )}
              {periodo === 'anual' && (
                <div>
                  <label htmlFor="epi-anio" className="block text-sm font-medium mb-1">Año</label>
                  <Select id="epi-anio" className="min-w-[110px]" value={anio} onChange={(e) => setAnio(e.target.value)}>
                    {anios.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </Select>
                </div>
              )}
              {periodo === 'personalizado' && (
                <>
                  <div>
                    <label htmlFor="epi-desde" className="block text-sm font-medium mb-1">Desde</label>
                    <Input id="epi-desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="epi-hasta" className="block text-sm font-medium mb-1">Hasta</label>
                    <Input id="epi-hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} required />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="epi-seccion" className="block text-sm font-medium mb-1">Sección</label>
                <Select
                  id="epi-seccion"
                  className="min-w-[150px]"
                  value={idSeccion}
                  onChange={(e) => {
                    setIdSeccion(e.target.value);
                    setIdEstudiante('');
                  }}
                >
                  <option value="">Todas</option>
                  {catalogos.secciones.map((s) => (
                    <option key={s.id_seccion} value={s.id_seccion}>{s.nombre_seccion}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="epi-materia" className="block text-sm font-medium mb-1">Materia</label>
                <Select id="epi-materia" className="min-w-[180px]" value={idMateria} onChange={(e) => setIdMateria(e.target.value)}>
                  <option value="">Todas</option>
                  {catalogos.materias.map((m) => (
                    <option key={m.id_materia} value={m.id_materia}>{m.nombre_materia}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="epi-estudiante" className="block text-sm font-medium mb-1">Estudiante</label>
                <Select
                  id="epi-estudiante"
                  className="min-w-[220px]"
                  value={idEstudiante}
                  onChange={(e) => setIdEstudiante(e.target.value)}
                  disabled={!idSeccion || cargandoEstudiantes}
                  title={!idSeccion ? 'Seleccione primero una sección' : undefined}
                >
                  <option value="">
                    {!idSeccion
                      ? 'Seleccione una sección'
                      : cargandoEstudiantes
                        ? 'Cargando estudiantes…'
                        : `Todos (${estudiantes.length})`}
                  </option>
                  {estudiantes.map((est) => (
                    <option key={est.id_estudiante} value={est.id_estudiante}>
                      {est.nombre_completo}{est.cedula ? ` · ${est.cedula}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="outline" disabled={cargando}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generar reporte
              </Button>
            </form>
          </CardContent>
        </Card>

        {paramsReporte && !cargando && JSON.stringify(params) !== JSON.stringify(paramsReporte) && (
          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-3 py-2" role="status">
            Cambió los filtros. Presione «Generar reporte» para actualizar la vista; el PDF se descarga con el reporte mostrado.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">{error}</p>
        )}

        {cargando && <LoadingStatus label="Generando reporte de asistencia…" />}

        {!cargando && reporte && general && (
          <>
            <p className="text-sm text-muted-foreground">
              Periodo <strong className="text-foreground">{reporte.filtros.periodo_label.toLowerCase()}</strong>:{' '}
              {formatoFecha(reporte.filtros.fecha_inicio)} al {formatoFecha(reporte.filtros.fecha_fin)}
              {reporte.filtros.nombre_seccion && <> · Sección {reporte.filtros.nombre_seccion}</>}
              {reporte.filtros.nombre_materia && <> · {reporte.filtros.nombre_materia}</>}
              {reporte.filtros.nombre_estudiante && <> · Estudiante: {reporte.filtros.nombre_estudiante}</>}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {[
                ['% Asistencia general', `${general.porcentaje_asistencia}%`, colorPorcentaje(general.porcentaje_asistencia)],
                ['Presentes', general.presentes, 'text-green-700'],
                ['Tardías', general.tardias, 'text-yellow-700'],
                ['Ausencias injustificadas', general.ausencias_injustificadas, 'text-red-700'],
                ['Ausencias justificadas', general.ausencias_justificadas, 'text-blue-700'],
                ['Total de registros', general.total, 'text-foreground'],
              ].map(([etq, valor, color]) => (
                <Card key={etq}>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{etq}</p>
                    <p className={`text-3xl font-bold ${color}`}>{valor}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground -mt-3">
              % de asistencia = (presentes + tardías) / total de registros.
            </p>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Conteo por sección</CardTitle>
                {secciones.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setAbiertas(todasAbiertas ? new Set() : new Set(secciones.map((s) => s.id_seccion)))
                    }
                  >
                    {todasAbiertas ? 'Contraer todo' : 'Ver detalle de todas'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {secciones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay registros de asistencia para el periodo y filtros seleccionados.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left">
                          <th className="px-3 py-2">Sección / materia</th>
                          <th className="px-3 py-2 text-center">Presentes</th>
                          <th className="px-3 py-2 text-center">Tardías</th>
                          <th className="px-3 py-2 text-center">Aus. justificadas</th>
                          <th className="px-3 py-2 text-center">Aus. injustificadas</th>
                          <th className="px-3 py-2 text-center">Total</th>
                          <th className="px-3 py-2 text-center">% Asistencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {secciones.map((sec) => {
                          const abierta = abiertas.has(sec.id_seccion);
                          return (
                            <Fragment key={sec.id_seccion}>
                              <tr className="border-b font-medium hover:bg-accent/50">
                                <FilaTotales totales={sec.totales}>
                                  <button
                                    type="button"
                                    className="flex items-center gap-2 text-left font-semibold"
                                    onClick={() => alternarSeccion(sec.id_seccion)}
                                    aria-expanded={abierta}
                                  >
                                    {abierta ? (
                                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                    )}
                                    Sección {sec.nombre_seccion}
                                    <span className="text-xs font-normal text-muted-foreground">
                                      ({sec.materias.length} {sec.materias.length === 1 ? 'materia' : 'materias'})
                                    </span>
                                  </button>
                                </FilaTotales>
                              </tr>
                              {abierta &&
                                sec.materias.map((m) => (
                                  <tr key={`${sec.id_seccion}-${m.id_materia}`} className="border-b bg-muted/20 text-muted-foreground">
                                    <FilaTotales totales={m.totales}>
                                      <span className="pl-8 block text-foreground">{m.nombre_materia}</span>
                                    </FilaTotales>
                                  </tr>
                                ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold bg-blue-50">
                          <FilaTotales etiqueta="Total general" totales={general} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
