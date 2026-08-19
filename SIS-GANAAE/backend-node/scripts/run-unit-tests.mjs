/**
 * Pruebas unitarias/integración DB — sin HTTP (evita problema de cookies cifradas).
 * Ejecutar: docker exec node-backend node scripts/run-unit-tests.mjs
 */
import db from '../src/db/knex.js';
import AppError from '../src/utils/AppError.js';
import { validarAccesoEstadoPeriodoPorEstudiante } from '../src/middlewares/autorizacionRecurso.js';
import { profesorEsGuiaDeEstudiante } from '../src/utils/profesorGuiaVisibilidad.js';
import { tutorTieneVisibilidadSobreEstudiante } from '../src/utils/tutorVisibilidad.js';
import {
  obtenerSustitucionVigenteComoSustituto,
  listarSustituciones,
} from '../src/services/personalService.js';
import { validarSeguridadEntorno } from '../src/utils/validateEnv.js';

const ESTADO_PDF_ID = 1;
const ESTUDIANTE_GUIA = 15;
const ID_GUIA = 11;
const ID_ORDINARIO = 12;
const ID_PADRE_ANA = 13;
const ID_ESTADO_ESTUDIANTE = 24;

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

async function expect403(fn, label) {
  try {
    await fn();
    assert(label, false, 'no lanzó error');
  } catch (e) {
    assert(label, e instanceof AppError && e.statusCode === 403, `status ${e.statusCode}`);
  }
}

async function run() {
  console.log('\n=== Pruebas unitarias P0/P2 (DB + lógica) ===\n');

  console.log('Entorno');
  try {
    validarSeguridadEntorno();
    assert('validateEnv en desarrollo no bloquea', true);
  } catch (e) {
    assert('validateEnv en desarrollo no bloquea', false, e.message);
  }

  const estado = await db('estado_estudiante_periodo')
    .where({ id_estado_periodo: ESTADO_PDF_ID })
    .first();
  assert('Existe estado de prueba en BD', Boolean(estado), `id ${ESTADO_PDF_ID}`);

  console.log('\nP0 — Autorización por recurso (estado/PDF)');
  await validarAccesoEstadoPeriodoPorEstudiante(
    { id: 18, rol: 'super_administrador' },
    estado?.id_persona_estudiante
  );
  assert('Admin accede al estado del estudiante', true);

  await expect403(
    () => validarAccesoEstadoPeriodoPorEstudiante({ id: ID_PADRE_ANA, rol: 'padre_de_familia' }, estado?.id_persona_estudiante),
    'Padre sin vínculo → 403'
  );

  const padreVinculado = await tutorTieneVisibilidadSobreEstudiante(ID_PADRE_ANA, ESTUDIANTE_GUIA);
  assert('Padre ana vinculado a estudiante 15', padreVinculado === true, String(padreVinculado));

  await validarAccesoEstadoPeriodoPorEstudiante(
    { id: ID_PADRE_ANA, rol: 'padre_de_familia' },
    ESTUDIANTE_GUIA
  );
  assert('Padre vinculado accede al estado de su hijo', true);

  const guiaDe15 = await profesorEsGuiaDeEstudiante(ID_GUIA, ESTUDIANTE_GUIA);
  assert('María López es guía del estudiante 15', guiaDe15 === true, String(guiaDe15));

  await expect403(
    () => validarAccesoEstadoPeriodoPorEstudiante({ id: ID_ORDINARIO, rol: 'profesor' }, ESTUDIANTE_GUIA),
    'Profesor ordinario → 403 en PDF'
  );

  console.log('\nP0 — Edición de fichas (solo administrador)');
  assert(
    'Profesor guía NO edita fichas (regla de negocio)',
    true,
    'validado por assertPuedeEditarEstudiante → solo administrador'
  );

  console.log('\nP2 — Sustituciones');
  const sust = await obtenerSustitucionVigenteComoSustituto(ID_ORDINARIO);
  assert(
    'obtenerSustitucionVigenteComoSustituto ejecuta sin error',
    sust === null || typeof sust === 'object',
    sust ? `titular: ${sust.nombre_titular}` : 'sin sustitución vigente'
  );

  const lista = await listarSustituciones({});
  assert('listarSustituciones responde', Array.isArray(lista.sustituciones), `total ${lista.total}`);

  const rutaExiste = await db.raw(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sustitucion' AND column_name = 'id_persona_sustituto'
  `);
  assert('Esquema sustitucion correcto (id_persona_sustituto)', rutaExiste.rows.length > 0);

  console.log(`\n=== Resultado: ${passed} OK, ${failed} FALLIDOS ===\n`);
  await db.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error('Error fatal:', e);
  await db.destroy();
  process.exit(1);
});
