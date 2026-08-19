import { useState, useEffect, useMemo } from 'react';
import MainBar from '../../components/side-bar/mainBar';
import servicioEstudiantes from '../../services/asignacionAsistenciaServices';
import padresServicio from '../../services/padresServices';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';
import { useDialog } from '../../context/DialogContext';

function inicioMesActual() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function finMesActual() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const ultimo = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

const BADGE_POR_CONDICION = {
  Presente: 'bg-green-100 text-green-800 border-green-200',
  'Tardía': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Ausencia Justificada': 'bg-blue-100 text-blue-800 border-blue-200',
  'Ausencia Injustificada': 'bg-red-100 text-red-800 border-red-200',
  'Permiso Especial': 'bg-purple-100 text-purple-800 border-purple-200',
  Suspendido: 'bg-orange-100 text-orange-800 border-orange-200',
  Expulsado: 'bg-gray-900 text-white border-gray-700',
};

function badgeClass(condicion) {
  return BADGE_POR_CONDICION[condicion] || 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function HistorialAsistenciaHijos() {
  const { alert } = useDialog();
  const [hijos, setHijos] = useState([]);
  const [idEstudiante, setIdEstudiante] = useState('');
  const [fechaInicio, setFechaInicio] = useState(inicioMesActual());
  const [fechaFin, setFechaFin] = useState(finMesActual());
  const [registros, setRegistros] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [estudianteInfo, setEstudianteInfo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoHijos, setCargandoHijos] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

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
    if (!idEstudiante || !fechaInicio || !fechaFin) return;

    setCargando(true);
    setError('');
    padresServicio
      .getHistorialAsistenciaHijos({
        id_estudiante: idEstudiante,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      })
      .then((data) => {
        setRegistros(data.registros || []);
        setResumen(data.resumen || null);
        setEstudianteInfo(data.estudiante || null);
      })
      .catch((err) => {
        setRegistros([]);
        setResumen(null);
        setEstudianteInfo(null);
        setError(err.response?.data?.error || 'No fue posible cargar el historial.');
      })
      .finally(() => setCargando(false));
  }, [idEstudiante, fechaInicio, fechaFin]);

  const hijoSeleccionado = useMemo(
    () => hijos.find((h) => String(h.id_persona) === String(idEstudiante)),
    [hijos, idEstudiante]
  );

  const descargarPdf = async () => {
    if (!idEstudiante) return;
    try {
      setDescargando(true);
      const blob = await padresServicio.descargarReporteAsistenciaPdf({
        id_estudiante: idEstudiante,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });
      const nombre = hijoSeleccionado?.nombre_completo?.replace(/\s+/g, '_') || 'estudiante';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_asistencia_${nombre}_${fechaInicio}_${fechaFin}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      await alert('No fue posible descargar el reporte PDF.', {
        variant: 'error',
        title: 'Error al descargar',
      });
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Historial de asistencia</CardTitle>
            <p className="text-sm text-muted-foreground">
              Consulte las marcas de lista de sus hijos matriculados y descargue la matriz de análisis en PDF.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {cargandoHijos && <LoadingStatus label="Cargando estudiantes vinculados…" />}

            {!cargandoHijos && hijos.length === 0 && (
              <p className="text-muted-foreground">
                No tiene estudiantes vinculados para consultar asistencia.
              </p>
            )}

            {hijos.length > 0 && (
              <>
                <div className="flex flex-wrap gap-4 items-end">
                  {hijos.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Estudiante</label>
                      <Select
                        className="min-w-[220px]"
                        value={idEstudiante}
                        onChange={(e) => setIdEstudiante(e.target.value)}
                      >
                        {hijos.map((h) => (
                          <option key={h.id_persona} value={h.id_persona}>
                            {h.nombre_completo}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}

                  {hijos.length === 1 && (
                    <div>
                      <p className="text-sm font-medium">Estudiante</p>
                      <p className="text-sm text-muted-foreground">{hijos[0].nombre_completo}</p>
                    </div>
                  )}

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

                  <Button
                    type="button"
                    onClick={descargarPdf}
                    disabled={descargando || !idEstudiante}
                  >
                    {descargando ? 'Generando PDF...' : 'Descargar Reporte PDF'}
                  </Button>
                </div>

                {estudianteInfo && (
                  <p className="text-sm text-muted-foreground">
                    Sección: <strong>{estudianteInfo.nombre_seccion}</strong>
                    {' · '}
                    Año lectivo {estudianteInfo.anio_curso_lectivo}
                  </p>
                )}

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {error}
                  </p>
                )}

                {resumen && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="rounded border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Presentes</p>
                      <p className="text-lg font-semibold text-green-700">{resumen.presentes}</p>
                    </div>
                    <div className="rounded border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Tardías</p>
                      <p className="text-lg font-semibold text-yellow-700">{resumen.tardias}</p>
                    </div>
                    <div className="rounded border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Aus. justificadas</p>
                      <p className="text-lg font-semibold text-blue-700">{resumen.ausencias_justificadas}</p>
                    </div>
                    <div className="rounded border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Aus. injustificadas</p>
                      <p className="text-lg font-semibold text-red-700">{resumen.ausencias_injustificadas}</p>
                    </div>
                    <div className="rounded border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Ausencias totales</p>
                      <p className="text-lg font-semibold">{resumen.ausencias_totales}</p>
                    </div>
                    <div className="rounded border p-3 text-center bg-slate-50">
                      <p className="text-xs text-muted-foreground">Nivel asistencia</p>
                      <p className="text-lg font-semibold">{resumen.nivel_asistencia_pct}%</p>
                    </div>
                  </div>
                )}

                {cargando && <LoadingStatus label="Cargando historial de asistencia…" />}

                {!cargando && registros.length > 0 && (
                  <div className="overflow-x-auto border rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Fecha</th>
                          <th className="text-left px-3 py-2 font-medium">Materia</th>
                          <th className="text-left px-3 py-2 font-medium">Lección / Horario</th>
                          <th className="text-left px-3 py-2 font-medium">Condición</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registros.map((r) => (
                          <tr key={r.id_asistencia} className="border-t">
                            <td className="px-3 py-2 whitespace-nowrap">{formatFecha(r.fecha)}</td>
                            <td className="px-3 py-2">{r.nombre_materia}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.horario_leccion}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(r.condicion)}`}
                              >
                                {r.condicion}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!cargando && !error && registros.length === 0 && idEstudiante && (
                  <p className="text-muted-foreground text-sm">
                    No hay registros de asistencia en el rango seleccionado.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
