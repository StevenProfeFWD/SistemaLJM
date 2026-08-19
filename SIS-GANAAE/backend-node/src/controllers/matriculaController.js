import * as matriculaService from '../services/matriculaService.js';
import * as haciendaService from '../services/haciendaService.js';
import { pipeComprobanteMatriculaPdf } from '../services/pdfService.js';
import AppError from '../utils/AppError.js';
import { ROL_PROFESOR } from '../utils/roles.js';
import {
  assertPuedeBuscarEstudiantePorCedula,
  assertPuedeConsultarEstudianteMatricula,
  assertPuedeConsultarMatriculaPorId,
  assertPuedeListarMatriculas,
  assertPadrePuedeBuscarCedulaEstudiante,
  tieneLecturaGlobalMatricula,
} from '../utils/matriculaVisibilidad.js';

/** Re-export por si algún módulo importaba HORARIO_REFERENCIA desde el controlador */
export { HORARIO_REFERENCIA } from '../services/matriculaService.js';

export async function consultarIdentificacion(req, res) {
  if (!tieneLecturaGlobalMatricula(req.user?.rol)) {
    throw new AppError('No autorizado para consultar identificación', 403);
  }
  const result = await haciendaService.consultarIdentificacion(req.params.identificacion);
  return res.json(result);
}

export async function getMatriculas(req, res) {
  await assertPuedeListarMatriculas(req.user);

  const { rol, id } = req.user;
  let matriculas;
  if (tieneLecturaGlobalMatricula(rol)) {
    matriculas = await matriculaService.listMatriculas();
  } else if (rol === 'padre_de_familia') {
    matriculas = await matriculaService.listMatriculasPorEncargado(id);
  } else if (rol === ROL_PROFESOR) {
    matriculas = await matriculaService.listMatriculasPorProfesor(id);
  } else {
    throw new AppError('No autorizado para listar matrículas', 403);
  }

  return res.json(matriculas);
}

export async function getMatriculaById(req, res) {
  await assertPuedeConsultarMatriculaPorId(req.user, req.params.id);
  const matricula = await matriculaService.getMatriculaById(req.params.id);
  if (!matricula) {
    return res.status(404).json({ error: 'Matrícula no encontrada' });
  }
  return res.json(matricula);
}

export async function getMatriculasPorEstudiante(req, res) {
  await assertPuedeConsultarEstudianteMatricula(req.user, req.params.idEstudiante);
  const matriculas = await matriculaService.listMatriculasPorEstudiante(req.params.idEstudiante);
  return res.json(matriculas);
}

export async function buscarEstudiantePorCedula(req, res) {
  await assertPuedeBuscarEstudiantePorCedula(req.user);

  const raw = req.params.cedula != null ? decodeURIComponent(String(req.params.cedula)) : '';
  const data = await matriculaService.buscarEstudiantePorCedula(raw);

  if (req.user.rol === 'padre_de_familia') {
    await assertPadrePuedeBuscarCedulaEstudiante(req.user, data?.estudiante?.id_persona);
  }

  return res.json(data);
}

export async function getCursosLectivos(req, res) {
  const rows = await matriculaService.listCursosLectivos();
  return res.json(rows);
}

export async function postPrecargaMasiva(req, res) {
  const fileBuf = req.file?.buffer;
  if (!fileBuf || fileBuf.length === 0) {
    return res.status(400).json({ error: 'Archivo CSV requerido (campo archivo)' });
  }
  const idRaw = req.body?.id_ciclo_lectivo ?? req.body?.id_curso_lectivo;
  const idCursoLectivo = parseInt(String(idRaw), 10);
  if (!Number.isFinite(idCursoLectivo) || idCursoLectivo < 1) {
    return res.status(400).json({ error: 'id_ciclo_lectivo o id_curso_lectivo es obligatorio' });
  }
  const dryRun = req.body?.dry_run === 'true' || req.body?.dry_run === true;
  const result = await matriculaService.precargaMasivaEstudiantes({
    idCursoLectivo,
    csvBuffer: fileBuf,
    dryRun,
  });
  if (dryRun) {
    return res.json(result);
  }
  return res.status(201).json(result);
}

export async function buscarTutorParaMatriculaRegular(req, res) {
  const data = await matriculaService.buscarEncargadoPorCedulaParaMatricula(req.params.cedula);
  return res.json(data);
}

export async function crearMatriculaNuevoIngreso(req, res) {
  const result = await matriculaService.crearNuevoIngreso(req.body);
  return res.status(201).json(result);
}

export async function crearMatriculaRegular(req, res) {
  const result = await matriculaService.crearMatriculaRegular(req.body);
  return res.status(201).json(result);
}

export async function crearMatriculaTraslado(req, res) {
  const result = await matriculaService.crearMatriculaTraslado(req.body);
  return res.status(201).json(result);
}

export async function patchMatriculaEstado(req, res) {
  const result = await matriculaService.updateEstadoMatricula(req.params.id, req.body.estado);
  return res.json(result);
}

export async function getComprobanteMatriculaPdf(req, res) {
  await assertPuedeConsultarMatriculaPorId(req.user, req.params.id);

  const { matricula, tutor } = await matriculaService.getDatosComprobanteMatricula(
    req.params.id,
    req.user
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=comprobante_matricula_${matricula.id_matricula}.pdf`
  );

  await pipeComprobanteMatriculaPdf(res, { matricula, tutor });
}
