import { describe, it, expect, vi } from 'vitest';
import {
  plantillaAusenciaInjustificada,
  plantillaEstadoOrientacion,
  plantillaExpulsionOrientacion,
} from '../../../../backend-node/src/utils/emailTemplates.js';

const XSS = '<script>alert("x")</script> & \'y\'';
const ESC = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;';

describe('emailTemplates — escape HTML (XSS) y formato', () => {
  it('ausencia injustificada: escapa todos los campos; fecha DD/MM/AAAA; guiones si faltan materia/sección', () => {
    const html = plantillaAusenciaInjustificada({ nombreEncargado: XSS, nombreEstudiante: XSS, fecha: '2026-03-04T10:00:00Z' });
    expect(html).not.toContain('<script>');
    expect(html).toContain(ESC);
    expect(html).toContain('04/03/2026');
    expect(html).toContain('<strong>Materia:</strong> —');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('ausencia: nombres null → cadena vacía; fecha null → —', () => {
    const html = plantillaAusenciaInjustificada({ nombreEncargado: null, nombreEstudiante: undefined, fecha: null, nombreMateria: 'Física', nombreSeccion: '7-1' });
    expect(html).toContain('<strong>Fecha:</strong> —');
    expect(html).toContain('Física');
    expect(html).toContain('Estimado(a) <strong></strong>');
  });

  it('estado de orientación con y sin fecha fin; motivo con saltos de línea → <br/>; motivo vacío → texto por defecto', () => {
    const a = plantillaEstadoOrientacion({ nombreEncargado: 'E', nombreEstudiante: 'S', tipoEstadoLabel: 'Suspensión', fechaInicio: '2026-01-01', fechaFin: '2026-01-05', motivo: 'línea1\n<b>línea2</b>' });
    expect(a).toContain('01/01/2026 al 05/01/2026');
    expect(a).toContain('línea1<br/>&lt;b&gt;línea2&lt;/b&gt;');
    const b = plantillaEstadoOrientacion({ nombreEncargado: 'E', nombreEstudiante: 'S', tipoEstadoLabel: XSS, fechaInicio: '2026-01-01' });
    expect(b).toContain('01/01/2026 — vigencia según resolución institucional');
    expect(b).toContain('Sin detalle adicional registrado.');
    expect(b).not.toContain('<script>');
  });

  it('expulsión', () => {
    const html = plantillaExpulsionOrientacion({ nombreEncargado: 'E', nombreEstudiante: XSS, fechaInicio: '2026-07-07', motivo: XSS });
    expect(html).toContain('Expulsión definitiva');
    expect(html).toContain('07/07/2026');
    expect(html.match(/&lt;script&gt;/g)).toHaveLength(2);
    expect(plantillaExpulsionOrientacion({ fechaInicio: null })).toContain('Sin detalle adicional registrado.');
  });
});
