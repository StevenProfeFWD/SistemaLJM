/**
 * Pruebas de integración — Sprint P0/P2
 * Ejecutar desde backend-node: node scripts/run-integration-tests.mjs
 */
import axios from 'axios';

const PASS = 'liceomarti';

const USERS = {
  admin: { correo: 'superadmin@liceomarti.ed.cr' },
  guia: { correo: 'maria.lopez@liceomarti.ed.cr' },
  ordinario: { correo: 'carlos.mendez@liceomarti.ed.cr' },
  padre: { correo: 'ana.hernandez@correo.com' },
};

const ESTADO_PDF_ID = 1;
const ESTUDIANTE_GUIA = 15;
const ESTUDIANTE_FUERA_SECCION = 24;

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

function cookiesFromHeaders(headers) {
  const raw = headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => c.split(';')[0]).join('; ');
}

function clientWithCookie(cookie) {
  return axios.create({
    baseURL: 'http://localhost:3000/api',
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
    maxRedirects: 0,
  });
}

async function login(correo) {
  const res = await clientWithCookie('').post('/personas/login', {
    correo,
    contrasena: PASS,
  });
  return {
    status: res.status,
    cookies: cookiesFromHeaders(res.headers),
    data: res.data,
  };
}

async function run() {
  console.log('\n=== Pruebas de integración P0/P2 ===\n');

  console.log('Autenticación');
  const sessions = {};
  for (const [key, u] of Object.entries(USERS)) {
    const s = await login(u.correo);
    sessions[key] = s;
    assert(
      `Login ${key}`,
      s.status === 200 && (s.cookies.includes('token=') || s.cookies.includes('pending_password_change=')),
      `status ${s.status}, keys=${s.cookies.split(';').map((p) => p.trim().split('=')[0]).join(',')}`
    );
  }

  if (!sessions.admin.cookies) {
    console.log('\nNo se pudo autenticar — abortando pruebas protegidas.\n');
    process.exit(1);
  }

  const sesionAdmin = await clientWithCookie(sessions.admin.cookies).get('/personas/sesion');
  assert(
    'Cookie de sesión válida (/personas/sesion)',
    sesionAdmin.status === 200 && sesionAdmin.data?.rol,
    `status ${sesionAdmin.status}, cookieLen=${sessions.admin.cookies.length}`
  );

  if (sesionAdmin.status !== 200) {
    console.log('\nLas cookies no se reenvían correctamente — abortando.\n');
    process.exit(1);
  }

  const admin = clientWithCookie(sessions.admin.cookies);
  const guia = clientWithCookie(sessions.guia.cookies);
  const ordinario = clientWithCookie(sessions.ordinario.cookies);
  const padre = clientWithCookie(sessions.padre.cookies);

  console.log('\nP0 — PDF comprobante orientación');
  const pdfAdmin = await admin.get(`/orientacion/comprobante-pdf/${ESTADO_PDF_ID}`, {
    responseType: 'arraybuffer',
  });
  assert('Admin accede al PDF', pdfAdmin.status === 200, `status ${pdfAdmin.status}`);

  const pdfPadre = await padre.get(`/orientacion/comprobante-pdf/${ESTADO_PDF_ID}`);
  assert('Padre sin vínculo → 403', pdfPadre.status === 403, `status ${pdfPadre.status}`);

  const pdfOrd = await ordinario.get(`/orientacion/comprobante-pdf/${ESTADO_PDF_ID}`);
  assert('Profesor ordinario → 403', pdfOrd.status === 403, `status ${pdfOrd.status}`);

  console.log('\nP0 — Edición estudiantes');
  const editGuia = await guia.patch(`/estudiantes/${ESTUDIANTE_GUIA}`, {
    telefono: '8888-0001',
  });
  assert('Profesor guía edita su alumno', editGuia.status === 200, `status ${editGuia.status}`);

  const editOrd = await ordinario.patch(`/estudiantes/${ESTUDIANTE_GUIA}`, {
    telefono: '8888-0002',
  });
  assert('Profesor ordinario → 403', editOrd.status === 403, `status ${editOrd.status}`);

  const editAdmin = await admin.patch(`/estudiantes/${ESTUDIANTE_FUERA_SECCION}`, {
    telefono: '8888-0003',
  });
  assert('Admin edita cualquier alumno', editAdmin.status === 200, `status ${editAdmin.status}`);

  console.log('\nP2 — Sustituciones');
  const miSust = await guia.get('/personal/mi-sustitucion-vigente');
  assert('mi-sustitucion-vigente → 200', miSust.status === 200, `status ${miSust.status}`);
  assert('Respuesta incluye campo sustitucion', miSust.data && 'sustitucion' in miSust.data, '');

  const lista = await admin.get('/admin/personal/sustituciones');
  assert('Admin lista sustituciones', lista.status === 200, `status ${lista.status}`);

  const activa = lista.data?.sustituciones?.find(
    (s) => s.estado === 'vigente' || s.estado === 'programada'
  );
  if (activa?.id_sustitucion_referencia) {
    const cancel = await admin.patch(
      `/personal/sustitucion/${activa.id_sustitucion_referencia}/cancelar`
    );
    assert('Cancelar sustitución', cancel.status === 200, `status ${cancel.status}`);
  } else {
    console.log('  ~ Sin sustitución activa en BD — cancelación omitida');
  }

  const noAuth = await clientWithCookie('').get(`/orientacion/comprobante-pdf/${ESTADO_PDF_ID}`);
  assert('Sin token → 401', noAuth.status === 401, `status ${noAuth.status}`);

  console.log(`\n=== Resultado: ${passed} OK, ${failed} FALLIDOS ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Error fatal:', e.message);
  process.exit(1);
});
