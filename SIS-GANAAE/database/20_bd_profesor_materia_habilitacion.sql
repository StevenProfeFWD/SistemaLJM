-- =============================================================================
-- Habilitación docente por materia (formación / nombramiento)
-- =============================================================================
--
-- REGLA 1 (estricta, en aplicación):
--   No se crean asignaciones nuevas (profesor_materia_seccion) si la materia
--   no está registrada en profesor_materia_habilitacion para ese docente.
--   Un docente sin ninguna fila aquí no puede recibir carga hasta que el
--   administrador registre sus materias en "Registro de personas".
--
-- PUNTO 2 (relleno inicial / migración — encaja con la regla 1):
--   Tras crear la tabla, se copian como habilitadas las materias que cada
--   docente YA tenía en profesor_materia_seccion (cualquier año lectivo).
--   Así la regla 1 no "castiga" datos históricos: quien ya tenía asignaciones
--   queda con habilitaciones coherentes sin carga manual duplicada.
--   Docentes que nunca tuvieron asignación siguen con 0 filas → aplicar regla 1
--   obliga a registrar materias antes de la primera asignación.
--
-- Ajustes posteriores: el administrador puede corregir la lista vía API/UI;
-- no se puede quitar una materia si aún existe asignación que la use.
-- =============================================================================

CREATE TABLE IF NOT EXISTS profesor_materia_habilitacion (
    id_profesor_materia_habilitacion SERIAL PRIMARY KEY,
    id_persona_profesor INT NOT NULL REFERENCES persona(id_persona) ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES materia(id_materia) ON DELETE CASCADE,
    UNIQUE (id_persona_profesor, id_materia)
);

CREATE INDEX IF NOT EXISTS idx_pmh_profesor ON profesor_materia_habilitacion(id_persona_profesor);

-- Relleno inicial (punto 2): una fila por par (docente, materia) ya presente en carga asignada.
INSERT INTO profesor_materia_habilitacion (id_persona_profesor, id_materia)
SELECT DISTINCT id_persona_profesor, id_materia
FROM profesor_materia_seccion
ON CONFLICT (id_persona_profesor, id_materia) DO NOTHING;
