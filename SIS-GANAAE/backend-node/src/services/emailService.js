import nodemailer from 'nodemailer';

let transporterCache = null;

function smtpConfigurado() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function crearTransporter() {
  if (transporterCache) return transporterCache;

  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;

  transporterCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Mitiga CVEs de acceso a archivos/URL vía opciones de mensaje
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return transporterCache;
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} htmlTemplate
 * @returns {Promise<{ enviado: boolean, messageId?: string, motivo?: string }>}
 */
export async function enviarCorreo(to, subject, htmlTemplate) {
  const destino = String(to || '').trim();
  if (!destino) {
    return { enviado: false, motivo: 'Destinatario vacío' };
  }

  if (!smtpConfigurado()) {
    console.warn(
      `[emailService] SMTP no configurado. Correo no enviado a ${destino}: ${subject}`
    );
    return { enviado: false, motivo: 'SMTP no configurado' };
  }

  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    'noreply@liceomarti.ed.cr';

  try {
    const transporter = crearTransporter();
    const info = await transporter.sendMail({
      from: `"Benemérito Liceo José Martí" <${from}>`,
      to: destino,
      subject,
      html: htmlTemplate,
    });

    return { enviado: true, messageId: info.messageId };
  } catch (error) {
    console.error('[emailService] Error al enviar correo:', error.message);
    return { enviado: false, motivo: 'Error de envío SMTP' };
  }
}

export function resetTransporterCache() {
  transporterCache = null;
}
