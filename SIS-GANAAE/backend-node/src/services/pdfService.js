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
      const detalle = s.asignaciones
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
