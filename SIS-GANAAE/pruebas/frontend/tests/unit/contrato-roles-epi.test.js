/**
 * Contrato frontend ↔ backend para el rol EPI (ciclo 11). Solo lectura:
 * - roles permitidos en la ruta /epi/reportes (Routing.jsx) vs puedeVerReportesEpi (backend utils/roles.js, módulo puro)
 * - la forma de los datos simulados coincide con lo que devuelve el backend (lectura estática del servicio)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { puedeVerReportesEpi, etiquetaRolPersona } from '../../../../backend-node/src/utils/roles.js';
import { rutaInicioPorRol } from '@/lib/rutasPorRol';

const RAIZ = path.resolve(__dirname, '../../../..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const ROLES = ['epi', 'administrador', 'super_administrador', 'orientador', 'profesor', 'padre_de_familia', 'estudiante'];

function rolesRuta(ruta) {
  const src = leer('frontend-reactjs/src/routes/Routing.jsx');
  const linea = src.split('\n').find((l) => l.includes(`path='${ruta}'`));
  return JSON.parse(/allowedRoles=\{(\[[^\]]*\])\}/.exec(linea)[1].replace(/'/g, '"'));
}

describe('Permisos /epi/reportes: frontend vs backend', () => {
  test.each(ROLES)('rol %s: la ruta del frontend y el middleware del backend coinciden', (rol) => {
    expect(rolesRuta('/epi/reportes').includes(rol)).toBe(puedeVerReportesEpi(rol));
  });

  test('el backend etiqueta el rol epi como "Equipo de Permanencia Estudiantil" (igual que RegistroPersonas sin el sufijo "(EPI)")', () => {
    expect(etiquetaRolPersona('epi')).toBe('Equipo de Permanencia Estudiantil');
    const reg = leer('frontend-reactjs/src/components/register-data/RegistroPersonas.jsx');
    expect(reg).toContain('<option value="epi">Equipo de Permanencia Estudiantil (EPI)</option>');
  });

  test('la ruta de inicio del rol epi está permitida para ese rol (no hay bucle de redirección)', () => {
    expect(rolesRuta(rutaInicioPorRol('epi'))).toContain('epi');
  });

  test('/cambiar-contraseña admite al rol epi', () => {
    expect(rolesRuta('/cambiar-contraseña')).toContain('epi');
  });
});

describe('Forma de los datos (servicio del backend, lectura estática)', () => {
  const srv = leer('backend-node/src/services/epiReportesService.js');
  test('estudiantes: id_estudiante, nombre_completo, cedula dentro de { estudiantes }', () => {
    expect(srv).toMatch(/'p\.id_persona as id_estudiante', 'p\.nombre_completo', 'p\.cedula'/);
    expect(srv).toMatch(/estudiantes: \[\.\.\.unicos\.values\(\)\]/);
  });
  test('reporte: filtros.periodo_label, nombre_estudiante y catalogos { secciones, materias }', () => {
    expect(srv).toMatch(/periodo_label: ETIQUETA_PERIODO\[rango\.periodo\]/);
    expect(srv).toMatch(/nombre_estudiante: estudianteSel\?\.nombre_completo \|\| null/);
    // catalogos.secciones ahora se ordena en orden natural antes de devolverse (DEF-13 API).
    expect(srv).toMatch(/catalogos: \{\s*secciones: \[\.\.\.secciones\]\.sort\(/);
    expect(srv).toMatch(/catalogos: \{[\s\S]*?\bmaterias,\s*\}/);
  });
  test('[OBSERVACIÓN] los totales del backend incluyen "otros" (base del defecto D-02)', () => {
    expect(srv).toMatch(/otros: 0/);
    expect(srv).toMatch(/totales\.otros \+= cantidad/);
  });
  test('el 403 del backend usa { error } (la página EPI lo mostraría correctamente)', () => {
    const mw = leer('backend-node/src/middlewares/verificarRoles.js');
    expect(mw).toMatch(/status\(403\)\.json\(\{ error: 'Acceso restringido al Equipo de Permanencia Estudiantil' \}\)/);
  });
  test('[OBSERVACIÓN] el PDF se pide con responseType blob: un error JSON del backend (p. ej. 400 por rango) no se muestra, solo el genérico', () => {
    const svc = leer('frontend-reactjs/src/services/epiServices.jsx');
    expect(svc).toMatch(/responseType: 'blob'/);
    const pag = leer('frontend-reactjs/src/pages/epi/ReportesAsistenciaEpi.jsx');
    expect(pag).toMatch(/No se pudo descargar el PDF\. Intente de nuevo\./);
  });
});
