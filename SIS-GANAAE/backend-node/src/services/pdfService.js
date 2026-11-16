import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');
const ROBOTO_REGULAR = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
const ROBOTO_BOLD = path.join(FONTS_DIR, 'Roboto-Bold.ttf');

/** Registra fuentes TTF con soporte UTF-8 (ñ, tildes) si están disponibles. */
function registrarFuentesLatinas(doc) {
  const tieneRoboto =
    fs.existsSync(ROBOTO_REGULAR) && fs.existsSync(ROBOTO_BOLD);
  if (tieneRoboto) {
    doc.registerFont('PdfLatin', ROBOTO_REGULAR);
    doc.registerFont('PdfLatin-Bold', ROBOTO_BOLD);
    return { regular: 'PdfLatin', bold: 'PdfLatin-Bold', latin: true };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', latin: false };
}

/** Texto seguro según fuente disponible (Helvetica no soporta ñ). */
function txt(text, fonts) {
  const s = String(text ?? '');
  if (fonts.latin) return s;
  return s
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/Á/g, 'A')
    .replace(/É/g, 'E')
    .replace(/Í/g, 'I')
    .replace(/Ó/g, 'O')
    .replace(/Ú/g, 'U');
}

const inferPdfKitType = (fileName) => {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (lower.endsWith('.webp')) return 'webp';
  return undefined;
};

async function cargarLogo(fileName) {
  const type = inferPdfKitType(fileName);
  const localCandidates = [
    path.resolve(__dirname, '../../public/images', fileName),
    path.resolve(__dirname, '../../../frontend-reactjs/public/images', fileName),
  ];

  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      return { source: candidate, type };
    }
  }

  const remoteCandidates = [
    `http://react-frontend:5173/images/${fileName}`,
    `http://localhost:5173/images/${fileName}`,
  ];

  for (const url of remoteCandidates) {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 4000 });
      return { source: Buffer.from(response.data), type };
    } catch {
      // siguiente origen
    }
  }

  return null;
}

/**
 * Genera el comprobante de matrícula y lo envía por el stream HTTP (res).
 * El caller debe fijar Content-Type y Content-Disposition antes o después según prefiera (recomendado antes).
 *
 * @param {import('express').Response} res
 * @param {object} params
 * @param {object} params.matricula - fila join matricula + persona + curso + seccion
 * @param {object|null} params.tutor - fila tutor con patria_potestad
 */
export async function pipeComprobanteMatriculaPdf(res, { matricula, tutor }) {
  const logoMep = await cargarLogo('logo-mep.png');
  const logoLiceo = await cargarLogo('logo-liceo.jpg');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  const fonts = registrarFuentesLatinas(doc);

  if (logoMep?.source) {
    doc.image(logoMep.source, 50, 42, { fit: [90, 50], type: logoMep.type });
  }
  if (logoLiceo?.source) {
    doc.image(logoLiceo.source, 460, 42, { fit: [90, 50], type: logoLiceo.type });
  }

  doc
    .fontSize(17)
    .font(fonts.bold)
    .text(txt('Benemérito Liceo José Martí', fonts), 50, 45, { align: 'center' })
    .moveDown(0.2)
    .fontSize(11)
    .font(fonts.regular)
    .text(txt('Comprobante Oficial de Matrícula', fonts), { align: 'center' });

  doc.moveTo(50, 108).lineTo(545, 108).strokeColor('#1f2937').stroke();

  let y = 125;
  const labelValue = (label, value) => {
    doc.font(fonts.bold).fontSize(10).text(txt(label, fonts), 55, y);
    doc.font(fonts.regular).fontSize(10).text(txt(value || '-', fonts), 220, y);
    y += 20;
  };

  doc.font(fonts.bold).fontSize(12).text(txt('Información del Estudiante', fonts), 50, y);
  y += 24;
  labelValue('Nombre completo:', matricula.nombre_completo);
  labelValue('Cédula / DIMEX:', matricula.cedula);

  y += 8;
  doc.font(fonts.bold).fontSize(12).text(txt('Información Académica', fonts), 50, y);
  y += 24;
  labelValue('Año lectivo:', String(matricula.anio_curso_lectivo || '-'));
  labelValue('Grado / Año que cursa:', matricula.ano_a_cursar);
  labelValue('Sección asignada:', matricula.nombre_seccion || 'Sin sección');

  y += 8;
  doc.font(fonts.bold).fontSize(12).text(txt('Detalles de Matrícula', fonts), 50, y);
  y += 24;
  labelValue(
    'Fecha de registro:',
    matricula.fecha_matricula ? new Date(matricula.fecha_matricula).toLocaleDateString('es-CR') : '-'
  );
  labelValue('Estado de la matrícula:', matricula.estado || '-');
  labelValue('Horario de referencia:', 'Lunes a Viernes 7:00 am a 5:40 pm');

  y += 8;
  doc.font(fonts.bold).fontSize(12).text(txt('Tutor Vinculado', fonts), 50, y);
  y += 24;
  labelValue('Nombre del tutor:', tutor?.nombre_completo || '-');
  labelValue('Cédula del tutor:', tutor?.cedula || '-');
  labelValue('Teléfono del tutor:', tutor?.telefono || '-');
  labelValue('Parentesco:', tutor ? (tutor.patria_potestad ? 'Tutor legal' : 'Encargado') : '-');

  doc
    .fontSize(9)
    .font(fonts.regular)
    .fillColor('#4b5563')
    .text(
      txt(
        `Documento generado el ${new Date().toLocaleString('es-CR')} por el Sistema de Asistencias Estudiantiles.`,
        fonts
      ),
      50,
      760,
      { align: 'center', width: 500 }
    );

  doc.end();
}

function formatFechaCr(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Matriz de análisis de asistencia para encargados (mismo estilo visual que comprobante de matrícula).
 *
 * @param {import('express').Response} res
 * @param {object} reporte
 */
export async function pipeReporteAsistenciaHijoPdf(res, reporte) {
  const { estudiante, registros, resumen, rango, tutor_nombre } = reporte;
  const logoMep = await cargarLogo('logo-mep.png');
  const logoLiceo = await cargarLogo('logo-liceo.jpg');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  if (logoMep?.source) {
    doc.image(logoMep.source, 50, 42, { fit: [90, 50], type: logoMep.type });
  }
  if (logoLiceo?.source) {
    doc.image(logoLiceo.source, 460, 42, { fit: [90, 50], type: logoLiceo.type });
  }

  doc
    .fontSize(17)
    .font('Helvetica-Bold')
    .text('Benemerito Liceo Jose Marti', 50, 45, { align: 'center' })
    .moveDown(0.2)
    .fontSize(11)
    .font('Helvetica')
    .text('Matriz de Analisis de Asistencia Estudiantil', { align: 'center' });

  doc.moveTo(50, 108).lineTo(545, 108).strokeColor('#1f2937').stroke();

  let y = 125;
  const labelValue = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10).text(label, 55, y);
    doc.font('Helvetica').fontSize(10).text(value || '-', 220, y, { width: 320 });
    y += 20;
  };

  doc.font('Helvetica-Bold').fontSize(12).text('Informacion del Estudiante', 50, y);
  y += 24;
  labelValue('Nombre completo:', estudiante.nombre_completo);
  labelValue('Cedula / DIMEX:', estudiante.cedula);
  labelValue('Seccion:', estudiante.nombre_seccion);
  labelValue('Ano que cursa:', estudiante.ano_a_cursar);
  labelValue('Año lectivo:', String(estudiante.anio_curso_lectivo || '-'));

  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).text('Periodo del reporte', 50, y);
  y += 24;
  labelValue('Desde:', formatFechaCr(rango.fecha_inicio));
  labelValue('Hasta:', formatFechaCr(rango.fecha_fin));
  labelValue('Solicitado por:', tutor_nombre || 'Encargado');

  y += 12;
  doc.font('Helvetica-Bold').fontSize(11).text('Detalle diario de asistencia', 50, y);
  y += 18;

  const colFecha = 55;
  const colMateria = 115;
  const colHorario = 250;
  const colCond = 420;

  doc.font('Helvetica-Bold').fontSize(8);
  doc.text('Fecha', colFecha, y);
  doc.text('Materia', colMateria, y);
  doc.text('Leccion / Horario', colHorario, y);
  doc.text('Condicion', colCond, y);
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#d1d5db').stroke();
  y += 6;

  doc.font('Helvetica').fontSize(8);
  const pageBottom = 700;

  if (registros.length === 0) {
    doc.text('No hay registros de asistencia en el periodo seleccionado.', colFecha, y);
    y += 20;
  } else {
    for (const r of registros) {
      if (y > pageBottom) {
        doc.addPage();
        y = 50;
        doc.font('Helvetica-Bold').fontSize(11).text('Detalle diario de asistencia (cont.)', 50, y);
        y += 22;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Fecha', colFecha, y);
        doc.text('Materia', colMateria, y);
        doc.text('Leccion / Horario', colHorario, y);
        doc.text('Condicion', colCond, y);
        y += 14;
        doc.font('Helvetica').fontSize(8);
      }

      doc.text(formatFechaCr(r.fecha), colFecha, y, { width: 55 });
      doc.text(r.nombre_materia || '—', colMateria, y, { width: 130 });
      doc.text(r.horario_leccion || '—', colHorario, y, { width: 165 });
      doc.text(r.condicion || r.estado, colCond, y, { width: 120 });
      y += 28;
    }
  }

  if (y > pageBottom - 120) {
    doc.addPage();
    y = 50;
  }

  y += 10;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#1f2937').stroke();
  y += 16;

  doc.font('Helvetica-Bold').fontSize(12).text('Resumen estadistico del periodo', 50, y);
  y += 24;
  doc.font('Helvetica').fontSize(10);
  const statLine = (label, value) => {
    doc.font('Helvetica-Bold').text(label, 55, y);
    doc.font('Helvetica').text(String(value), 280, y);
    y += 18;
  };

  statLine('Total de marcas registradas:', resumen.total_registros);
  statLine('Presentes:', resumen.presentes);
  statLine('Tardias:', resumen.tardias);
  statLine('Ausencias totales:', resumen.ausencias_totales);
  statLine('  — Ausencias justificadas:', resumen.ausencias_justificadas);
  statLine('  — Ausencias injustificadas:', resumen.ausencias_injustificadas);
  if (resumen.permisos_especiales > 0) {
    statLine('Permisos especiales:', resumen.permisos_especiales);
  }
  if (resumen.suspendidos > 0) {
    statLine('Suspendidos:', resumen.suspendidos);
  }
  if (resumen.expulsados > 0) {
    statLine('Expulsados:', resumen.expulsados);
  }

  y += 6;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1d4ed8');
  doc.text(`Nivel general de asistencia: ${resumen.nivel_asistencia_pct}%`, 55, y);
  doc.fillColor('#000000');

  doc
    .fontSize(9)
    .font('Helvetica-Oblique')
    .fillColor('#4b5563')
    .text(
      `Documento generado el ${new Date().toLocaleString('es-CR')} por el Sistema de Asistencias Estudiantiles.`,
      50,
      760,
      { align: 'center', width: 500 }
    );

  doc.end();
}

/**
 * Comprobante oficial individual de orientación (sanción / permiso).
 */
export async function pipeComprobanteOrientacionPdf(res, registro) {
  const logoMep = await cargarLogo('logo-mep.png');
  const logoLiceo = await cargarLogo('logo-liceo.jpg');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  if (logoMep?.source) {
    doc.image(logoMep.source, 50, 42, { fit: [90, 50], type: logoMep.type });
  }
  if (logoLiceo?.source) {
    doc.image(logoLiceo.source, 460, 42, { fit: [90, 50], type: logoLiceo.type });
  }

  doc
    .fontSize(17)
    .font('Helvetica-Bold')
    .text('Benemerito Liceo Jose Marti', 50, 45, { align: 'center' })
    .moveDown(0.2)
    .fontSize(11)
    .font('Helvetica')
    .text('Comprobante Oficial — Departamento de Orientacion', { align: 'center' });

  doc.moveTo(50, 108).lineTo(545, 108).strokeColor('#1f2937').stroke();

  let y = 125;
  const labelValue = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10).text(label, 55, y);
    doc.font('Helvetica').fontSize(10).text(value || '-', 220, y, { width: 320 });
    y += 20;
  };

  doc.font('Helvetica-Bold').fontSize(12).text('Datos de emision', 50, y);
  y += 24;
  labelValue('Fecha de emision:', new Date().toLocaleString('es-CR'));
  labelValue('No. de registro:', String(registro.id_estado_periodo));

  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).text('Datos del estudiante', 50, y);
  y += 24;
  labelValue('Nombre completo:', registro.nombre_completo);
  labelValue('Cedula / DIMEX:', registro.cedula);
  labelValue('Seccion:', registro.nombre_seccion);
  if (registro.ano_a_cursar) {
    labelValue('Ano que cursa:', registro.ano_a_cursar);
  }

  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).text('Detalle de la sancion / permiso', 50, y);
  y += 24;
  labelValue('Tipo de estado:', registro.tipo_estado_label || registro.tipo_estado);
  labelValue('Vigencia desde:', formatFechaCr(registro.fecha_inicio));
  labelValue(
    'Vigencia hasta:',
    registro.fecha_fin ? formatFechaCr(registro.fecha_fin) : 'Indefinido / Expulsion definitiva'
  );

  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).text('Justificacion / Motivo', 50, y);
  y += 22;
  doc.font('Helvetica').fontSize(10).text(registro.motivo || 'Sin motivo registrado.', 55, y, {
    width: 490,
    align: 'justify',
  });

  y += 100;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#d1d5db').stroke();
  y += 40;

  doc.font('Helvetica').fontSize(10).fillColor('#000000');
  doc.text('Recibido conforme — Departamento de Orientacion', 55, y);
  doc.text('Recibido conforme — Padre / Encargado legal', 320, y);
  y += 50;
  doc.moveTo(55, y).lineTo(250, y).stroke();
  doc.moveTo(320, y).lineTo(515, y).stroke();
  y += 14;
  doc.fontSize(8).fillColor('#6b7280');
  doc.text('Firma y sello', 55, y);
  doc.text('Firma, nombre y cedula', 320, y);

  doc
    .fontSize(9)
    .font('Helvetica-Oblique')
    .fillColor('#4b5563')
    .text(
      `Documento generado el ${new Date().toLocaleString('es-CR')} por el Sistema de Asistencias Estudiantiles.`,
      50,
      760,
      { align: 'center', width: 500 }
    );

  doc.end();
}

/**
 * Matriz PDF de estados especiales filtrados (reuniones de permanencia).
 */
export async function pipeReporteOrientacionFiltradoPdf(res, { filtros, registros }) {
  const logoMep = await cargarLogo('logo-mep.png');
  const logoLiceo = await cargarLogo('logo-liceo.jpg');

  const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'landscape' });
  doc.pipe(res);

  if (logoMep?.source) {
    doc.image(logoMep.source, 40, 30, { fit: [80, 45], type: logoMep.type });
  }
  if (logoLiceo?.source) {
    doc.image(logoLiceo.source, 680, 30, { fit: [80, 45], type: logoLiceo.type });
  }

  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('Benemerito Liceo Jose Marti', 40, 32, { align: 'center', width: 720 })
    .fontSize(10)
    .font('Helvetica')
    .text('Reporte de Estados Especiales — Departamento de Orientacion y Permanencia', {
      align: 'center',
      width: 720,
    });

  doc.moveTo(40, 78).lineTo(800, 78).strokeColor('#1f2937').stroke();

  let y = 92;
  doc.font('Helvetica').fontSize(9);
  const filtrosTxt = [
    filtros.tipo_estado ? `Tipo: ${filtros.tipo_estado}` : null,
    filtros.fecha_inicio ? `Desde: ${formatFechaCr(filtros.fecha_inicio)}` : null,
    filtros.fecha_fin ? `Hasta: ${formatFechaCr(filtros.fecha_fin)}` : null,
  ].filter(Boolean).join('  |  ');
  doc.text(filtrosTxt || 'Sin filtros adicionales (todos los registros)', 40, y);
  y += 18;
  doc.font('Helvetica-Bold').text(`Total de registros: ${registros.length}`, 40, y);
  y += 20;

  const cols = { cedula: 40, nombre: 110, seccion: 280, tipo: 360, periodo: 470, motivo: 580 };
  doc.font('Helvetica-Bold').fontSize(8);
  doc.text('Cedula', cols.cedula, y);
  doc.text('Estudiante', cols.nombre, y);
  doc.text('Seccion', cols.seccion, y);
  doc.text('Estado', cols.tipo, y);
  doc.text('Periodo', cols.periodo, y);
  doc.text('Motivo', cols.motivo, y);
  y += 12;
  doc.moveTo(40, y).lineTo(800, y).strokeColor('#d1d5db').stroke();
  y += 6;

  doc.font('Helvetica').fontSize(7.5);
  const pageBottom = 520;

  if (registros.length === 0) {
    doc.text('No hay registros para los filtros aplicados.', cols.cedula, y);
  } else {
    for (const r of registros) {
      if (y > pageBottom) {
        doc.addPage({ layout: 'landscape' });
        y = 40;
      }
      const periodo = `${formatFechaCr(r.fecha_inicio)} al ${r.fecha_fin ? formatFechaCr(r.fecha_fin) : '—'}`;
      doc.text(r.cedula || '—', cols.cedula, y, { width: 65 });
      doc.text(r.nombre_completo || '—', cols.nombre, y, { width: 165 });
      doc.text(r.nombre_seccion || '—', cols.seccion, y, { width: 75 });
      doc.text(r.tipo_estado_label || r.tipo_estado, cols.tipo, y, { width: 100 });
      doc.text(periodo, cols.periodo, y, { width: 100 });
      doc.text((r.motivo || '—').slice(0, 120), cols.motivo, y, { width: 210 });
      y += 22;
    }
  }

  doc
    .fontSize(8)
    .font('Helvetica-Oblique')
    .fillColor('#4b5563')
    .text(
      `Generado el ${new Date().toLocaleString('es-CR')} — Sistema de Asistencias Estudiantiles`,
      40,
      550,
      { align: 'center', width: 720 }
    );

  doc.end();
}

/**
 * Reporte PDF de sustituciones docentes (todas o filtradas por profesor).
 */
export async function pipeReporteSustitucionesPdf(res, { anioLectivo, sustituciones, filtroPersona }) {
  const logoMep = await cargarLogo('logo-mep.png');
  const logoLiceo = await cargarLogo('logo-liceo.jpg');

  const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'landscape' });
  doc.pipe(res);
  const fonts = registrarFuentesLatinas(doc);

  if (logoMep?.source) {
    doc.image(logoMep.source, 40, 30, { fit: [80, 45], type: logoMep.type });
  }
  if (logoLiceo?.source) {
    doc.image(logoLiceo.source, 680, 30, { fit: [80, 45], type: logoLiceo.type });
  }

  doc
    .fontSize(16)
    .font(fonts.bold)
    .text(txt('Benemérito Liceo José Martí', fonts), 40, 32, { align: 'center', width: 720 })
    .fontSize(10)
    .font(fonts.regular)
    .text(txt('Reporte de Sustituciones Docentes', fonts), { align: 'center', width: 720 });

  doc.moveTo(40, 78).lineTo(800, 78).strokeColor('#1f2937').stroke();

  let y = 92;
  doc.font(fonts.regular).fontSize(9);
  doc.text(txt(`Año lectivo: ${anioLectivo}`, fonts), 40, y);
  y += 14;
  if (filtroPersona) {
    doc.text(txt(`Filtro: ${filtroPersona}`, fonts), 40, y);
    y += 14;
  }
  doc.font(fonts.bold).text(txt(`Total de registros: ${sustituciones.length}`, fonts), 40, y);
  y += 20;

  const cols = {
    titular: 40,
    sustituto: 200,
    periodo: 360,
    estado: 480,
    asignaciones: 560,
  };

  doc.font(fonts.bold).fontSize(8);
  doc.text(txt('Titular', fonts), cols.titular, y);
  doc.text(txt('Sustituto', fonts), cols.sustituto, y);
  doc.text(txt('Periodo', fonts), cols.periodo, y);
  doc.text(txt('Estado', fonts), cols.estado, y);
  doc.text(txt('Materias / Secciones', fonts), cols.asignaciones, y);
  y += 12;
  doc.moveTo(40, y).lineTo(800, y).strokeColor('#d1d5db').stroke();
  y += 6;

  doc.font(fonts.regular).fontSize(7.5);
  const pageBottom = 520;
  const estadoLabel = { vigente: 'Vigente', finalizada: 'Finalizada', programada: 'Programada' };

  if (sustituciones.length === 0) {
    doc.text(txt('No hay sustituciones registradas para el criterio indicado.', fonts), cols.titular, y);
  } else {
    for (const s of sustituciones) {
      if (y > pageBottom) {
        doc.addPage({ layout: 'landscape' });
        y = 40;
      }
      const periodo = `${formatFechaCr(s.fecha_desde)} al ${formatFechaCr(s.fecha_hasta)}`;
      const detalle = (Array.isArray(s.asignaciones) ? s.asignaciones : [])
        .map((a) => `${a.nombre_materia} (${a.nombre_seccion})`)
        .join('; ');

      doc.text(txt(s.nombre_titular || '—', fonts), cols.titular, y, { width: 155 });
      doc.text(txt(s.nombre_sustituto || '—', fonts), cols.sustituto, y, { width: 155 });
      doc.text(txt(periodo, fonts), cols.periodo, y, { width: 115 });
      doc.text(txt(estadoLabel[s.estado] || s.estado, fonts), cols.estado, y, { width: 70 });
      doc.text(txt(detalle || '—', fonts), cols.asignaciones, y, { width: 230 });
      y += 28;
    }
  }

  doc
    .fontSize(8)
    .font(fonts.regular)
    .fillColor('#4b5563')
    .text(
      txt(`Generado el ${new Date().toLocaleString('es-CR')} — Sistema de Asistencias Estudiantiles`, fonts),
      40,
      550,
      { align: 'center', width: 720 }
    );

  doc.end();
}

/**
 * Reporte PDF de asistencia del Equipo de Permanencia Estudiantil (EPI):
 * resumen general, detalle por sección y materia, y resumen final por sección.
 *
 * @param {import('express').Response} res
 * @param {object} reporte - salida de obtenerReporteAsistenciaEpi
 */
export async function pipeReporteAsistenciaEpiPdf(res, reporte) {
  // Versión reducida del logo (600 px): el original (4182×704 RGBA) costaba ~200 ms de CPU por PDF.
  const logoMepReducido = path.resolve(__dirname, '../../public/images/logo-mep-pdf.png');
  const logoMep = fs.existsSync(logoMepReducido)
    ? { source: logoMepReducido, type: 'png' }
    : await cargarLogo('logo-mep.png');
  const logoLiceo = await cargarLogo('logo-liceo.jpg');

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(res);
  const fonts = registrarFuentesLatinas(doc);
  const T = (s) => txt(s, fonts);

  const X0 = 40;
  const ANCHO = 515;
  const LIMITE_Y = 770;
  const COLOR_PRIMARIO = '#1e3a8a';
  const { filtros, resumen_general: general, secciones } = reporte;

  /**
   * Recorta el texto con "…" para que quepa en una sola línea del ancho dado
   * (con la fuente y tamaño actuales). pdfkit con lineBreak:false igual parte
   * los textos largos y las filas se superponían.
   */
  const unaLinea = (texto, ancho) => {
    const s = T(texto);
    if (ancho <= 0 || doc.widthOfString(s) <= ancho) return s;
    const puntos = '…';
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.widthOfString(s.slice(0, mid).trimEnd() + puntos) <= ancho) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo).trimEnd() + puntos;
  };

  /**
   * Cede el event loop de vez en cuando: pdfkit dibuja de forma síncrona y un
   * reporte con miles de filas bloqueaba al servidor para el resto de usuarios.
   */
  let ultimaCesion = performance.now();
  const cederSiHaceFalta = async () => {
    // Como máximo ~12 ms de dibujo seguido; luego se atiende I/O de otras peticiones.
    if (performance.now() - ultimaCesion >= 12) {
      await new Promise((resolve) => setImmediate(resolve));
      ultimaCesion = performance.now();
    }
  };

  if (logoMep?.source) doc.image(logoMep.source, X0, 30, { fit: [70, 40], type: logoMep.type });
  if (logoLiceo?.source) {
    doc.image(logoLiceo.source, X0 + ANCHO - 70, 30, { fit: [70, 40], type: logoLiceo.type });
  }

  doc
    .fillColor('#111827')
    .font(fonts.bold)
    .fontSize(15)
    .text(T('Benemérito Liceo José Martí'), X0, 32, { align: 'center', width: ANCHO })
    .font(fonts.regular)
    .fontSize(10)
    .text(T('Reporte de Asistencia — Equipo de Permanencia Estudiantil (EPI)'), {
      align: 'center',
      width: ANCHO,
    });

  doc.moveTo(X0, 80).lineTo(X0 + ANCHO, 80).strokeColor('#1f2937').lineWidth(1).stroke();

  let y = 90;
  const lineaInfo = (etiqueta, valor) => {
    doc.font(fonts.bold).fontSize(9).fillColor('#111827').text(T(`${etiqueta}: `), X0, y, { continued: true });
    doc.font(fonts.regular).text(T(valor));
    y += 13;
  };
  lineaInfo(
    'Periodo',
    `${filtros.periodo_label} (${formatFechaCr(filtros.fecha_inicio)} al ${formatFechaCr(filtros.fecha_fin)})`
  );
  lineaInfo('Sección', filtros.nombre_seccion || 'Todas las secciones');
  lineaInfo('Materia', filtros.nombre_materia || 'Todas las materias');
  if (filtros.nombre_estudiante) {
    lineaInfo(
      'Estudiante',
      `${filtros.nombre_estudiante}${filtros.cedula_estudiante ? ` (${filtros.cedula_estudiante})` : ''}`
    );
  }
  y += 6;

  // Tarjetas de resumen general
  const tarjetas = [
    ['Registros', general.total],
    ['Presentes', general.presentes],
    ['Tardías', general.tardias],
    ['Aus. justificadas', general.ausencias_justificadas],
    ['Aus. injustificadas', general.ausencias_injustificadas],
    ['% Asistencia', `${general.porcentaje_asistencia}%`],
  ];
  const anchoTarjeta = (ANCHO - 5 * 6) / 6;
  tarjetas.forEach(([etq, val], i) => {
    const x = X0 + i * (anchoTarjeta + 6);
    const destacada = i === tarjetas.length - 1;
    doc
      .roundedRect(x, y, anchoTarjeta, 42, 4)
      .fillAndStroke(destacada ? COLOR_PRIMARIO : '#f3f4f6', destacada ? COLOR_PRIMARIO : '#d1d5db');
    doc
      .fillColor(destacada ? '#ffffff' : '#111827')
      .font(fonts.bold)
      .fontSize(13)
      .text(T(String(val)), x, y + 7, { width: anchoTarjeta, align: 'center' })
      .font(fonts.regular)
      .fontSize(7)
      .text(T(etq), x, y + 27, { width: anchoTarjeta, align: 'center' });
  });
  y += 48;
  doc
    .fillColor('#4b5563')
    .font(fonts.regular)
    .fontSize(7.5)
    .text(
      T('% de asistencia = (presentes + tardías) / total de registros. Cada registro es la marca de un estudiante en una lección.'),
      X0,
      y,
      { width: ANCHO }
    );
  y += 18;

  // Columna «Otros» (permisos especiales, suspensiones…) solo cuando existen: así el desglose cuadra con el total.
  const mostrarOtros = (general.otros || 0) > 0;
  const cols = [
    { titulo: 'Materia', ancho: mostrarOtros ? 135 : 175, align: 'left' },
    { titulo: 'Presentes', ancho: 55 },
    { titulo: 'Tardías', ancho: 50 },
    { titulo: 'Aus. just.', ancho: 55 },
    { titulo: 'Aus. injust.', ancho: 60 },
    ...(mostrarOtros ? [{ titulo: 'Otros', ancho: 40 }] : []),
    { titulo: 'Total', ancho: 55 },
    { titulo: '% Asist.', ancho: 65 },
  ];
  const ALTO_FILA = 16;

  const asegurarEspacio = (alto) => {
    if (y + alto > LIMITE_Y) {
      doc.addPage();
      y = 40;
    }
  };

  const dibujarFila = (valores, { header = false, total = false } = {}) => {
    asegurarEspacio(ALTO_FILA);
    if (header) doc.rect(X0, y, ANCHO, ALTO_FILA).fill('#e5e7eb');
    else if (total) doc.rect(X0, y, ANCHO, ALTO_FILA).fill('#dbeafe');
    let x = X0;
    doc.fillColor('#111827').font(header || total ? fonts.bold : fonts.regular).fontSize(8);
    cols.forEach((c, i) => {
      doc.text(unaLinea(String(valores[i] ?? ''), c.ancho - 8), x + 4, y + 4, {
        width: c.ancho - 8,
        align: c.align || 'center',
        lineBreak: false,
      });
      x += c.ancho;
    });
    y += ALTO_FILA;
    doc.moveTo(X0, y).lineTo(X0 + ANCHO, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  };

  const valoresTotales = (nombre, t) => [
    nombre,
    t.presentes,
    t.tardias,
    t.ausencias_justificadas,
    t.ausencias_injustificadas,
    ...(mostrarOtros ? [t.otros || 0] : []),
    t.total,
    `${t.porcentaje_asistencia}%`,
  ];

  const ALTO_UTIL = LIMITE_Y - 40;
  const tituloBloque = (texto, filas) => {
    // Mantiene la sección completa en una página cuando cabe
    asegurarEspacio(Math.min(18 + ALTO_FILA * (filas + 2), ALTO_UTIL));
    doc.rect(X0, y, ANCHO, 18).fill(COLOR_PRIMARIO);
    doc.fillColor('#ffffff').font(fonts.bold).fontSize(10);
    doc.text(unaLinea(texto, ANCHO - 12), X0 + 6, y + 4, { width: ANCHO - 12, lineBreak: false });
    y += 18;
  };

  doc.fillColor('#111827').font(fonts.bold).fontSize(11).text(T('Detalle por sección y materia'), X0, y);
  y += 18;

  if (secciones.length === 0) {
    doc
      .font(fonts.regular)
      .fontSize(9)
      .text(T('No hay registros de asistencia para el periodo y filtros seleccionados.'), X0, y);
    y += 16;
  }

  for (const sec of secciones) {
    tituloBloque(`Sección ${sec.nombre_seccion}`, sec.materias.length);
    dibujarFila(cols.map((c) => c.titulo), { header: true });
    for (const m of sec.materias) {
      dibujarFila(valoresTotales(m.nombre_materia, m.totales));
      await cederSiHaceFalta();
    }
    dibujarFila(valoresTotales(`Total sección ${sec.nombre_seccion}`, sec.totales), { total: true });
    y += 12;
  }

  if (secciones.length > 1) {
    asegurarEspacio(Math.min(18 + ALTO_FILA * (secciones.length + 2), ALTO_UTIL));
    doc.fillColor('#111827').font(fonts.bold).fontSize(11).text(T('Resumen por sección'), X0, y);
    y += 18;
    const headers = cols.map((c) => c.titulo);
    headers[0] = 'Sección';
    dibujarFila(headers, { header: true });
    for (const sec of secciones) {
      dibujarFila(valoresTotales(sec.nombre_seccion, sec.totales));
      await cederSiHaceFalta();
    }
    dibujarFila(valoresTotales('Total general', general), { total: true });
    y += 10;
  }

  // ── Detalle diario: fecha → sección → estudiantes con su condición ──
  if (Array.isArray(reporte.detalle_diario)) {
    const detalle = reporte.detalle_diario;
    const soloIncidencias = reporte.detalle_solo_incidencias !== false;
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MESES = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const fechaLarga = (iso) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
      if (!m) return 'Sin fecha';
      const [yy, mm, dd] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return 'Sin fecha';
      const dia = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
      return `${DIAS[dia]} ${dd} de ${MESES[mm - 1]} de ${yy}`;
    };
    const COLOR_CONDICION = {
      ausente: '#b91c1c',
      tardanza: '#b45309',
      justificado: '#1d4ed8',
      presente: '#15803d',
    };
    const colsD = [
      { titulo: 'Estudiante', ancho: 185 },
      { titulo: 'Cédula', ancho: 75 },
      { titulo: 'Condición', ancho: 110 },
      { titulo: 'Materias / lecciones', ancho: 145 },
    ];

    const encabezadoDetalle = () => {
      doc.rect(X0, y, ANCHO, ALTO_FILA).fill('#e5e7eb');
      let x = X0;
      doc.fillColor('#111827').font(fonts.bold).fontSize(8);
      colsD.forEach((c) => {
        doc.text(T(c.titulo), x + 4, y + 4, { width: c.ancho - 8, lineBreak: false });
        x += c.ancho;
      });
      y += ALTO_FILA;
    };

    doc.addPage();
    y = 40;
    doc.fillColor('#111827').font(fonts.bold).fontSize(12).text(T('Detalle diario de asistencia'), X0, y);
    y += 18;
    doc
      .fillColor('#4b5563')
      .font(fonts.regular)
      .fontSize(8.5)
      .text(
        T(
          soloIncidencias
            ? 'Por cada día y sección se listan los estudiantes que llegaron tarde o se ausentaron, con las materias en que ocurrió.'
            : 'Todas las marcas de asistencia del estudiante, por día y materia.'
        ),
        X0,
        y,
        { width: ANCHO }
      );
    y += 20;

    if (detalle.length === 0) {
      doc
        .fillColor('#111827')
        .fontSize(9)
        .text(T(soloIncidencias ? 'No se registraron tardías ni ausencias en el periodo.' : 'Sin marcas en el periodo.'), X0, y);
    }

    for (const dia of detalle) {
      asegurarEspacio(20 + 18 + ALTO_FILA * 2);
      doc.rect(X0, y, ANCHO, 18).fill('#111827');
      doc.fillColor('#ffffff').font(fonts.bold).fontSize(10);
      doc.text(T(fechaLarga(dia.fecha)), X0 + 6, y + 4, { width: ANCHO - 12, lineBreak: false });
      y += 22;

      for (const sec of dia.secciones) {
        const cuenta = (estado) => sec.registros.filter((r) => r.estado === estado).length;
        const resumenSec = [
          [cuenta('tardanza'), 'tardía', 'tardías'],
          [cuenta('ausente'), 'ausencia injustificada', 'ausencias injustificadas'],
          [cuenta('justificado'), 'ausencia justificada', 'ausencias justificadas'],
          [cuenta('presente'), 'presente', 'presentes'],
        ]
          .filter(([n]) => n > 0)
          .map(([n, singular, plural]) => `${n} ${n === 1 ? singular : plural}`)
          .join(' · ');

        asegurarEspacio(18 + ALTO_FILA * 2);
        doc.rect(X0, y, ANCHO, 16).fill('#dbeafe');
        doc.fillColor('#1e3a8a').font(fonts.bold).fontSize(9);
        const tituloSec = unaLinea(`Sección ${sec.nombre_seccion}`, (ANCHO - 12) / 2);
        const anchoTituloSec = doc.widthOfString(tituloSec);
        doc.text(tituloSec, X0 + 6, y + 4, { lineBreak: false });
        if (resumenSec) {
          doc.font(fonts.regular).fillColor('#374151');
          const anchoResumen = ANCHO - 12 - anchoTituloSec - 12;
          doc.text(unaLinea(resumenSec, anchoResumen), X0 + 6 + anchoTituloSec + 12, y + 4, { lineBreak: false });
        }
        y += 16;
        encabezadoDetalle();

        for (const r of sec.registros) {
          doc.font(fonts.regular).fontSize(8);
          const materiasTxt = T((Array.isArray(r.materias) ? r.materias : []).join(', ') || '—');
          const alto = Math.max(
            ALTO_FILA,
            doc.heightOfString(materiasTxt, { width: colsD[3].ancho - 8 }) + 8,
            doc.heightOfString(T(r.nombre_completo || '—'), { width: colsD[0].ancho - 8 }) + 8
          );
          if (y + alto > LIMITE_Y) {
            doc.addPage();
            y = 40;
            doc.fillColor('#4b5563').font(fonts.regular).fontSize(8);
            doc.text(
              unaLinea(`${fechaLarga(dia.fecha)} · Sección ${sec.nombre_seccion} (continuación)`, ANCHO),
              X0,
              y,
              { lineBreak: false }
            );
            y += 14;
            encabezadoDetalle();
            doc.font(fonts.regular).fontSize(8);
          }
          let x = X0;
          doc.fillColor('#111827').text(T(r.nombre_completo || '—'), x + 4, y + 4, { width: colsD[0].ancho - 8 });
          x += colsD[0].ancho;
          doc.text(unaLinea(r.cedula || '—', colsD[1].ancho - 8), x + 4, y + 4, {
            width: colsD[1].ancho - 8,
            lineBreak: false,
          });
          x += colsD[1].ancho;
          doc.fillColor(COLOR_CONDICION[r.estado] || '#111827').font(fonts.bold);
          doc.text(unaLinea(r.condicion || '—', colsD[2].ancho - 8), x + 4, y + 4, {
            width: colsD[2].ancho - 8,
            lineBreak: false,
          });
          x += colsD[2].ancho;
          doc.fillColor('#111827').font(fonts.regular).text(materiasTxt, x + 4, y + 4, { width: colsD[3].ancho - 8 });
          y += alto;
          doc.moveTo(X0, y).lineTo(X0 + ANCHO, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
          await cederSiHaceFalta();
        }
        y += 8;
      }
      y += 6;
    }
  }

  const generado = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
  const paginas = doc.bufferedPageRange();
  for (let i = paginas.start; i < paginas.start + paginas.count; i += 1) {
    doc.switchToPage(i);
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor('#6b7280')
      .font(fonts.regular)
      .fontSize(7.5)
      .text(
        T(`Generado el ${generado} — Sistema de Asistencias Estudiantiles — Página ${i + 1} de ${paginas.count}`),
        X0,
        805,
        { width: ANCHO, align: 'center', lineBreak: false }
      );
    doc.page.margins.bottom = margenInferior;
  }

  doc.end();
}
