import { useState, useEffect, useMemo } from 'react';
import { FileDown, Loader2, ShieldAlert, History } from 'lucide-react';
import MainBar from '../../components/side-bar/mainBar';
import servicioEstudiantes from '../../services/asignacionAsistenciaServices';
import padresServicio from '../../services/padresServices';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';

function badgeTipo(tipo) {
  if (tipo === 'suspension' || tipo === 'expulsion') {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (tipo === 'permiso_institucional') {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatFecha(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatPeriodo(registro) {
  const inicio = formatFecha(registro.fecha_inicio);
  if (!inicio) return '—';
  if (registro.es_expulsion || !registro.fecha_fin) {
    return `${inicio} — Permanente`;
  }
  return `${inicio} al ${formatFecha(registro.fecha_fin)}`;
}

export default function EstadosHijos() {
  const { confirm, alert, toast } = useDialog();
  const [hijos, setHijos] = useState([]);
  const [idEstudiante, setIdEstudiante] = useState('');
  const [registros, setRegistros] = useState([]);
  const [estudianteInfo, setEstudianteInfo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoHijos, setCargandoHijos] = useState(true);
  const [descargandoId, setDescargandoId] = useState(null);
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
    if (!idEstudiante) return;

    setCargando(true);
    setError('');
    padresServicio
      .getEstadosEspecialesHijos({ id_estudiante: idEstudiante })
      .then((data) => {
        setRegistros(data.registros || []);
        setEstudianteInfo(data.estudiante || null);
      })
      .catch((err) => {
        setRegistros([]);
        setEstudianteInfo(null);
        setError(err.response?.data?.error || 'No fue posible cargar los estados especiales.');
      })
      .finally(() => setCargando(false));
  }, [idEstudiante]);

  const hijoSeleccionado = useMemo(
    () => hijos.find((h) => String(h.id_persona) === String(idEstudiante)),
    [hijos, idEstudiante]
  );

  const descargarComprobante = async (registro) => {
    const ok = await confirm({
      title: 'Descargar comprobante oficial',
      message: `¿Desea descargar el comprobante PDF del registro "${registro.tipo_estado_label}"? El documento es el mismo emitido por el departamento de orientación.`,
      confirmLabel: 'Descargar PDF',
      cancelLabel: 'Cancelar',
      variant: 'default',
      icon: 'help',
    });
    if (!ok) return;

    try {
      setDescargandoId(registro.id_estado_periodo);
      const blob = await padresServicio.descargarComprobanteEstadoEspecialPdf(registro.id_estado_periodo);
      const nombre = (hijoSeleccionado?.nombre_completo || 'estudiante').replace(/\s+/g, '_');
      padresServicio.guardarBlob(
        blob,
        `comprobante_orientacion_${nombre}_${registro.id_estado_periodo}.pdf`
      );
      toast('Comprobante descargado correctamente.', 'success');
    } catch (err) {
      await alert(err.response?.data?.error || 'No fue posible descargar el comprobante PDF.', {
        variant: 'error',
        title: 'Error al descargar',
      });
    } finally {
      setDescargandoId(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <ShieldAlert className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Estados especiales</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Consulte suspensiones, permisos institucionales y expulsiones registradas por orientación para sus hijos.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estudiante</CardTitle>
            </CardHeader>
            <CardContent>
              {cargandoHijos ? (
                <LoadingStatus label="Cargando hijos vinculados…" />
              ) : hijos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tiene estudiantes vinculados en el sistema.
                </p>
              ) : (
                <Select
                  className="max-w-md"
                  value={idEstudiante}
                  onChange={(e) => setIdEstudiante(e.target.value)}
                >
                  {hijos.map((h) => (
                    <option key={h.id_persona} value={h.id_persona}>
                      {h.nombre_completo}
                      {h.cedula ? ` — ${h.cedula}` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </CardContent>
          </Card>

          {estudianteInfo && (
            <Card className="border-muted">
              <CardContent className="pt-6">
                <p className="text-sm">
                  <span className="font-medium">Expediente consultado:</span>{' '}
                  {estudianteInfo.nombre_completo}
                  <span className="text-muted-foreground"> · {estudianteInfo.cedula}</span>
                </p>
              </CardContent>
            </Card>
          )}

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">
                  Historial ({registros.length})
                </CardTitle>
              </div>
              {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent>
              {cargando && registros.length === 0 && idEstudiante && (
                <LoadingStatus label="Cargando historial de estados…" className="justify-center py-10" />
              )}

              {!cargando && registros.length === 0 && idEstudiante && (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No hay estados especiales registrados para este estudiante.
                </p>
              )}

              {registros.length > 0 && (
                <ol className="relative border-l-2 border-muted ml-3 space-y-8 pl-8 py-2">
                  {registros.map((r) => (
                    <li key={r.id_estado_periodo} className="relative">
                      <span
                        className={`absolute -left-[2.35rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background ${
                          r.tipo_estado === 'permiso_institucional'
                            ? 'bg-yellow-400'
                            : r.tipo_estado === 'expulsion'
                              ? 'bg-gray-900'
                              : 'bg-red-500'
                        }`}
                      />
                      <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                          <span
                            className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${badgeTipo(r.tipo_estado)}`}
                          >
                            {r.tipo_estado_label}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatPeriodo(r)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {r.motivo || 'Sin motivo registrado.'}
                        </p>
                        <div className="mt-4 pt-3 border-t flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={descargandoId === r.id_estado_periodo}
                            onClick={() => descargarComprobante(r)}
                          >
                            {descargandoId === r.id_estado_periodo ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generando...
                              </>
                            ) : (
                              <>
                                <FileDown className="h-4 w-4 mr-2" />
                                Descargar comprobante
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
