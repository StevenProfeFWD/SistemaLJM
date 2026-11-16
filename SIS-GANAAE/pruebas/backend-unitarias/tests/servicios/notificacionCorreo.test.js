/** Ciclo 13: emailService + notificationService con nodemailer simulado (sin SMTP real) y BD simulada. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as DB from '../helpers/dbMock.js';
import * as NM from '../helpers/stubs/nodemailer.js';
import { enviarCorreo, resetTransporterCache } from '../../../../backend-node/src/services/emailService.js';
import * as NS from '../../../../backend-node/src/services/notificationService.js';

const SMTP = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'SMTP_FROM'];
let bk;
beforeEach(() => {
  bk = Object.fromEntries(SMTP.map((k) => [k, process.env[k]]));
  SMTP.forEach((k) => delete process.env[k]);
  NM.enviados.length = 0;
  NM.transportes.length = 0;
  NM.setFalla(null);
  resetTransporterCache();
  DB.reset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  SMTP.forEach((k) => (bk[k] === undefined ? delete process.env[k] : (process.env[k] = bk[k])));
  vi.restoreAllMocks();
});
const smtp = (extra = {}) => Object.assign(process.env, { SMTP_HOST: 'smtp.prueba.local', SMTP_USER: 'u@x', SMTP_PASS: 'p', ...extra });

describe('emailService.enviarCorreo', () => {
  it('destinatario vacío → no envía', async () => {
    expect(await enviarCorreo('  ', 's', 'h')).toEqual({ enviado: false, motivo: 'Destinatario vacío' });
  });
  it('SMTP no configurado → no envía y advierte', async () => {
    expect(await enviarCorreo('a@x', 's', 'h')).toEqual({ enviado: false, motivo: 'SMTP no configurado' });
    expect(console.warn).toHaveBeenCalled();
    expect(NM.transportes).toHaveLength(0);
  });
  it('configurado: puerto 465 secure, from por defecto = SMTP_USER, transporte cacheado', async () => {
    smtp();
    const r = await enviarCorreo(' a@x ', 'Asunto', '<p>h</p>');
    await enviarCorreo('b@x', 'A2', 'h');
    expect(r).toEqual({ enviado: true, messageId: '<prueba-1@local>' });
    expect(NM.transportes).toHaveLength(1);
    expect(NM.transportes[0]).toMatchObject({ port: 465, secure: true, disableFileAccess: true, disableUrlAccess: true });
    expect(NM.enviados[0]).toMatchObject({ to: 'a@x', subject: 'Asunto', from: '"Benemérito Liceo José Martí" <u@x>' });
  });
  it('puerto 587 → secure false; SMTP_FROM tiene prioridad', async () => {
    smtp({ SMTP_PORT: '587', SMTP_FROM: 'no-reply@liceo.cr' });
    await enviarCorreo('a@x', 's', 'h');
    expect(NM.transportes[0]).toMatchObject({ port: 587, secure: false });
    expect(NM.enviados[0].from).toContain('no-reply@liceo.cr');
  });
  it('error SMTP → enviado=false sin lanzar', async () => {
    smtp();
    NM.setFalla(new Error('ECONNREFUSED'));
    expect(await enviarCorreo('a@x', 's', 'h')).toEqual({ enviado: false, motivo: 'Error de envío SMTP' });
  });
});

describe('notificationService', () => {
  const resolverEnc = ({ estudiante = { nombre_completo: 'Ana' }, encargado = true, fallaInsert = false } = {}) => (q) => {
    if (q.tabla === 'persona' && DB.argsDe(q, 'select').length) return estudiante;
    if (q.tabla === 'matricula as m') return encargado ? { id_persona_tutor: 50 } : undefined;
    if (q.tabla === 'persona') return { id_persona: 50, nombre_completo: 'Mamá', correo: 'mama@x.com' };
    if (q.tabla === 'encargado_estudiante') return { id_encargado_estudiante: 8 };
    if (q.tabla === 'encargado_estudiante as ee') return undefined;
    if (q.tabla === 'notificacion') {
      if (fallaInsert) throw new Error('insert falló');
      return 1;
    }
    return undefined;
  };
  const insertNotif = () => DB.llamadas.find((l) => l.tabla === 'notificacion');

  it('ausencia injustificada: envía correo y registra "enviado"', async () => {
    smtp();
    DB.setResolver(resolverEnc());
    await NS.notificarAusenciaInjustificada({ idAsistencia: 3, idEstudiante: 5, fecha: '2026-11-10', nombreMateria: 'M', nombreSeccion: 'S' });
    expect(NM.enviados[0].subject).toBe('Control de Asistencia: Reporte de ausencia injustificada de Ana el día 10/11/2026');
    expect(DB.argsDe(insertNotif(), 'insert')[0][0]).toMatchObject({ estado_envio: 'enviado', id_asistencia: 3, id_encargado_estudiante: 8, observacion: 'Ausencia injustificada 10/11/2026' });
  });

  it('sin SMTP: registra "fallido" con el motivo', async () => {
    DB.setResolver(resolverEnc());
    await NS.notificarAusenciaInjustificada({ idAsistencia: 3, idEstudiante: 5, fecha: '2026-11-10' });
    expect(DB.argsDe(insertNotif(), 'insert')[0][0]).toMatchObject({ estado_envio: 'fallido', observacion: 'SMTP no configurado' });
  });

  it('estudiante inexistente o sin encargado → no envía ni registra', async () => {
    smtp();
    DB.setResolver(resolverEnc({ estudiante: null }));
    await NS.notificarAusenciaInjustificada({ idEstudiante: 5, fecha: '2026-11-10' });
    DB.setResolver(resolverEnc({ encargado: false }));
    await NS.notificarAusenciaInjustificada({ idEstudiante: 5, fecha: '2026-11-10' });
    expect(NM.enviados).toHaveLength(0);
    expect(insertNotif()).toBeUndefined();
  });

  it('fallo al registrar en BD se captura', async () => {
    smtp();
    DB.setResolver(resolverEnc({ fallaInsert: true }));
    await expect(NS.notificarAusenciaInjustificada({ idEstudiante: 5, fecha: '2026-11-10' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[notificationService] No se pudo registrar en BD:', 'insert falló');
  });

  it.each([
    ['expulsion', 'Orientación: Expulsión definitiva de Ana'],
    ['suspension', 'Orientación: Suspensión registrado para Ana'],
    ['permiso_institucional', 'Orientación: Permiso Institucional registrado para Ana'],
  ])('estado %s → asunto "%s"', async (tipo, asunto) => {
    smtp();
    DB.setResolver(resolverEnc());
    await NS.notificarEstadoOrientacion({ tipo_estado: tipo, id_persona_estudiante: 5, nombre_completo: 'Ana', id_estado_periodo: 4, fecha_inicio: '2026-11-14', fecha_fin: '2026-11-20' });
    expect(NM.enviados[0].subject).toBe(asunto);
    expect(DB.argsDe(insertNotif(), 'insert')[0][0]).toMatchObject({ id_estado_periodo: 4, estado_envio: 'enviado' });
  });

  it('OBSERVACIÓN O-13: asunto "Suspensión registrado" (concordancia de género incorrecta)', async () => {
    smtp();
    DB.setResolver(resolverEnc());
    await NS.notificarEstadoOrientacion({ tipo_estado: 'suspension', id_persona_estudiante: 5, fecha_inicio: '2026-11-14' });
    expect(NM.enviados[0].subject).toBe('Orientación: Suspensión registrado para Estudiante');
  });

  it('tipo desconocido → no hace nada; sin encargado → no envía', async () => {
    DB.setResolver(resolverEnc({ encargado: false }));
    await NS.notificarEstadoOrientacion({ tipo_estado: 'otro' });
    await NS.notificarEstadoOrientacion({ tipo_estado: 'suspension', id_persona_estudiante: 5 });
    expect(NM.enviados).toHaveLength(0);
  });

  it('dispararNotificacionesAusencias: solo "ausente", en segundo plano', async () => {
    smtp();
    DB.setResolver(resolverEnc());
    NS.dispararNotificacionesAusencias({ registros: [{ estado: 'presente' }], fecha: '2026-11-10' });
    NS.dispararNotificacionesAusencias({
      registros: [{ estado: 'ausente', id_asistencia: 1, id_persona_estudiante: 5 }, { estado: 'tardanza' }],
      fecha: '2026-11-10',
    });
    expect(NM.enviados).toHaveLength(0); // aún no (setImmediate)
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));
    expect(NM.enviados).toHaveLength(1);
  });

  it('dispararNotificacionesAusencias: error en el lote se registra', async () => {
    DB.setResolver(() => {
      throw new Error('bd');
    });
    NS.dispararNotificacionesAusencias({ registros: [{ estado: 'ausente', id_persona_estudiante: 5 }], fecha: '2026-11-10' });
    await new Promise((r) => setTimeout(r, 20));
    expect(console.error).toHaveBeenCalledWith('[notificationService] Error en lote de ausencias:', 'bd');
  });
});
