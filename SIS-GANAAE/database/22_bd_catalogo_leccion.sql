-- 22: Catálogo fijo de 15 lecciones (07:00–17:40) y migración de horarioasignacion.
-- Ejecutar después de 09_bd_asignacion_anual_horario_sustitucion.sql

CREATE TABLE IF NOT EXISTS leccion (
    id_leccion SMALLINT PRIMARY KEY,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    es_recreo_almuerzo BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO leccion (id_leccion, hora_inicio, hora_fin, es_recreo_almuerzo) VALUES
(1, '07:00:00', '07:40:00', FALSE),
(2, '07:40:00', '08:20:00', FALSE),
(3, '08:35:00', '09:15:00', FALSE),
(4, '09:15:00', '09:55:00', FALSE),
(5, '10:00:00', '10:40:00', FALSE),
(6, '10:40:00', '11:20:00', FALSE),
(7, '11:20:00', '12:00:00', TRUE),
(8, '12:00:00', '12:40:00', FALSE),
(9, '12:40:00', '13:20:00', FALSE),
(10, '13:20:00', '14:00:00', FALSE),
(11, '14:10:00', '14:50:00', FALSE),
(12, '14:50:00', '15:30:00', FALSE),
(13, '15:40:00', '16:20:00', FALSE),
(14, '16:20:00', '17:00:00', FALSE),
(15, '17:00:00', '17:40:00', FALSE)
ON CONFLICT (id_leccion) DO UPDATE SET
    hora_inicio = EXCLUDED.hora_inicio,
    hora_fin = EXCLUDED.hora_fin,
    es_recreo_almuerzo = EXCLUDED.es_recreo_almuerzo;

-- Migración de horarioasignacion: hora_inicio/hora_fin → id_leccion
ALTER TABLE horarioasignacion
    ADD COLUMN IF NOT EXISTS id_leccion SMALLINT REFERENCES leccion(id_leccion);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'horarioasignacion'
      AND column_name = 'hora_inicio'
  ) THEN
    UPDATE horarioasignacion ha
    SET id_leccion = l.id_leccion
    FROM leccion l
    WHERE ha.id_leccion IS NULL
      AND ha.hora_inicio = l.hora_inicio;

    UPDATE horarioasignacion
    SET id_leccion = 1
    WHERE id_leccion IS NULL;

    ALTER TABLE horarioasignacion DROP COLUMN hora_inicio;
    ALTER TABLE horarioasignacion DROP COLUMN hora_fin;
  END IF;
END $$;

UPDATE horarioasignacion
SET id_leccion = 1
WHERE id_leccion IS NULL;

DELETE FROM horarioasignacion a
USING horarioasignacion b
WHERE a.id_profesor_materia_seccion = b.id_profesor_materia_seccion
  AND a.dia_semana = b.dia_semana
  AND a.id_leccion = b.id_leccion
  AND a.id_horario > b.id_horario;

ALTER TABLE horarioasignacion
    ALTER COLUMN id_leccion SET NOT NULL;

ALTER TABLE horarioasignacion
    DROP CONSTRAINT IF EXISTS uq_horarioasignacion_pms_dia_leccion;

ALTER TABLE horarioasignacion
    ADD CONSTRAINT uq_horarioasignacion_pms_dia_leccion
    UNIQUE (id_profesor_materia_seccion, dia_semana, id_leccion);

CREATE INDEX IF NOT EXISTS idx_horarioasignacion_leccion ON horarioasignacion(id_leccion);
