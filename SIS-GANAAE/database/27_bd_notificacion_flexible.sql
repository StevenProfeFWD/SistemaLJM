-- 27: Flexibiliza Notificacion para eventos de orientación (sin asistencia obligatoria)
-- Ejecutar después de 08_bd_enum_estados_tipos.sql

ALTER TABLE notificacion
  ALTER COLUMN id_asistencia DROP NOT NULL;

ALTER TABLE notificacion
  ADD COLUMN IF NOT EXISTS id_estado_periodo INT
  REFERENCES estado_estudiante_periodo(id_estado_periodo) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notificacion_estado_periodo
  ON notificacion(id_estado_periodo);
