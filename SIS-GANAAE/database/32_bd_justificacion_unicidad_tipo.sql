-- 32: Justificación de ausencias: una justificación por registro de asistencia,
--     tipos válidos (medica | personal | institucional) y documento adjunto opcional.
-- Ejecutar después de 31_bd_validacion_suspension_solapamiento.sql

-- 1. Documento adjunto opcional (renombra la columna legacy "documento")
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'justificacion' AND column_name = 'documento'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'justificacion' AND column_name = 'documento_adjunto'
  ) THEN
    ALTER TABLE justificacion RENAME COLUMN documento TO documento_adjunto;
  END IF;
END $$;

ALTER TABLE justificacion
  ADD COLUMN IF NOT EXISTS documento_adjunto VARCHAR(500);

ALTER TABLE justificacion
  ALTER COLUMN documento_adjunto TYPE VARCHAR(500),
  ALTER COLUMN documento_adjunto DROP NOT NULL;

UPDATE justificacion SET documento_adjunto = NULL WHERE TRIM(COALESCE(documento_adjunto, '')) = '';

-- 2. Normalizar tipos legacy y restringir a los tres tipos vigentes
UPDATE justificacion
SET tipo_justificacion = 'personal'
WHERE tipo_justificacion NOT IN ('medica', 'personal', 'institucional');

ALTER TABLE justificacion
  DROP CONSTRAINT IF EXISTS chk_justificacion_tipo;

ALTER TABLE justificacion
  ADD CONSTRAINT chk_justificacion_tipo
  CHECK (tipo_justificacion IN ('medica', 'personal', 'institucional'));

-- 3. Unicidad: una sola justificación por registro de asistencia
--    (si existen duplicados se conserva la más reciente)
DELETE FROM justificacion j
USING justificacion j2
WHERE j.id_asistencia = j2.id_asistencia
  AND j.id_justificacion < j2.id_justificacion;

ALTER TABLE justificacion
  DROP CONSTRAINT IF EXISTS uq_justificacion_asistencia;

ALTER TABLE justificacion
  ADD CONSTRAINT uq_justificacion_asistencia UNIQUE (id_asistencia);
