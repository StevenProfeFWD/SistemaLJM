import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye, FileCheck, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import DetalleJustificacionModal, {
  badgeTipoJustificacion,
  formatFechaJustificacion,
} from '../../components/DetalleJustificacionModal';
import justificacionServicio from '../../services/justificacionServices';
import { useAuth } from '../../context/AuthContext';
import { mapApiError } from '../../lib/errors';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

const LIMIT = 15;

const TIPOS_FILTRO = [
  { value: '', label: 'Todos los tipos' },
  { value: 'medica', label: 'Médica' },
  { value: 'personal', label: 'Personal' },
  { value: 'institucional', label: 'Institucional' },
];

function inicioMesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
}

function finMesActual() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

export default function HistorialJustificaciones() {
  const { user } = useAuth();
  const esProfesor = user?.rol === 'profesor';

  const [idSeccion, setIdSeccion] = useState('');
  const [tipo, setTipo] = useState('');
  const [fechaInicio, setFechaInicio] = useState(inicioMesActual());
  const [fechaFin, setFechaFin] = useState(finMesActual());
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);

  const [secciones, setSecciones] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [detalleId, setDetalleId] = useState(null);

  // Búsqueda con debounce para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaInput.trim()), 400);
    return () => clearTimeout(t);
  }, [busquedaInput]);

  // Cualquier cambio de filtro vuelve a la primera página
  useEffect(() => {
    setPage(1);
  }, [idSeccion, tipo, fechaInicio, fechaFin, busqueda]);

  const params = useMemo(
    () => ({
      id_seccion: idSeccion,
      tipo_justificacion: tipo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      busqueda,
      page,
      limit: LIMIT,
    }),
    [idSeccion, tipo, fechaInicio, fechaFin, busqueda, page]
  );

  const cargar = useCallback(() => {
    setCargando(true);
    setError('');
    justificacionServicio
      .listarJustificaciones(params)
      .then((data) => {
        setRegistros(data.registros || []);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 0);
        if (data.catalogos?.secciones) setSecciones(data.catalogos.secciones);
      })
      .catch((err) => {
        setRegistros([]);
        setTotal(0);
        setTotalPages(0);
        setError(mapApiError(err, 'Error al cargar el historial de justificaciones.'));
      })
      .finally(() => setCargando(false));
  }, [params]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setIdSeccion('');
    setTipo('');
    setFechaInicio(inicioMesActual());
    setFechaFin(finMesActual());
    setBusquedaInput('');
  };

  const desde = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const hasta = Math.min(page * LIMIT, total);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileCheck className="h-6 w-6 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-bold">Historial de justificaciones</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {esProfesor
                ? 'Justificaciones de ausencias en las secciones de su carga académica o grupo guía.'
                : 'Consulta global de las justificaciones de ausencias registradas en el liceo.'}
            </p>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Filtros</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-1">
                  <label htmlFor="filtro-seccion" className="block text-sm font-medium mb-1.5">Sección</label>
                  <Select id="filtro-seccion" value={idSeccion} onChange={(e) => setIdSeccion(e.target.value)}>
                    <option value="">Todas las secciones</option>
                    {secciones.map((s) => (
                      <option key={s.id_seccion} value={s.id_seccion}>
                        {s.nombre_seccion}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="filtro-tipo" className="block text-sm font-medium mb-1.5">Tipo</label>
                  <Select id="filtro-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS_FILTRO.map((t) => (
                      <option key={t.value || 'all'} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="filtro-desde" className="block text-sm font-medium mb-1.5">Fecha desde</label>
                  <Input
                    id="filtro-desde"
                    type="date"
                    value={fechaInicio}
                    max={fechaFin || undefined}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="filtro-hasta" className="block text-sm font-medium mb-1.5">Fecha hasta</label>
                  <Input
                    id="filtro-hasta"
                    type="date"
                    value={fechaFin}
                    min={fechaInicio || undefined}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="filtro-busqueda" className="block text-sm font-medium mb-1.5">Buscar estudiante</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="filtro-busqueda"
                      type="search"
                      className="pl-8"
                      placeholder="Nombre o cédula"
                      value={busquedaInput}
                      onChange={(e) => setBusquedaInput(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Justificaciones ({total})</CardTitle>
              {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
            </CardHeader>
            <CardContent>
              {cargando && registros.length === 0 && (
                <LoadingStatus label="Cargando justificaciones…" className="justify-center py-8" />
              )}
              {!cargando && registros.length === 0 && !error && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay justificaciones para los filtros seleccionados.
                </p>
              )}
              {registros.length > 0 && (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Historial de justificaciones con estudiante, sección, fecha de ausencia, tipo y usuario que registró
                      </caption>
                      <thead className="bg-muted/50">
                        <tr>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Estudiante</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Sección</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Fecha ausencia</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Tipo</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Registrado por</th>
                          <th scope="col" className="text-center py-3 px-3 font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registros.map((r) => (
                          <tr key={r.id_justificacion} className="border-t hover:bg-muted/20">
                            <td className="py-3 px-3">
                              <p className="font-medium">{r.estudiante?.nombre_completo}</p>
                              <p className="text-xs text-muted-foreground">{r.estudiante?.cedula}</p>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {r.nombre_seccion}
                              {r.nombre_materia && (
                                <p className="text-xs text-muted-foreground">{r.nombre_materia}</p>
                              )}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-muted-foreground">
                              {formatFechaJustificacion(r.fecha_ausencia)}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeTipoJustificacion(
                                  r.tipo_justificacion
                                )}`}
                              >
                                {r.tipo_justificacion_label}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {r.registrado_por ? (
                                <>
                                  <p>{r.registrado_por.nombre_completo}</p>
                                  <p className="text-xs text-muted-foreground">{r.registrado_por.rol_label}</p>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDetalleId(r.id_justificacion)}
                                aria-label={`Ver detalle de la justificación de ${r.estudiante?.nombre_completo}`}
                              >
                                <Eye className="h-4 w-4 mr-1" aria-hidden="true" />
                                Ver
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <nav
                    className="flex flex-wrap items-center justify-between gap-3 pt-4"
                    aria-label="Paginación del historial de justificaciones"
                  >
                    <p className="text-sm text-muted-foreground">
                      Mostrando {desde}–{hasta} de {total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || cargando}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                        Anterior
                      </Button>
                      <span className="text-sm">
                        Página {page} de {Math.max(totalPages, 1)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages || cargando}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                      </Button>
                    </div>
                  </nav>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {detalleId && (
        <DetalleJustificacionModal idJustificacion={detalleId} onClose={() => setDetalleId(null)} />
      )}
    </div>
  );
}
