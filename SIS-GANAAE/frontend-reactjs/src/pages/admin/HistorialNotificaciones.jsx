import { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, Loader2, ChevronLeft, ChevronRight, Search, X, AlertTriangle } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import notificacionServicio from '../../services/notificacionServices';
import { mapApiError } from '../../lib/errors';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

const LIMIT = 15;

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'fallido', label: 'Fallido' },
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

function formatFechaHora(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

function BadgeEstado({ registro, onVerError }) {
  if (registro.estado_envio === 'enviado') {
    return (
      <span className="inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border-emerald-200">
        Enviado
      </span>
    );
  }
  if (registro.estado_envio === 'fallido') {
    return (
      <button
        type="button"
        title={registro.mensaje_error || 'Error de envío'}
        onClick={() => onVerError(registro)}
        aria-label={`Envío fallido: ${registro.mensaje_error || 'Error de envío'}. Ver detalle`}
        className="inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border-red-200 hover:bg-red-200 cursor-pointer"
      >
        Fallido
      </button>
    );
  }
  return (
    <span className="inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-800 border-slate-300 capitalize">
      {registro.estado_envio || '—'}
    </span>
  );
}

function ModalErrorEnvio({ registro, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-error-envio"
    >
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 id="titulo-error-envio" className="font-semibold text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
            Detalle del envío fallido
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar detalle del envío fallido"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p><span className="font-medium">Fecha:</span> {formatFechaHora(registro.fecha_envio)}</p>
          <p>
            <span className="font-medium">Estudiante:</span> {registro.estudiante?.nombre_completo}
            {registro.estudiante?.cedula ? ` (${registro.estudiante.cedula})` : ''}
          </p>
          <p><span className="font-medium">Destinatario:</span> {registro.destinatario_email || '—'}</p>
          <p><span className="font-medium">Tipo:</span> {registro.tipo_evento}</p>
          <p><span className="font-medium">Asunto:</span> {registro.asunto}</p>
          <div>
            <p className="font-medium mb-1">Mensaje de error:</p>
            <p className="whitespace-pre-wrap bg-red-50 text-red-800 rounded-lg p-3 border border-red-200">
              {registro.mensaje_error || 'Error de envío'}
            </p>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}

export default function HistorialNotificaciones() {
  const [idProfesor, setIdProfesor] = useState('');
  const [estadoEnvio, setEstadoEnvio] = useState('');
  const [fechaInicio, setFechaInicio] = useState(inicioMesActual());
  const [fechaFin, setFechaFin] = useState(finMesActual());
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);

  const [profesores, setProfesores] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [errorDetalle, setErrorDetalle] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaInput.trim()), 400);
    return () => clearTimeout(t);
  }, [busquedaInput]);

  useEffect(() => {
    setPage(1);
  }, [idProfesor, estadoEnvio, fechaInicio, fechaFin, busqueda]);

  const params = useMemo(() => {
    const p = { page, limit: LIMIT };
    if (idProfesor) p.id_profesor = idProfesor;
    if (estadoEnvio) p.estado_envio = estadoEnvio;
    if (fechaInicio) p.fecha_inicio = fechaInicio;
    if (fechaFin) p.fecha_fin = fechaFin;
    if (busqueda) p.busqueda = busqueda;
    return p;
  }, [idProfesor, estadoEnvio, fechaInicio, fechaFin, busqueda, page]);

  const cargar = useCallback(() => {
    setCargando(true);
    setError('');
    notificacionServicio
      .listarNotificaciones(params)
      .then((res) => {
        setRegistros(res.data || []);
        setTotal(res.pagination?.total_registros ?? 0);
        setTotalPaginas(res.pagination?.total_paginas ?? 0);
        if (res.catalogos?.profesores) setProfesores(res.catalogos.profesores);
      })
      .catch((err) => {
        setRegistros([]);
        setTotal(0);
        setTotalPaginas(0);
        setError(mapApiError(err, 'Error al cargar el historial de notificaciones.'));
      })
      .finally(() => setCargando(false));
  }, [params]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarFiltros = () => {
    setIdProfesor('');
    setEstadoEnvio('');
    setFechaInicio(inicioMesActual());
    setFechaFin(finMesActual());
    setBusquedaInput('');
  };

  const cerrarErrorDetalle = useCallback(() => setErrorDetalle(null), []);

  const desde = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const hasta = Math.min(page * LIMIT, total);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-6 w-6 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-bold">Historial de notificaciones</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Auditoría de los correos enviados a encargados por ausencias injustificadas y estados de orientación.
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
                <div>
                  <label htmlFor="filtro-profesor" className="block text-sm font-medium mb-1.5">Docente emisor</label>
                  <Select id="filtro-profesor" value={idProfesor} onChange={(e) => setIdProfesor(e.target.value)}>
                    <option value="">Todos los docentes</option>
                    {profesores.map((p) => (
                      <option key={p.id_persona} value={p.id_persona}>{p.nombre_completo}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="filtro-estado" className="block text-sm font-medium mb-1.5">Estado</label>
                  <Select id="filtro-estado" value={estadoEnvio} onChange={(e) => setEstadoEnvio(e.target.value)}>
                    {ESTADOS_FILTRO.map((e) => (
                      <option key={e.value || 'all'} value={e.value}>{e.label}</option>
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
              <CardTitle className="text-base">Notificaciones ({total})</CardTitle>
              {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
            </CardHeader>
            <CardContent>
              {cargando && registros.length === 0 && (
                <LoadingStatus label="Cargando notificaciones…" className="justify-center py-8" />
              )}
              {!cargando && registros.length === 0 && !error && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay notificaciones para los filtros seleccionados.
                </p>
              )}
              {registros.length > 0 && (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Historial de notificaciones enviadas a encargados con fecha, estudiante, sección, docente emisor, destinatario, tipo y estado
                      </caption>
                      <thead className="bg-muted/50">
                        <tr>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Fecha/hora</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Estudiante</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Sección</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Profesor emisor</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Destinatario</th>
                          <th scope="col" className="text-left py-3 px-3 font-medium">Tipo</th>
                          <th scope="col" className="text-center py-3 px-3 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registros.map((r) => (
                          <tr key={r.id_notificacion} className="border-t hover:bg-muted/20">
                            <td className="py-3 px-3 whitespace-nowrap text-muted-foreground">
                              {formatFechaHora(r.fecha_envio)}
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-medium">{r.estudiante?.nombre_completo}</p>
                              <p className="text-xs text-muted-foreground">{r.estudiante?.cedula}</p>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">{r.estudiante?.seccion || 'Sin sección'}</td>
                            <td className="py-3 px-3">{r.profesor_emisor?.nombre_completo || '—'}</td>
                            <td className="py-3 px-3 max-w-[200px] truncate" title={r.destinatario_email || ''}>
                              {r.destinatario_email || '—'}
                            </td>
                            <td className="py-3 px-3" title={r.asunto}>{r.tipo_evento}</td>
                            <td className="py-3 px-3 text-center">
                              <BadgeEstado registro={r} onVerError={setErrorDetalle} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <nav
                    className="flex flex-wrap items-center justify-between gap-3 pt-4"
                    aria-label="Paginación del historial de notificaciones"
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
                        Página {page} de {Math.max(totalPaginas, 1)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPaginas || cargando}
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

      {errorDetalle && <ModalErrorEnvio registro={errorDetalle} onClose={cerrarErrorDetalle} />}
    </div>
  );
}
