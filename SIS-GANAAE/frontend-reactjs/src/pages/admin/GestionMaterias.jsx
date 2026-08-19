import { useState, useEffect, useMemo, useCallback } from 'react';
import MainBar from '../../components/side-bar/mainBar';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import * as materiasApi from '../../services/materiasServices';
import { emitMateriasCatalogoUpdated } from '../../lib/materiasCatalogEvents';
import { useDialog } from '../../context/DialogContext';

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

const emptyForm = { nombre_materia: '', descripcion: '' };

export default function GestionMaterias() {
  const { confirm } = useDialog();
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const data = await materiasApi.getMaterias();
      setLista(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(e?.error || e?.message || 'No se pudo cargar el catálogo', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((m) => {
      const n = (m.nombre_materia || '').toLowerCase();
      const d = (m.descripcion || '').toLowerCase();
      return n.includes(q) || d.includes(q);
    });
  }, [lista, filtro]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditandoId(null);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre_materia?.trim()) {
      showToast('Indique el nombre de la materia.', 'error');
      return;
    }
    setLoading(true);
    try {
      if (editandoId != null) {
        await materiasApi.putMateria(editandoId, {
          nombre_materia: form.nombre_materia,
          descripcion: form.descripcion || null,
        });
        showToast('Materia actualizada correctamente.');
      } else {
        await materiasApi.postMateria({
          nombre_materia: form.nombre_materia,
          descripcion: form.descripcion || null,
        });
        showToast('Materia creada correctamente.');
      }
      resetForm();
      await cargar();
      emitMateriasCatalogoUpdated();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        'Error al guardar';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const onEditar = (m) => {
    setEditandoId(m.id_materia);
    setForm({
      nombre_materia: m.nombre_materia || '',
      descripcion: m.descripcion || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onEliminar = async (m) => {
    const ok = await confirm({
      title: 'Eliminar materia',
      message: `¿Eliminar la materia «${m.nombre_materia}»? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'destructive',
      icon: 'destructive',
    });
    if (!ok) return;
    setLoading(true);
    try {
      await materiasApi.deleteMateria(m.id_materia);
      showToast('Materia eliminada.');
      if (editandoId === m.id_materia) resetForm();
      await cargar();
      emitMateriasCatalogoUpdated();
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        (status === 409
          ? 'No se puede eliminar: La materia tiene registros vinculados'
          : 'Error al eliminar');
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 space-y-6">
        <Toast toast={toast} onClose={() => setToast(null)} />

        <Card>
          <CardHeader>
            <CardTitle>{editandoId != null ? 'Editar materia' : 'Nueva materia'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              El nombre se normaliza (espacios y mayúsculas). No se permiten duplicados.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={guardar} className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label htmlFor="nombre_materia">Nombre</Label>
                <Input
                  id="nombre_materia"
                  value={form.nombre_materia}
                  onChange={(e) => setForm((f) => ({ ...f, nombre_materia: e.target.value }))}
                  placeholder="Ej. Educación Musical"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción (opcional)</Label>
                <Textarea
                  id="descripcion"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Notas internas o detalle del programa..."
                  rows={4}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Guardando…' : editandoId != null ? 'Actualizar' : 'Crear materia'}
                </Button>
                {editandoId != null && (
                  <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
                    Cancelar edición
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catálogo de materias</CardTitle>
            <div className="pt-2">
              <Input
                placeholder="Buscar por nombre o descripción…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="max-w-md"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Descripción</th>
                    <th className="text-right p-3 font-medium w-40">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((m) => (
                    <tr key={m.id_materia} className="border-t border-border">
                      <td className="p-3 font-medium">{m.nombre_materia}</td>
                      <td className="p-3 text-muted-foreground max-w-md truncate" title={m.descripcion || ''}>
                        {m.descripcion || '—'}
                      </td>
                      <td className="p-3 text-right space-x-2 whitespace-nowrap">
                        <Button type="button" size="sm" variant="outline" onClick={() => onEditar(m)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => onEliminar(m)}
                          disabled={loading}
                        >
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && (
                <p className="p-6 text-center text-muted-foreground text-sm">No hay materias que coincidan.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
