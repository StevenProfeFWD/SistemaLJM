import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye, FileDown, Download, X, Loader2, History, Pencil, CirclePlay } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import orientacionServicio from '../../services/orientacionServices';
import ModalEditarEstado from './ModalEditarEstado';
import {
  enriquecerRegistroHistorial,
  MENSAJE_EXPULSION_DEFINITIVA,
} from '../../utils/vigenciaEstadoOrientacion';
import { useDialog } from '../../context/DialogContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

const TIPOS_FILTRO = [
  { value: '', label: 'Todos los estados' },
  { value: 'suspension', label: 'Suspensión' },
  { value: 'permiso_institucional', label: 'Permiso institucional' },
  { value: 'expulsion', label: 'Expulsión' },
];

function badgeTipo(tipo) {
  if (tipo === 'suspension') {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (tipo === 'permiso_institucional') {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  if (tipo === 'expulsion') {
    return 'bg-gray-900 text-white border-gray-700';
  }
  return 'bg-slate-100 text-slate-800 border-slate-300';
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

function ModalDetalle({ registro, onClose }) {
  if (!registro) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Detalle del registro</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar detalle del registro">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p><span className="font-medium">Estudiante:</span> {registro.nombre_completo}</p>
          <p><span className="font-medium">Cédula:</span> {registro.cedula}</p>
          <p><span className="font-medium">Sección:</span> {registro.nombre_seccion}</p>
          <p>
            <span className="font-medium">Tipo:</span>{' '}
            <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${badgeTipo(registro.tipo_estado)}`}>
              {registro.tipo_estado_label}
            </span>
          </p>
          <p><span className="font-medium">Periodo:</span> {formatPeriodo(registro.fecha_inicio, registro.fecha_fin)}</p>
          <div>
            <p className="font-medium mb-1">Motivo / Justificación:</p>
            <p className="text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border">
              {registro.motivo || 'Sin motivo registrado.'}
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

function inicioMesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
}

function finMesActual() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

export default function HistorialEstados() {
  const { confirm, alert, toast } = useDialog();
  const { user } = useAuth();
  const soloLectura = user?.rol === 'super_administrador';
  const [tipoEstado, setTipoEstado] = useState('');
  const [idSeccion, setIdSeccion] = useState('');
  const [fechaInicio, setFechaInicio] = useState(inicioMesActual());
  const [fechaFin, setFechaFin] = useState(finMesActual());
  const [secciones, setSecciones] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [descargandoReporte, setDescargandoReporte] = useState(false);
  const [descargandoId, setDescargandoId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState('');
  const [anulandoId, setAnulandoId] = useState(null);

  const params = useMemo(() => {
    const p = {};
    if (tipoEstado) p.tipo_estado = tipoEstado;
    if (idSeccion) p.id_seccion = idSeccion;
    if (fechaInicio) p.fecha_inicio = fechaInicio;
    if (fechaFin) p.fecha_fin = fechaFin;
    return p;
  }, [tipoEstado, idSeccion, fechaInicio, fechaFin]);

  const cargarHistorial = useCallback(() => {
    setCargando(true);
    setError('');
    orientacionServicio
      .getHistorialOrientacion(params)
      .then((data) => {
        const lista = (data.registros || []).map(enriquecerRegistroHistorial);
        setRegistros(lista);
        setTotal(data.total ?? lista.length);
        if (data.catalogos?.secciones) setSecciones(data.catalogos.secciones);
      })
      .catch((err) => {
        setRegistros([]);
        setTotal(0);
        setError(err.response?.data?.error || 'Error al cargar el historial.');
      })
      .finally(() => setCargando(false));
  }, [params]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const descargarIndividual = async (id) => {
    try {
      setDescargandoId(id);
      const blob = await orientacionServicio.descargarComprobanteOrientacionPdf(id);
      orientacionServicio.guardarBlob(blob, `comprobante_orientacion_${id}.pdf`);
    } catch {
      await alert('No fue posible descargar el comprobante PDF.', { variant: 'error', title: 'Error al descargar' });
    } finally {
      setDescargandoId(null);
    }
  };

  const descargarReporteFiltrado = async () => {
    try {
      setDescargandoReporte(true);
      const blob = await orientacionServicio.descargarReporteOrientacionFiltradoPdf(params);
      orientacionServicio.guardarBlob(
        blob,
        `reporte_estados_orientacion_${fechaInicio}_${fechaFin}.pdf`
      );
    } catch {
      await alert('No fue posible generar el reporte PDF filtrado.', { variant: 'error', title: 'Error al generar' });
    } finally {
      setDescargandoReporte(false);
    }
  };

  const finalizarDesdeTabla = async (registro) => {
    if (!registro.isEditable) return;

    const ok = await confirm({
      title: 'Finalizar estado especial',
      message:
        '¿Desea levantar o finalizar este estado de forma inmediata? El estudiante volverá a estar activo en las listas de asistencia.',
      confirmLabel: 'Finalizar estado',
      cancelLabel: 'Cancelar',
      variant: 'success',
      icon: 'success',
    });
    if (!ok) return;
    try {
      setAnulandoId(registro.id_estado_periodo);
      await orientacionServicio.anularEstadoOrientacion(registro.id_estado_periodo);
      toast(`Estado finalizado para ${registro.nombre_completo}.`, 'success');
      cargarHistorial();
    } catch (err) {
      await alert(err.response?.data?.error || 'No fue posible finalizar el estado.', {
        variant: 'error',
        title: 'Error',
      });
    } finally {
      setAnulandoId(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <History className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Historial de estados especiales</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                {soloLectura
                  ? 'Consulta y exportación de suspensiones, permisos y expulsiones (solo lectura).'
                  : 'Consulta, filtra y exporta suspensiones, permisos y expulsiones registrados por orientación.'}
              </p>
            </div>
            <Button
              type="button"
              onClick={descargarReporteFiltrado}
              disabled={descargandoReporte || cargando}
              className="shrink-0"
            >
              {descargandoReporte ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar reporte PDF filtrado
                </>
              )}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros avanzados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Tipo de estado</label>
                  <Select
                    value={tipoEstado}
                    onChange={(e) => setTipoEstado(e.target.value)}
                  >
                    {TIPOS_FILTRO.map((t) => (
                      <option key={t.value || 'all'} value={t.value}>{t.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Sección</label>
                  <Select
                    value={idSeccion}
                    onChange={(e) => setIdSeccion(e.target.value)}
                  >
                    <option value="">Todas las secciones</option>
                    {secciones.map((s) => (
                      <option key={s.id_seccion} value={s.id_seccion}>{s.nombre_seccion}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Fecha desde</label>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Fecha hasta</label>
                  <Input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Registros ({total})</CardTitle>
              {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent>
              {cargando && registros.length === 0 && (
                <LoadingStatus label="Cargando historial de estados…" className="justify-center py-8" />
              )}
              {!cargando && registros.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay registros para los filtros seleccionados.
                </p>
              )}
              {registros.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Historial de estados especiales de orientación con periodo, motivo y acciones
                    </caption>
                    <thead className="bg-muted/50">
                      <tr>
                        <th scope="col" className="text-left py-3 px-3 font-medium">Estudiante</th>
                        <th scope="col" className="text-left py-3 px-3 font-medium">Sección</th>
                        <th scope="col" className="text-left py-3 px-3 font-medium">Estado</th>
                        <th scope="col" className="text-left py-3 px-3 font-medium">Periodo</th>
                        <th scope="col" className="text-left py-3 px-3 font-medium max-w-[180px]">Motivo</th>
                        <th scope="col" className="text-center py-3 px-3 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registros.map((r) => {
                        const editable = !soloLectura && r.isEditable;
                        const tituloEditar = r.esExpulsion
                          ? MENSAJE_EXPULSION_DEFINITIVA
                          : editable
                            ? 'Editar registro'
                            : 'Registro histórico (solo lectura)';
                        return (
                        <tr key={r.id_estado_periodo} className="border-t hover:bg-muted/20">
                          <td className="py-3 px-3">
                            <p className="font-medium">{r.nombre_completo}</p>
                            <p className="text-xs text-muted-foreground">{r.cedula}</p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">{r.nombre_seccion}</td>
                          <td className="py-3 px-3">
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeTipo(r.tipo_estado)}`}>
                              {r.tipo_estado_label}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-muted-foreground">
                            {formatPeriodo(r.fecha_inicio, r.fecha_fin)}
                          </td>
                          <td className="py-3 px-3 max-w-[180px] truncate text-muted-foreground" title={r.motivo || ''}>
                            {r.motivo || '—'}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                aria-label="Ver detalle del registro"
                                className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                                onClick={() => setDetalle(r)}
                              >
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label="Descargar PDF del registro"
                                className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
                                disabled={descargandoId === r.id_estado_periodo}
                                onClick={() => descargarIndividual(r.id_estado_periodo)}
                              >
                                {descargandoId === r.id_estado_periodo ? (
                                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                ) : (
                                  <FileDown className="h-4 w-4" aria-hidden="true" />
                                )}
                              </button>
                              {!soloLectura && (
                                <>
                              <button
                                type="button"
                                aria-label={tituloEditar}
                                disabled={!editable}
                                className={`p-2 rounded-md text-muted-foreground ${
                                  editable
                                    ? 'hover:bg-accent hover:text-foreground'
                                    : 'opacity-40 cursor-not-allowed'
                                }`}
                                onClick={() => editable && setEditando(r)}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              {editable && (
                                <button
                                  type="button"
                                  aria-label="Finalizar o levantar estado"
                                  className="p-2 rounded-md hover:bg-emerald-50 text-emerald-700 disabled:opacity-50"
                                  disabled={anulandoId === r.id_estado_periodo}
                                  onClick={() => finalizarDesdeTabla(r)}
                                >
                                  {anulandoId === r.id_estado_periodo ? (
                                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                  ) : (
                                    <CirclePlay className="h-4 w-4" aria-hidden="true" />
                                  )}
                                </button>
                              )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {detalle && <ModalDetalle registro={detalle} onClose={() => setDetalle(null)} />}

      {editando && (
        <ModalEditarEstado
          registro={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            toast('Registro actualizado correctamente.', 'success');
            cargarHistorial();
          }}
          onAnulado={(r) => {
            toast(`Estado finalizado para ${r.nombre_completo}.`, 'success');
            cargarHistorial();
          }}
        />
      )}
    </div>
  );
}
