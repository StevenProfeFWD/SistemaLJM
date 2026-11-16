# Revisión de correcciones del frontend (SIS-GANAAE)

Fecha: 14/11/2026 · Alcance: correcciones sin confirmar de la ronda de QA (D-01, D-02, D-03/D-12, D-04, `lang`/título, `--ring`, select, menú móvil, `mapApiError`).
Restricciones respetadas: no se modificó código de la app ni pruebas existentes; API siempre simulada (ningún backend/BD real); servidor de vista previa solo en el puerto 5199 y detenido al final; nada se confirmó en git.

## 1. Ciclos ejecutados

| Ciclo | Qué se ejecutó | Archivos | Pruebas | Pasan | Fallan | Notas |
|---|---|---|---|---|---|---|
| 1 | Suite completa existente (`npx vitest run`) | 17 | 288 | 286 | 2 | Las 2 fallas son umbrales de tiempo de `tests/rendimiento/render-grande.test.jsx` |
| 1b | `tests/rendimiento` aislado | 1 | 4 | 2 | 2 | Siguen fallando por tiempo (2212 ms vs 1500; 314 ms vs 300) con las suites de backend corriendo a la vez → ambiental, igual que en el informe de QA (§5.3). La prueba con React Profiler (memo de `TablaConteo`) pasa. |
| 2 | Pruebas nuevas `tests/revision` | 4 | 40 | 39 | 1 | La falla es el `[HALLAZGO]` R-01 (esperada) |
| 3 | Suite completa con las pruebas nuevas | 21 | 328 | 325 | 3 | 2 umbrales de tiempo (ambientales) + `[HALLAZGO]` R-01; sin regresiones en las 288 pruebas previas (209 s) |

## 2. Lint y build

- `npx eslint` sobre los 13 archivos tocados (ReportesAsistenciaEpi, RegistroPersonas, AlertDialog, form-control-styles, select, mainBar, errors, SidebarAdmin, Routing, InicioAdmin, PanelOrientador, rutasPorRol, epiServices): **0 errores, 0 advertencias**.
- `npx vite build` en `frontend-reactjs`: **correcto** (built in 17.9 s; salida en `dist/`, no confirmada).

## 3. Comprobaciones en navegador (Chromium del panel, Vite :5199, API simulada `navegador/apiSimulada.js`)

| Comprobación | Resultado |
|---|---|
| `document.documentElement.lang` / `document.title` | `es` / «SIS-GANAAE · Sistema de Asistencias Estudiantiles» ✔ |
| D-01 en `/epi/reportes`: sección 1 → estudiante 1000 → mes del año anterior | `value=""`, visible «Todos (30)», aparece el aviso «Cambió los filtros…» ✔ |
| D-04: «Descargar PDF» (escenario vacío) → diálogo «Sin datos» | Foco en «Entendido», `aria-describedby` apunta al mensaje, Tab/Tab/Shift+Tab se quedan en «Entendido», Escape cierra y el foco vuelve a «Descargar PDF» con `:focus-visible` ✔ |
| Anillo de foco del botón primario (fondo blanco) | Visible (anillo gris oscuro al 50 %) ✔ |
| Enlaces dentro de las tarjetas oscuras de `/inicio` (admin, `bg-slate-900`) | `outline-color` = mismo color que la tarjeta, pero Chromium dibuja `outline:auto` con anillo blanco exterior → **visible en Chrome** (ver Riesgos) |
| `/registro`: selects vs inputs | El `<select>` sigue coincidiendo con `:read-only`, pero su fondo es igual al de los inputs (`oklch(0.968 …)`) ✔. Las 7 etiquetas tienen `for` → id existente, sin ids duplicados. «Guardar» vacío: validación nativa marca los 7 campos `:invalid` y enfoca la cédula ✔ |
| Menú móvil a 1280 px | visible, `translate: 0px`, 16 enlaces ✔ |
| Menú móvil a 414 / 1023 px cerrado | `visibility: hidden` (enlaces fuera del orden de tabulación) ✔ |
| Menú móvil: animación al abrir/cerrar | `transition-property: transform, visibility`; `getAnimations()` solo muestra una transición de **visibility**, ninguna de `translate` → **el deslizamiento ya no se anima** (R-01) ✘ |

Script de consola reutilizable: `pruebas/frontend/navegador/revision/comprobaciones-navegador.js`.

## 4. Pruebas nuevas (`pruebas/frontend/tests/revision/`)

- `dialogo-alerta.test.jsx` (8): foco inicial, descripción accesible, trampa Tab/Shift+Tab, devolución del foco con clic y con Escape, dos avisos encadenados, cambio de identidad de `onClose` con el diálogo abierto, sin `aria-describedby` cuando no hay mensaje, disparador desmontado.
- `registro-personas.test.jsx` (9): etiquetas asociadas, submit real, validación propia con espacios (role=alert), Enter envía una vez, Enter en cédula editada no envía (nombre limpiado), grupo «Materias habilitadas» con nombre accesible y envío de materias, casillas con nombre, cédula interna (botón deshabilitado y Enter no envía), sin doble envío mientras guarda.
- `estilos-menu-errores.test.jsx` (16): Select sin `read-only:`, Input/Textarea lo conservan, ningún `<Select readOnly>` en la app, contraste del `--ring` sobre blanco ≥ 3:1, `--ring` oscuro intacto, `lang`/título, clases del menú móvil abierto/cerrado, **[HALLAZGO] R-01**, 6 casos de `mapApiError`.
- `epi-revision.test.jsx` (7): columna «Otros» con igual número de celdas en todas las filas (cabecera, secciones, materias expandidas, total), ausencia sin otros, la tabla memoizada se actualiza al regenerar, estudiante conservado si existe en el nuevo año, limpieza si falla la carga, dos `[OBSERVACIÓN]`.

## 5. Hallazgos

### R-01 · Baja · El menú lateral móvil perdió la animación de deslizamiento
- **Archivo:** `frontend-reactjs/src/components/side-bar/mainBar.jsx:153`
- **Causa:** en Tailwind 4 `-translate-x-full` / `translate-x-0` usan la propiedad CSS `translate` (no `transform`). Antes `transition-transform` generaba `transition-property: transform, translate, scale, rotate`; ahora `transition-[transform,visibility]` genera `transform,visibility`, sin `translate`.
- **Reproducción:** ancho < 1024 px, abrir/cerrar el menú; o en consola `getComputedStyle(nav).transitionProperty` y `nav.getAnimations()` justo tras abrir (solo aparece `visibility`). CSS compilado comprobado en `/src/index.css` del servidor de pruebas.
- **Esperado:** el panel se desliza 200 ms al abrir y cerrar. **Actual:** aparece/desaparece de golpe (el `invisible` en sí funciona bien).
- **Sugerencia:** `transition-[translate,visibility]` (o `transition-[transform,translate,visibility]`).
- **Prueba:** `estilos-menu-errores.test.jsx` › `[HALLAZGO] la transición debe incluir la propiedad CSS translate…` (falla).

Sin hallazgos en: AlertDialog/DialogContext, RegistroPersonas, Select/estilos, `index.html`, `mapApiError`, EPI (D-01, D-02, TablaConteo).

## 6. Observaciones y riesgos (no son regresiones de estas correcciones)

1. **`--ring` en fondos oscuros:** el nuevo color es exactamente `slate-900`, el fondo de las tarjetas de `InicioAdmin` (`pages/admin/InicioAdmin.jsx:86-101`). En Chromium se ve gracias al anillo blanco de `outline:auto`; en navegadores que pinten `outline:auto` solo con `outline-color` (p. ej. Firefox) el foco de esos enlaces podría quedar casi invisible (contraste ≈ 1:1; antes ≈ 2.7:1). Conviene un `focus-visible:outline-white`/`ring-sky-400` en esos enlaces. El modo oscuro no cambia (`.dark` mantiene su `--ring`).
2. **ConfirmDialog no recibió las mismas mejoras** que AlertDialog (sin trampa de Tab, sin devolver el foco, sin `aria-describedby`, y su efecto depende de `onCancel` creado en cada render de `DialogProvider`, por lo que reenfoca «Cancelar» en cada render, p. ej. al aparecer un toast).
3. **Menú móvil:** al abrir, el botón «Abrir menú» se desmonta y el foco queda en `<body>`; al cerrar, el foco no vuelve a «Abrir menú». Preexistente; WCAG 2.4.3.
4. **EPI:** mientras se recarga la lista de estudiantes del nuevo año, «Generar reporte» sigue habilitado y envía el estudiante anterior (el select deshabilitado lo sigue mostrando, así que es coherente con lo visible; al llegar la lista se limpia y aparece el aviso amarillo). Las tarjetas de resumen no incluyen «Otros», por lo que su suma no cuadra con «Total de registros» cuando hay otros.
5. **`mapApiError`:** «Network Error» y «timeout of N ms exceeded» de axios siguen mostrándose en inglés.
6. **RegistroPersonas:** los mensajes de la validación nativa salen en el idioma del navegador; la regla «al menos una materia» para docentes no se valida en el cliente (depende del backend).
7. **Rendimiento jsdom:** los 2 umbrales de `render-grande` fallan de forma persistente bajo carga concurrente (ambiental, ya documentado); en Chromium no se observó lentitud.
