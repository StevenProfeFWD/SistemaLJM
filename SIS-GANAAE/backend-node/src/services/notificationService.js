import db from '../db/knex.js';
import { enviarCorreo } from './emailService.js';
import { obtenerEncargadoParaNotificacion } from '../utils/encargadoLookup.js';
import {
  plantillaAusenciaInjustificada,
  plantillaEstadoOrientacion,
  plantillaExpulsionOrientacion,
} from '../utils/emailTemplates.js';
import { TIPO_ESTADO_LABEL } from './orientacionService.js';

function formatFechaAsunto(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

async function registrarNotificacion({
  idEncargadoEstudiante,
  idAsistencia,
  idEstadoPeriodo,
  estadoEnvio,
  observacion,
}) {
  if (!idEncargadoEstudiante) return;

  try {
    const payload = {
      medio_comunicacion: 'correo_electronico',
      fecha_envio: new Date(),
      estado_envio: estadoEnvio,
      observacion: (observacion || '').slice(0, 255),
      id_encargado_estudiante: idEncargadoEstudiante,
    };

    if (idAsistencia != null) {
      payload.id_asistencia = idAsistencia;
    }
    if (idEstadoPeriodo != null) {
      payload.id_estado_periodo = idEstadoPeriodo;
    }

    await db('notificacion').insert(payload);
  } catch (err) {
    console.error('[notificationService] No se pudo registrar en BD:', err.message);
  }
}

/**
 * Dispara correo por ausencia injustificada (estado = ausente).
 */
export async function notificarAusenciaInjustificada({
  idAsistencia,
  idEstudiante,
  fecha,
  nombreMateria,
  nombreSeccion,
}) {
  const estudiante = await db('persona')
    .where('id_persona', idEstudiante)
    .select('nombre_completo')
    .first();

  if (!estudiante) return;

  const encargado = await obtenerEncargadoParaNotificacion(idEstudiante);
  if (!encargado) {
    console.info(
      `[notificationService] Sin encargado notificable para estudiante ${idEstudiante}`
    );
    return;
  }

  const subject = `Control de Asistencia: Reporte de ausencia injustificada de ${estudiante.nombre_completo} el día ${formatFechaAsunto(fecha)}`;

  const html = plantillaAusenciaInjustificada({
    nombreEncargado: encargado.nombre_completo,
    nombreEstudiante: estudiante.nombre_completo,
    fecha,
    nombreMateria,
    nombreSeccion,
  });

  const resultado = await enviarCorreo(encargado.correo, subject, html);

  await registrarNotificacion({
    idEncargadoEstudiante: encargado.id_encargado_estudiante,
    idAsistencia,
    estadoEnvio: resultado.enviado ? 'enviado' : 'fallido',
    observacion: resultado.enviado
      ? `Ausencia injustificada ${formatFechaAsunto(fecha)}`
      : resultado.motivo || 'Error de envío',
  });
}

/**
 * Dispara correo al registrar suspensión, permiso institucional o expulsión definitiva.
 */
export async function notificarEstadoOrientacion(registro) {
  const tipo = String(registro.tipo_estado || '');
  if (!['suspension', 'permiso_institucional', 'expulsion'].includes(tipo)) return;

  const encargado = await obtenerEncargadoParaNotificacion(registro.id_persona_estudiante);
  if (!encargado) {
    console.info(
      `[notificationService] Sin encargado notificable para estudiante ${registro.id_persona_estudiante} (${tipo})`
    );
    return;
  }

  const tipoLabel = TIPO_ESTADO_LABEL[tipo] || tipo;
  const nombreEstudiante = registro.nombre_completo || 'Estudiante';

  const subject =
    tipo === 'expulsion'
      ? `Orientación: Expulsión definitiva de ${nombreEstudiante}`
      : `Orientación: ${tipoLabel} registrado para ${nombreEstudiante}`;

  const html =
    tipo === 'expulsion'
      ? plantillaExpulsionOrientacion({
          nombreEncargado: encargado.nombre_completo,
          nombreEstudiante,
          fechaInicio: registro.fecha_inicio,
          motivo: registro.motivo,
        })
      : plantillaEstadoOrientacion({
          nombreEncargado: encargado.nombre_completo,
          nombreEstudiante,
          tipoEstadoLabel: tipoLabel,
          fechaInicio: registro.fecha_inicio,
          fechaFin: registro.fecha_fin,
          motivo: registro.motivo,
        });

  const resultado = await enviarCorreo(encargado.correo, subject, html);

  await registrarNotificacion({
    idEncargadoEstudiante: encargado.id_encargado_estudiante,
    idEstadoPeriodo: registro.id_estado_periodo,
    estadoEnvio: resultado.enviado ? 'enviado' : 'fallido',
    observacion: resultado.enviado
      ? `${tipoLabel} — ${formatFechaAsunto(registro.fecha_inicio)}`
      : resultado.motivo || 'Error de envío',
  });
}

/**
 * Procesa en segundo plano las ausencias injustificadas de un lote de asistencia.
 */
export function dispararNotificacionesAusencias({
  registros,
  fecha,
  nombreMateria,
  nombreSeccion,
}) {
  const ausentes = registros.filter((r) => r.estado === 'ausente');
  if (ausentes.length === 0) return;

  setImmediate(() => {
    Promise.all(
      ausentes.map((r) =>
        notificarAusenciaInjustificada({
          idAsistencia: r.id_asistencia,
          idEstudiante: r.id_persona_estudiante,
          fecha,
          nombreMateria,
          nombreSeccion,
        })
      )
    ).catch((err) => {
      console.error('[notificationService] Error en lote de ausencias:', err.message);
    });
  });
}
