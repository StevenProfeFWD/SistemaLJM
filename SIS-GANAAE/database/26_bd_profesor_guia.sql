-- 26: Profesor Guía — asignación por sección y bitácora de seguimiento

ALTER TABLE seccion
  ADD COLUMN IF NOT EXISTS id_persona_profesor_guia INT REFERENCES persona(id_persona);

CREATE INDEX IF NOT EXISTS idx_seccion_profesor_guia
  ON seccion (id_persona_profesor_guia);

CREATE TABLE IF NOT EXISTS comentario_seguimiento_guia (
    id_comentario SERIAL PRIMARY KEY,
    id_estado_periodo INT NOT NULL REFERENCES estado_estudiante_periodo(id_estado_periodo) ON DELETE CASCADE,
    id_persona_profesor INT NOT NULL REFERENCES persona(id_persona) ON DELETE CASCADE,
    comentario TEXT NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comentario_seguimiento_estado
  ON comentario_seguimiento_guia (id_estado_periodo);

-- Seed opcional: María López como guía de la sección 7-1 (requiere datos de prueba)
UPDATE seccion s
SET id_persona_profesor_guia = p.id_persona
FROM persona p
WHERE s.nombre_seccion = '7-1'
  AND p.correo = 'maria.lopez@liceomarti.ed.cr'
  AND s.id_persona_profesor_guia IS NULL;
