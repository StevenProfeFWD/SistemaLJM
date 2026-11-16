// Comprobaciones usadas en la revisión (pegar en la consola de Chromium con el servidor
// de pruebas: `vite --config navegador/vite.config.mjs`, puerto 5199, API simulada).
// No modifican la app; solo inspeccionan estilos y estado.

// 1) Menú móvil (ancho < 1024 px, p. ej. /inicio?rol=administrador):
//    qué propiedades se animan al abrir/cerrar. Esperado: incluir "translate".
export async function transicionesMenu() {
  const nav = document.getElementById('main-sidebar-nav');
  const abrir = document.querySelector('button[aria-label="Abrir menú de navegación"]');
  abrir.click();
  await new Promise((r) => setTimeout(r, 30));
  const props = nav.getAnimations().map((a) => a.transitionProperty);
  nav.getAnimations().forEach((a) => a.finish());
  return { transitionProperty: getComputedStyle(nav).transitionProperty, animadas: props };
  // Resultado observado: { transitionProperty: "transform, visibility", animadas: ["visibility"] }
}

// 2) Select vs input en /registro?rol=administrador: mismo fondo (el select ya no se ve gris).
export function fondosRegistro() {
  const sel = document.getElementById('rol');
  return {
    selectReadOnly: sel.matches(':read-only'),
    fondoSelect: getComputedStyle(sel).backgroundColor,
    fondoInput: getComputedStyle(document.getElementById('reg-correo')).backgroundColor,
  };
}

// 3) D-01 en /epi/reportes?rol=epi: elegir sección 1, estudiante 1000 y cambiar el mes al año anterior.
export async function d01() {
  const esp = (ms) => new Promise((r) => setTimeout(r, ms));
  const setVal = (el, v) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  setVal(document.getElementById('epi-seccion'), '1');
  await esp(800);
  const est = document.getElementById('epi-estudiante');
  setVal(est, '1000');
  setVal(document.getElementById('epi-mes'), `${new Date().getFullYear() - 1}-05`);
  await esp(900);
  return { valor: est.value, visible: est.options[est.selectedIndex].text };
  // Resultado observado: { valor: "", visible: "Todos (30)" } + aviso «Cambió los filtros…»
}
