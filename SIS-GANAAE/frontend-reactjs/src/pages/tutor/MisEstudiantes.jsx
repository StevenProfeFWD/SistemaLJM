import { useState, useEffect } from 'react';
import MainBar from '../../components/side-bar/mainBar';
import servicio from '../../services/asignacionAsistenciaServices';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import LoadingStatus from '../../components/ui/LoadingStatus';
import { useDialog } from '../../context/DialogContext';

export default function MisEstudiantes() {
  const { alert } = useDialog();
  const [estudiantes, setEstudiantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [descargandoId, setDescargandoId] = useState(null);

  useEffect(() => {
    servicio
      .getMisEstudiantes()
      .then(setEstudiantes)
      .catch(() => setEstudiantes([]))
      .finally(() => setLoading(false));
  }, []);

  const descargarComprobante = async (idMatricula) => {
    try {
      setDescargandoId(idMatricula);
      const blob = await servicio.descargarComprobanteMatricula(idMatricula);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante_matricula_${idMatricula}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      await alert('No fue posible descargar el comprobante de matrícula.', {
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
        <Card>
          <CardHeader>
            <CardTitle>Mis estudiantes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Estudiantes a su cargo. Aquí puede ver la información de matrícula de cada uno.
            </p>
          </CardHeader>
          <CardContent>
            {loading && <LoadingStatus label="Cargando estudiantes…" />}
            {!loading && estudiantes.length === 0 && (
              <p className="text-muted-foreground">No tiene estudiantes visibles como tutor del curso lectivo vigente ni por vínculo histórico de encargado.</p>
            )}
            {!loading && estudiantes.length > 0 && (
              <ul className="space-y-4">
                {estudiantes.map((e) => (
                  <li key={e.id_persona} className="border rounded p-4">
                    <p className="font-medium">{e.nombre_completo}</p>
                    <p className="text-sm text-muted-foreground">Cédula: {e.cedula} — Correo: {e.correo || '-'}</p>
                    {Array.isArray(e.matriculas) && e.matriculas.length > 0 && (
                      <ul className="mt-2 text-sm">
                        {e.matriculas.map((m) => (
                          <li key={m.id_matricula} className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <span>
                              Año {m.anio_curso_lectivo} — {m.ano_a_cursar} — Sección {m.nombre_seccion || '-'} — Estado: {m.estado}
                            </span>
                            <button
                              onClick={() => descargarComprobante(m.id_matricula)}
                              disabled={descargandoId === m.id_matricula}
                              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                            >
                              {descargandoId === m.id_matricula ? 'Descargando...' : 'Descargar comprobante'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
