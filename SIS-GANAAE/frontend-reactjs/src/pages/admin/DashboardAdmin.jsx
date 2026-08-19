import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import MainBar from '../../components/side-bar/mainBar';
import reportesServicio from '../../services/reportesServices';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';
import { AlertTriangle, Download, RotateCcw } from 'lucide-react';

function inicioMesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
}

function finMesActual() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

const PIE_COLORS = ['#3b82f6', '#ef4444'];

function escaparCsv(valor) {
  const s = String(valor ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function descargarMatrizCsv(filas, nombreArchivo) {
  const encabezados = ['Nombre', 'Fecha', 'Seccion', 'Materia', 'Condicion'];
  const lineas = [
    encabezados.join(','),
    ...filas.map((f) =>
      [f.nombre, f.fecha, f.seccion, f.materia, f.condicion].map(escaparCsv).join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function DashboardAdmin() {
  const { alert } = useDialog();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [idSeccion, setIdSeccion] = useState('');
  const [idMateria, setIdMateria] = useState('');
  const [fechaInicio, setFechaInicio] = useState(inicioMesActual());
  const [fechaFin, setFechaFin] = useState(finMesActual());
  const [catalogos, setCatalogos] = useState({ secciones: [], materias: [] });
  const [stats, setStats] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const params = useMemo(() => {
    const p = { fecha_inicio: fechaInicio, fecha_fin: fechaFin };
    if (idSeccion) p.id_seccion = idSeccion;
    if (idMateria) p.id_materia = idMateria;
    return p;
  }, [idSeccion, idMateria, fechaInicio, fechaFin]);

  const cargarDatos = useCallback(() => {
    setCargando(true);
    setError('');
    Promise.all([
      reportesServicio.getEstadisticasReportes(params),
      reportesServicio.getPermanenciaAlertas(params),
    ])
      .then(([est, alert]) => {
        setStats(est);
        setAlertas(alert.alertas || []);
        if (est.catalogos) setCatalogos(est.catalogos);
      })
      .catch((err) => {
        setStats(null);
        setAlertas([]);
        setError(err.response?.data?.error || 'Error al cargar reportes');
      })
      .finally(() => setCargando(false));
  }, [params]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const limpiarFiltros = () => {
    setIdSeccion('');
    setIdMateria('');
    setFechaInicio(inicioMesActual());
    setFechaFin(finMesActual());
  };

  const kpis = stats?.kpis;
  const pieData = stats?.distribucion_ausencias
    ? [
        { name: 'Justificadas', value: stats.distribucion_ausencias.justificadas },
        { name: 'Injustificadas', value: stats.distribucion_ausencias.injustificadas },
      ].filter((d) => d.value > 0)
    : [];

  const chartSecciones = (stats?.por_seccion || []).map((s) => ({
    nombre: s.nombre_seccion,
    asistencia: s.nivel_asistencia_pct,
  }));

  const chartMaterias = (stats?.por_materia || []).map((m) => ({
    nombre: m.nombre_materia?.length > 18 ? `${m.nombre_materia.slice(0, 16)}…` : m.nombre_materia,
    asistencia: m.nivel_asistencia_pct,
  }));

  const exportarCsv = async () => {
    const filas = stats?.matriz_exportacion || [];
    if (filas.length === 0) {
      await alert('No hay datos para exportar en el periodo seleccionado.', {
        variant: 'info',
        title: 'Sin datos',
      });
      return;
    }
    descargarMatrizCsv(
      filas,
      `matriz_asistencia_${fechaInicio}_${fechaFin}.csv`
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard de reportes estadísticos</h1>
            <p className="text-sm text-muted-foreground">
              Métricas de asistencia, alertas de permanencia estudiantil y exportación de matriz analítica.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={exportarCsv} disabled={cargando}>
            <Download className="h-4 w-4 mr-2" />
            Exportar matriz CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros de consulta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Sección</label>
                <Select
                  className="min-w-[160px]"
                  value={idSeccion}
                  onChange={(e) => setIdSeccion(e.target.value)}
                >
                  <option value="">Todo general</option>
                  {(catalogos.secciones || []).map((s) => (
                    <option key={s.id_seccion} value={s.id_seccion}>
                      {s.nombre_seccion}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Materia</label>
                <Select
                  className="min-w-[180px]"
                  value={idMateria}
                  onChange={(e) => setIdMateria(e.target.value)}
                >
                  <option value="">Todas</option>
                  {(catalogos.materias || []).map((m) => (
                    <option key={m.id_materia} value={m.id_materia}>
                      {m.nombre_materia}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Desde</label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hasta</label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={limpiarFiltros}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        {cargando && (
          <LoadingStatus label="Procesando datos de asistencia y alertas…" />
        )}

        {!cargando && kpis && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Nivel asistencia</p>
                  <p className="text-3xl font-bold text-blue-700">{kpis.nivel_asistencia_pct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Promedio secciones: {kpis.nivel_asistencia_promedio}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Puntualidad</p>
                  <p className="text-3xl font-bold text-green-700">{kpis.puntualidad_pct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpis.presentes} presentes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Tardías</p>
                  <p className="text-3xl font-bold text-yellow-700">{kpis.tardias_pct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpis.tardias} registros</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Ausencias totales</p>
                  <p className="text-3xl font-bold text-red-700">{kpis.ausencias_totales}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    J: {kpis.ausencias_justificadas} · I: {kpis.ausencias_injustificadas}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Asistencia por sección (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {chartSecciones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos para graficar.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartSecciones} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="nombre" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${v}%`, 'Nivel asistencia']} />
                        <Bar dataKey="asistencia" fill="#2563eb" name="Nivel asistencia" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Asistencia por materia (%)</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {chartMaterias.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos para graficar.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartMaterias} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="nombre" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${v}%`, 'Nivel asistencia']} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="asistencia"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="Nivel asistencia"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribución de ausencias</CardTitle>
              </CardHeader>
              <CardContent className="h-64 flex items-center justify-center">
                {pieData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay ausencias en el periodo.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Card className="border-red-200">
          <CardHeader className="bg-red-50/80">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <CardTitle className="text-base text-red-800">
                Alertas de permanencia estudiantil
              </CardTitle>
              <span className="ml-auto inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                Riesgo inmediato
              </span>
            </div>
            <p className="text-sm text-red-700/90">
              Estudiantes con ≥ 3 tardías o ≥ 3 ausencias (justificadas o injustificadas) en el periodo consultado.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {alertas.length === 0 && !cargando && (
              <p className="text-sm text-muted-foreground">
                No hay estudiantes en riesgo inmediato con los filtros actuales.
              </p>
            )}
            {alertas.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Alertas de permanencia estudiantil por ausencias y tardías en el periodo consultado
                  </caption>
                  <thead>
                    <tr className="border-b text-left">
                      <th scope="col" className="py-2 px-2 font-medium">Estudiante</th>
                      <th scope="col" className="py-2 px-2 font-medium">Sección</th>
                      <th scope="col" className="py-2 px-2 font-medium text-center">Ausencias</th>
                      <th scope="col" className="py-2 px-2 font-medium text-center">Tardías</th>
                      <th scope="col" className="py-2 px-2 font-medium">Motivo</th>
                      <th scope="col" className="py-2 px-2 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertas.map((a) => (
                      <tr key={a.id_estudiante} className="border-b last:border-b-0">
                        <td className="py-2 px-2 font-medium">{a.nombre_completo}</td>
                        <td className="py-2 px-2">{a.nombre_seccion}</td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`inline-block min-w-[2rem] rounded-full px-2 py-0.5 text-xs font-bold ${
                              a.ausencias >= 3 ? 'bg-red-100 text-red-900' : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {a.ausencias}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`inline-block min-w-[2rem] rounded-full px-2 py-0.5 text-xs font-bold ${
                              a.tardias >= 3 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {a.tardias}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{a.motivo}</td>
                        <td className="py-2 px-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (user?.rol === 'orientador') {
                                navigate('/orientacion/estados', { state: { idEstudiante: a.id_estudiante } });
                              } else {
                                navigate('/estudiantes', { state: { verPerfilId: a.id_estudiante } });
                              }
                            }}
                          >
                            Ver perfil
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
