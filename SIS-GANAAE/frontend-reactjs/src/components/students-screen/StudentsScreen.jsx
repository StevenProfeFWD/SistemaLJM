import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Eye, X, RotateCcw, Archive } from 'lucide-react';
import servicio from '../../services/personaServices';
import ModalEditarEstudiante from './ModalEditarEstudiante';
import { useDialog } from '../../context/DialogContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import LoadingStatus from '../ui/LoadingStatus';

function StudentsScreen({ soloLectura = false }) {
  const { confirm, toast } = useDialog();
  const location = useLocation();
  const [estudiantes, setEstudiantes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [verArchivados, setVerArchivados] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [editando, setEditando] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargarEstudiantes = useCallback(
    async (search = '', archivados = verArchivados) => {
      setLoading(true);
      try {
        const params = { q: search };
        if (archivados) {
          params.estado = 'archivado';
        }
        const res = await servicio.getEstudiantes(params);
        setEstudiantes(Array.isArray(res) ? res : []);
      } catch (err) {
        setStatus({
          type: 'error',
          message: err?.error || err?.message || 'Error al cargar estudiantes',
        });
      } finally {
        setLoading(false);
      }
    },
    [verArchivados]
  );

  useEffect(() => {
    cargarEstudiantes('', verArchivados);
  }, [verArchivados, cargarEstudiantes]);

  const listaOrdenada = useMemo(
    () =>
      [...estudiantes].sort((a, b) =>
        (a.nombre_completo || '').localeCompare(b.nombre_completo || '')
      ),
    [estudiantes]
  );

  const abrirEditar = (e) => {
    setEditando(e);
    setStatus({ type: '', message: '' });
  };

  const abrirVisualizar = async (id) => {
    setLoadingDetalle(true);
    try {
      const detalle = await servicio.getEstudianteDetalle(id);
      setViewing(detalle);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err?.error || err?.message || 'Error al obtener detalle del estudiante',
      });
    } finally {
      setLoadingDetalle(false);
    }
  };

  useEffect(() => {
    const idPerfil = location.state?.verPerfilId;
    if (idPerfil) {
      abrirVisualizar(idPerfil);
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.verPerfilId]);

  const confirmarArchivar = async (estudiante) => {
    const ok = await confirm({
      title: '¿Está seguro de archivar a este estudiante?',
      message: `El estudiante «${estudiante.nombre_completo}» será retirado de las listas de asistencia activas y de los procesos ordinarios del ciclo lectivo. Podrá consultar su historial o reactivarlo desde la sección de «Archivados».`,
      confirmLabel: 'Sí, archivar',
      cancelLabel: 'Cancelar',
      variant: 'destructive',
      icon: 'destructive',
    });
    if (!ok) return;

    try {
      await servicio.archiveEstudiante(estudiante.id_persona, false);
      toast('Estudiante archivado correctamente.', 'success');
      await cargarEstudiantes(query, verArchivados);
    } catch (err) {
      toast(err?.error || err?.message || 'Error al archivar', 'error');
    }
  };

  const confirmarReactivar = async (estudiante) => {
    const ok = await confirm({
      title: '¿Desea reactivar a este estudiante?',
      message: `«${estudiante.nombre_completo}» volverá a aparecer en las listas de control ordinarias del liceo.`,
      confirmLabel: 'Reactivar',
      cancelLabel: 'Cancelar',
      variant: 'success',
      icon: 'success',
    });
    if (!ok) return;

    try {
      await servicio.reactivarEstudiante(estudiante.id_persona);
      toast('Estudiante reactivado correctamente.', 'success');
      await cargarEstudiantes(query, true);
    } catch (err) {
      toast(err?.error || err?.message || 'Error al reactivar', 'error');
    }
  };

  const cambiarVista = (archivados) => {
    setVerArchivados(archivados);
    setQuery('');
    setStatus({ type: '', message: '' });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Gestión de Estudiantes</h2>
            <p className="text-sm text-gray-500 mt-1">
              {soloLectura
                ? 'Consulta del catálogo de alumnos matriculados (solo lectura).'
                : verArchivados
                  ? 'Expedientes archivados: consulta de auditoría y reactivación.'
                  : 'Listado alfabético con tutor y sección actual.'}
            </p>
          </div>
          <div className="flex rounded-lg border p-1 bg-muted/30">
            <button
              type="button"
              onClick={() => cambiarVista(false)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                !verArchivados
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => cambiarVista(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                verArchivados
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              Archivados
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o cédula..."
        />
        <button
          onClick={() => cargarEstudiantes(query, verArchivados)}
          className="rounded-md bg-slate-900 px-4 py-2 text-white text-sm shrink-0"
        >
          Buscar
        </button>
      </div>

      {status.message && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            status.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="rounded-xl border bg-white p-2 shadow-sm overflow-auto">
        <table className="min-w-full text-sm">
          <caption className="sr-only">
            {verArchivados
              ? 'Listado de estudiantes archivados con tutor y acciones'
              : 'Listado de estudiantes activos con sección, tutor y acciones'}
          </caption>
          <thead>
            <tr className="text-left border-b">
              <th scope="col" className="p-3">Nombre completo</th>
              <th scope="col" className="p-3">Cédula / DIMEX</th>
              <th scope="col" className="p-3">Sección actual</th>
              <th scope="col" className="p-3">Tutor</th>
              {verArchivados && <th scope="col" className="p-3">Estado</th>}
              <th scope="col" className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3" colSpan={verArchivados ? 6 : 5}>
                  <LoadingStatus label="Cargando estudiantes…" />
                </td>
              </tr>
            ) : listaOrdenada.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={verArchivados ? 6 : 5}>
                  {verArchivados
                    ? 'No hay estudiantes archivados.'
                    : 'No hay resultados.'}
                </td>
              </tr>
            ) : (
              listaOrdenada.map((e) => (
                <tr key={e.id_persona} className="border-b last:border-b-0">
                  <td className="p-3">{e.nombre_completo}</td>
                  <td className="p-3">{e.cedula}</td>
                  <td className="p-3">{e.seccion_actual || 'Sin sección'}</td>
                  <td className="p-3">
                    {e.tutor?.nombre_completo ? (
                      e.tutor.nombre_completo
                    ) : (
                      <span className="text-amber-900 text-xs font-semibold">Sin tutor</span>
                    )}
                  </td>
                  {verArchivados && (
                    <td className="p-3">
                      <span className="inline-block rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                        Archivado
                      </span>
                    </td>
                  )}
                  <td className="p-3 flex flex-wrap gap-2 items-center">
                    <button
                      onClick={() => abrirVisualizar(e.id_persona)}
                      className="rounded-md border px-2 py-1 inline-flex items-center gap-1"
                      title="Visualizar detalle"
                    >
                      <Eye className="h-4 w-4" />
                      <span>Visualizar</span>
                    </button>
                    {!soloLectura && !verArchivados && (
                      <>
                        <button
                          onClick={() => abrirEditar(e)}
                          className="rounded-md border px-3 py-1"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => confirmarArchivar(e)}
                          className="rounded-md border border-red-200 text-red-700 px-3 py-1"
                        >
                          Archivar
                        </button>
                      </>
                    )}
                    {!soloLectura && verArchivados && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inline-flex items-center gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => confirmarReactivar(e)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reactivar
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <ModalEditarEstudiante
          estudiante={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => cargarEstudiantes(query, verArchivados)}
        />
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-estudiante-titulo"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setViewing(null);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 id="detalle-estudiante-titulo" className="text-lg font-semibold">
                Detalle del estudiante
              </h3>
              <button
                onClick={() => setViewing(null)}
                className="rounded-md border p-1"
                type="button"
                aria-label="Cerrar detalle del estudiante"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium">Nombre:</span> {viewing.nombre_completo}
              </div>
              <div>
                <span className="font-medium">Cédula/DIMEX:</span> {viewing.cedula}
              </div>
              <div>
                <span className="font-medium">Correo:</span> {viewing.correo || '-'}
              </div>
              <div>
                <span className="font-medium">Teléfono:</span> {viewing.telefono || '-'}
              </div>
              <div className="md:col-span-2">
                <span className="font-medium">Dirección:</span> {viewing.direccion || '-'}
              </div>
              <div>
                <span className="font-medium">Fecha nacimiento:</span>{' '}
                {viewing.fecha_nacimiento
                  ? String(viewing.fecha_nacimiento).slice(0, 10)
                  : '-'}
              </div>
              <div>
                <span className="font-medium">Estado:</span>{' '}
                {viewing.activo ? 'Activo' : 'Archivado'}
              </div>
            </div>
            <div className="p-4 border-t">
              <h4 className="font-semibold mb-2">Tutor vinculado</h4>
              {viewing.tutor ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="font-medium">Nombre:</span> {viewing.tutor.nombre_completo}
                  </div>
                  <div>
                    <span className="font-medium">Cédula:</span> {viewing.tutor.cedula}
                  </div>
                  <div>
                    <span className="font-medium">Teléfono:</span> {viewing.tutor.telefono || '-'}
                  </div>
                  <div>
                    <span className="font-medium">Parentesco:</span>{' '}
                    {viewing.tutor.parentesco || '-'}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-900 font-semibold">Sin tutor registrado.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {loadingDetalle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <LoadingStatus label="Cargando detalle del estudiante…" className="rounded-lg border bg-background px-4 py-3 shadow-md" />
        </div>
      )}
    </div>
  );
}

export default StudentsScreen;
