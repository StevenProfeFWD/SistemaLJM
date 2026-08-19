/** Enlace de salto al contenido principal (WCAG 2.4.1 Bypass Blocks). */
export default function SkipToMainContent() {
  const focusMain = (e) => {
    e.preventDefault();
    const main = document.getElementById('main-content');
    if (main) {
      main.focus({ preventScroll: false });
    }
  };

  return (
    <a href="#main-content" className="skip-link" onClick={focusMain}>
      Saltar al contenido principal
    </a>
  );
}
