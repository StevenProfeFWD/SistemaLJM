import db from '../db/knex.js';
import {
  listarPersonal,
  actualizarPersonal,
  cambiarEstadoPersonal,
  registrarSustitucion,
  listarCandidatosSustituto,
  listarSustituciones,
  cancelarSustitucion,
  obtenerSustitucionVigenteComoSustituto,
} from '../services/personalService.js';
import { pipeReporteSustitucionesPdf } from '../services/pdfService.js';
import AppError from '../utils/AppError.js';
import { esAdministradorOperativo } from '../utils/roles.js';

function assertAdmin(req) {
  if (!esAdministradorOperativo(req.user?.rol)) {
    throw new AppError('Solo los administradores pueden gestionar el personal', 403);
  }
}

export async function getPersonal(req, res) {
  assertAdmin(req);
  const lista = await listarPersonal();
  return res.json({ total: lista.length, personal: lista });
}

export async function putPersonal(req, res) {
  assertAdmin(req);
  const result = await actualizarPersonal(req.params.id, req.body);
  return res.json(result);
}

export async function patchEstadoPersonal(req, res) {
  assertAdmin(req);
  const activo = req.body.activo !== false && req.body.activo !== 'false';
  const result = await cambiarEstadoPersonal(req.params.id, activo);
  return res.json(result);
}

export async function postSustitucionPersonal(req, res) {
  assertAdmin(req);
  const result = await registrarSustitucion(req.body);
  return res.status(201).json(result);
}

export async function getCandidatosSustituto(req, res) {
  assertAdmin(req);
  const result = await listarCandidatosSustituto(req.params.id);
  return res.json(result);
}

export async function getSustituciones(req, res) {
  assertAdmin(req);
  const result = await listarSustituciones({ idPersona: req.query.id_persona });
  return res.json(result);
}

export async function getSustitucionesPdf(req, res) {
  assertAdmin(req);
  const idPersona = req.query.id_persona || null;
  const data = await listarSustituciones({ idPersona });

  let tituloFiltro = null;
  if (idPersona) {
    const id = parseInt(idPersona, 10);
    if (Number.isInteger(id)) {
      const p = await db('persona').where('id_persona', id).first();
      tituloFiltro = p?.nombre_completo || `ID ${id}`;
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  const slug = idPersona ? `profesor_${idPersona}` : 'todas';
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="reporte_sustituciones_${slug}_${data.anio_lectivo}.pdf"`
  );

  await pipeReporteSustitucionesPdf(res, {
    anioLectivo: data.anio_lectivo,
    sustituciones: data.sustituciones,
    filtroPersona: tituloFiltro,
  });
}

export async function patchCancelarSustitucion(req, res) {
  assertAdmin(req);
  const result = await cancelarSustitucion(req.params.id);
  return res.json(result);
}

export async function getMiSustitucionVigente(req, res) {
  if (req.user?.rol !== 'profesor') {
    throw new AppError('Solo docentes pueden consultar sustituciones vigentes', 403);
  }
  const sustitucion = await obtenerSustitucionVigenteComoSustituto(req.user.id);
  return res.json({ sustitucion });
}
