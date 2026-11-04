-- 33: Auditoría de quién registra cada justificación
-- Ejecutar después de 32_bd_justificacion_unicidad_tipo.sql

ALTER TABLE justificacion
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE justificacion
  ADD COLUMN IF NOT EXISTS created_by INT REFERENCES persona(id_persona);

CREATE INDEX IF NOT EXISTS idx_justificacion_fecha_ingreso
  ON justificacion (fecha_ingreso);

CREATE INDEX IF NOT EXISTS idx_justificacion_tipo
  ON justificacion (tipo_justificacion);
