function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatFechaCr(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function layoutInstitucional({ tituloBanner, cuerpoHtml, pieExtra = '' }) {
  const titulo = escapeHtml(tituloBanner);
  const pie = pieExtra ? escapeHtml(pieExtra) : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#bfdbfe;">Notificación Oficial</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">Benemérito Liceo José Martí</h1>
              <p style="margin:10px 0 0;font-size:14px;color:#dbeafe;">${titulo}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.65;">
              ${cuerpoHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
                Este mensaje fue generado automáticamente por el Sistema de Asistencias Estudiantiles.
                No responda a este correo. Para consultas, comuníquese con la institución.
                ${pie ? `<br/><span style="color:#94a3b8;">${pie}</span>` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function plantillaAusenciaInjustificada({
  nombreEncargado,
  nombreEstudiante,
  fecha,
  nombreMateria,
  nombreSeccion,
}) {
  const cuerpo = `
    <p style="margin:0 0 16px;">Estimado(a) <strong>${escapeHtml(nombreEncargado)}</strong>:</p>
    <p style="margin:0 0 20px;">
      Le informamos que se registró una <strong style="color:#b91c1c;">ausencia injustificada</strong>
      de su representado(a) en el control de asistencia institucional.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#991b1b;text-transform:uppercase;letter-spacing:0.05em;">Detalle del evento</p>
          <p style="margin:0 0 6px;"><strong>Estudiante:</strong> ${escapeHtml(nombreEstudiante)}</p>
          <p style="margin:0 0 6px;"><strong>Fecha:</strong> ${escapeHtml(formatFechaCr(fecha))}</p>
          <p style="margin:0 0 6px;"><strong>Materia:</strong> ${escapeHtml(nombreMateria || '—')}</p>
          <p style="margin:0;"><strong>Sección:</strong> ${escapeHtml(nombreSeccion || '—')}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#475569;font-size:14px;">
      Puede consultar el expediente completo de asistencia ingresando al portal de padres de familia del sistema.
    </p>
  `;

  return layoutInstitucional({
    tituloBanner: 'Control de Asistencia',
    cuerpoHtml: cuerpo,
  });
}

export function plantillaEstadoOrientacion({
  nombreEncargado,
  nombreEstudiante,
  tipoEstadoLabel,
  fechaInicio,
  fechaFin,
  motivo,
}) {
  const periodo = fechaFin
    ? `${formatFechaCr(fechaInicio)} al ${formatFechaCr(fechaFin)}`
    : `${formatFechaCr(fechaInicio)} — vigencia según resolución institucional`;

  const motivoSafe = escapeHtml(motivo || 'Sin detalle adicional registrado.').replace(/\n/g, '<br/>');

  const cuerpo = `
    <p style="margin:0 0 16px;">Estimado(a) <strong>${escapeHtml(nombreEncargado)}</strong>:</p>
    <p style="margin:0 0 20px;">
      El Departamento de Orientación y Convivencia ha registrado un estado especial
      vinculado a su representado(a).
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em;">Registro de orientación</p>
          <p style="margin:0 0 6px;"><strong>Estudiante:</strong> ${escapeHtml(nombreEstudiante)}</p>
          <p style="margin:0 0 6px;"><strong>Tipo:</strong> ${escapeHtml(tipoEstadoLabel)}</p>
          <p style="margin:0 0 6px;"><strong>Periodo:</strong> ${escapeHtml(periodo)}</p>
          <p style="margin:0;"><strong>Motivo / justificación:</strong><br/>${motivoSafe}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#475569;font-size:14px;">
      El comprobante oficial puede descargarse desde el panel de padres de familia en el sistema.
    </p>
  `;

  return layoutInstitucional({
    tituloBanner: 'Departamento de Orientación',
    cuerpoHtml: cuerpo,
  });
}

export function plantillaExpulsionOrientacion({
  nombreEncargado,
  nombreEstudiante,
  fechaInicio,
  motivo,
}) {
  const motivoSafe = escapeHtml(motivo || 'Sin detalle adicional registrado.').replace(/\n/g, '<br/>');

  const cuerpo = `
    <p style="margin:0 0 16px;">Estimado(a) <strong>${escapeHtml(nombreEncargado)}</strong>:</p>
    <p style="margin:0 0 20px;">
      Le informamos que el Departamento de Orientación y Convivencia ha registrado una
      <strong style="color:#7f1d1d;">expulsión definitiva</strong> de su representado(a)
      del plantel educativo.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#991b1b;text-transform:uppercase;letter-spacing:0.05em;">Resolución de expulsión</p>
          <p style="margin:0 0 6px;"><strong>Estudiante:</strong> ${escapeHtml(nombreEstudiante)}</p>
          <p style="margin:0 0 6px;"><strong>Fecha de resolución:</strong> ${escapeHtml(formatFechaCr(fechaInicio))}</p>
          <p style="margin:0 0 6px;"><strong>Vigencia:</strong> Definitiva — sin reingreso automático al sistema</p>
          <p style="margin:0;"><strong>Motivo / justificación:</strong><br/>${motivoSafe}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#475569;font-size:14px;">
      La matrícula vigente ha sido cancelada y el expediente queda archivado institucionalmente.
      Para consultas, comuníquese directamente con la administración del liceo.
    </p>
  `;

  return layoutInstitucional({
    tituloBanner: 'Expulsión definitiva',
    cuerpoHtml: cuerpo,
  });
}
