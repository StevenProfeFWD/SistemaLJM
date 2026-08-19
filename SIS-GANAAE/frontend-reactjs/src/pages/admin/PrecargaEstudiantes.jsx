import { useCallback, useEffect, useState } from 'react';
import MainBar from '../../components/side-bar/mainBar';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import servicioMatricula from '../../services/matriculaServices';
import { mapApiError } from '../../lib/errors';
import { AlertTriangle } from 'lucide-react';

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === 'success';
  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border px-4 py-3 shadow-lg ${
        ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{toast.message}</p>
        <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}

export default function PrecargaEstudiantes() {
  const [cursos, setCursos] = useState([]);
  const [idCurso, setIdCurso] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const cargarCursos = useCallback(async () => {
    try {
      const data = await servicioMatricula.getCursosLectivos();
      setCursos(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(mapApiError(e, 'No se pudieron cargar los años lectivos'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    cargarCursos();
  }, [cargarCursos]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    setArchivo(f || null);
    setPreview(null);
  };

  const validarCsv = async () => {
    if (!idCurso) {
      showToast('Seleccione el año lectivo antes de continuar.', 'error');
      return;
    }
    if (!archivo) {
      showToast('Seleccione un archivo .csv', 'error');
      return;
    }
    setLoading(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('id_ciclo_lectivo', String(idCurso));
      fd.append('dry_run', 'true');
      const data = await servicioMatricula.postPrecargaMasiva(fd);
      setPreview(data);
      showToast('Vista previa generada. Revise los totales y errores antes de importar.');
    } catch (e) {
      const d = e?.response?.data || e;
      const msg = mapApiError(e, 'Error al validar el CSV');
      showToast(msg, 'error');
      if (d?.errores_estructura || d?.errores_catalogo) {
        setPreview({
          dry_run: true,
          errores_estructura: d?.errores_estructura || [],
          errores_catalogo: d?.errores_catalogo || [],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const importarCsv = async () => {
    if (!idCurso) {
      showToast('Seleccione el año lectivo.', 'error');
      return;
    }
    if (!archivo) {
      showToast('Seleccione un archivo .csv', 'error');
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('id_ciclo_lectivo', String(idCurso));
      fd.append('dry_run', 'false');
      const data = await servicioMatricula.postPrecargaMasiva(fd);
      showToast(data?.message || 'Importación completada', 'success');
      setPreview(null);
      setArchivo(null);
    } catch (e) {
      showToast(mapApiError(e, 'Error al importar'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Precarga masiva de estudiantes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cargue un CSV para crear o actualizar personas y matrículas en estado pendiente para el año
                lectivo elegido. Encabezados: Cédula, Primer apellido, Segundo apellido, Nombre, Sección,
                fecha_nacimiento. Separador automático: coma (,) o punto y coma (;). La sección (ej. 8-2) debe existir en el catálogo.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="curso">Año lectivo (obligatorio)</Label>
                <Select
                  id="curso"
                  value={idCurso}
                  onChange={(e) => {
                    setIdCurso(e.target.value);
                    setPreview(null);
                  }}
                  className="max-w-md"
                >
                  <option value="">Seleccione…</option>
                  {cursos.map((c) => (
                    <option key={c.id_curso_lectivo} value={String(c.id_curso_lectivo)}>
                      {c.anio_curso_lectivo}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv">Archivo CSV</Label>
                <Input
                  id="csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFile}
                  disabled={!idCurso}
                  className="max-w-md cursor-pointer"
                />
                {!idCurso && (
                  <p className="text-xs text-muted-foreground">Seleccione primero el año lectivo para habilitar la carga.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={validarCsv}
                  disabled={loading || !idCurso || !archivo}
                  className="bg-slate-100 border border-slate-300 text-slate-900 font-medium shadow-xs hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-slate-900/20 disabled:cursor-not-allowed"
                >
                  {loading ? 'Procesando…' : 'Pre-validar CSV'}
                </Button>
                <Button type="button" onClick={importarCsv} disabled={loading || !idCurso || !archivo}>
                  {loading ? 'Procesando…' : 'Importar a la base de datos'}
                </Button>
              </div>

              {preview && (
                <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                  <h3 className="font-semibold">Resultado de la pre-validación</h3>
                  {preview.dry_run && (
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        <span className="font-medium text-foreground">Nuevas personas estimadas:</span>{' '}
                        {preview.estimacion_nuevas_personas ?? 0}
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Actualizaciones de persona estimadas:</span>{' '}
                        {preview.estimacion_actualizaciones_persona ?? 0}
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Filas de datos en el archivo:</span>{' '}
                        {preview.total_filas_datos ?? '—'}
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Filas con estructura válida:</span>{' '}
                        {preview.filas_validas_estructura ?? '—'}
                      </li>
                    </ul>
                  )}
                  {(preview.advertencias_cupo?.length > 0 || preview.filas_excedentes_cupo?.length > 0) && (
                    <Alert className="border-amber-500/40 bg-amber-500/10" role="status">
                      <AlertDescription className="text-sm text-amber-950">
                        <div className="flex gap-2 items-start mb-2">
                          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                          <p className="font-medium">
                            Advertencias de cupo por sección (máximo {preview.cupo_maximo_por_seccion ?? 25} estudiantes
                            activos). Las matrículas pendientes importadas podrían no activarse en la sección indicada.
                          </p>
                        </div>
                        {preview.advertencias_cupo?.length > 0 && (
                          <ul className="list-inside list-disc space-y-1 mb-3 max-h-40 overflow-y-auto">
                            {preview.advertencias_cupo.map((adv, i) => (
                              <li key={`adv-${i}`}>{adv.mensaje}</li>
                            ))}
                          </ul>
                        )}
                        {preview.filas_excedentes_cupo?.length > 0 && (
                          <>
                            <p className="font-medium mb-1">Filas que excederían el cupo al activarse:</p>
                            <ul className="list-inside list-disc space-y-1 max-h-48 overflow-y-auto">
                              {preview.filas_excedentes_cupo.map((fila, i) => (
                                <li key={`exc-${i}`}>
                                  Línea {fila.linea} ({fila.seccion}): {fila.motivo}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  {(preview.errores_estructura?.length > 0 || preview.errores_catalogo?.length > 0) && (
                    <Alert className="border-amber-500/30 bg-amber-500/5">
                      <AlertDescription className="text-sm text-amber-950">
                        <p className="font-medium mb-2">Errores detectados (debe corregir el CSV antes de importar):</p>
                        <ul className="list-inside list-disc space-y-1 max-h-48 overflow-y-auto">
                          {[...(preview.errores_estructura || []), ...(preview.errores_catalogo || [])].map((err, i) => (
                            <li key={i}>
                              Línea {err.linea}: {err.error}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <Alert>
                <AlertDescription className="text-sm">
                  La importación se ejecuta en una sola transacción en el servidor. Si el CSV tiene errores de
                  estructura o de catálogo (sección inexistente), deberá corregirlos antes de que la importación
                  completa sea aceptada.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </main>
    </div>
  );
}
