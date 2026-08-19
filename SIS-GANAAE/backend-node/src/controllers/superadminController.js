import {
  listarAdministradores,
  crearAdministrador,
  actualizarAdministrador,
  setAdministradorActivo,
} from '../services/superadminService.js';

export async function getAdministradores(req, res) {
  try {
    const lista = await listarAdministradores();
    return res.json({ total: lista.length, administradores: lista });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al listar administradores' });
  }
}

export async function postAdministrador(req, res) {
  try {
    const result = await crearAdministrador(req.body);
    return res.status(201).json(result);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al crear administrador' });
  }
}

export async function putAdministrador(req, res) {
  try {
    const result = await actualizarAdministrador(req.params.id, req.body);
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al actualizar administrador' });
  }
}

export async function patchAdministradorActivo(req, res) {
  try {
    const activo = req.body.activo !== false && req.body.activo !== 'false';
    const result = await setAdministradorActivo(req.params.id, activo);
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Error al cambiar estado de la cuenta' });
  }
}
