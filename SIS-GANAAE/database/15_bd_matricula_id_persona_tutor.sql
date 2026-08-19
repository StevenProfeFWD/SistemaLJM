-- Tutor responsable por año lectivo (matrícula anual)
-- Ejecutar después de despliegues previos. Backfill desde último encargado vinculado al estudiante.

ALTER TABLE matricula
  ADD COLUMN IF NOT EXISTS id_persona_tutor INT REFERENCES persona(id_persona);

UPDATE matricula m
SET id_persona_tutor = sub.id_enc
FROM (
  SELECT
    m2.id_matricula,
    (
      SELECT ee.id_persona_encargado
      FROM encargado_estudiante ee
      WHERE ee.id_persona_estudiante = m2.id_persona_estudiante
      ORDER BY ee.fecha DESC
      LIMIT 1
    ) AS id_enc
  FROM matricula m2
) sub
WHERE m.id_matricula = sub.id_matricula
  AND m.id_persona_tutor IS NULL
  AND sub.id_enc IS NOT NULL;

-- Si aún hay NULL (sin encargado histórico), completar manualmente antes del NOT NULL:
--   UPDATE matricula SET id_persona_tutor = <id_persona del tutor> WHERE id_matricula = ...;
ALTER TABLE matricula
  ALTER COLUMN id_persona_tutor SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matricula_tutor ON matricula(id_persona_tutor);
