-- 31: Validación de suspensiones sin solapamiento por estudiante
-- Ejecutar después de 24_bd_rol_orientador_estado_periodo.sql

CREATE INDEX IF NOT EXISTS idx_estado_estudiante_suspension_estudiante_fechas
  ON estado_estudiante_periodo (id_persona_estudiante, fecha_inicio, fecha_fin)
  WHERE tipo_estado = 'suspension';

CREATE OR REPLACE FUNCTION tr_validar_suspension_sin_solapamiento()
RETURNS TRIGGER AS $$
DECLARE
  colision RECORD;
BEGIN
  IF NEW.tipo_estado <> 'suspension' THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_fin IS NULL THEN
    RAISE EXCEPTION 'Las suspensiones requieren fecha_fin';
  END IF;

  SELECT e.id_estado_periodo, e.fecha_inicio, e.fecha_fin
  INTO colision
  FROM estado_estudiante_periodo e
  WHERE e.id_persona_estudiante = NEW.id_persona_estudiante
    AND e.tipo_estado = 'suspension'
    AND e.id_estado_periodo IS DISTINCT FROM NEW.id_estado_periodo
    AND e.fecha_inicio <= NEW.fecha_fin
    AND e.fecha_fin >= NEW.fecha_inicio
  ORDER BY e.fecha_inicio ASC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'El estudiante ya cuenta con una suspensión activa en el rango de fechas seleccionado (del % al %).',
      to_char(colision.fecha_inicio, 'DD/MM/YYYY'),
      to_char(colision.fecha_fin, 'DD/MM/YYYY')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_suspension_sin_solapamiento ON estado_estudiante_periodo;

CREATE TRIGGER trg_validar_suspension_sin_solapamiento
  BEFORE INSERT OR UPDATE ON estado_estudiante_periodo
  FOR EACH ROW
  EXECUTE FUNCTION tr_validar_suspension_sin_solapamiento();
