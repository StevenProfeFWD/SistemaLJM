-- 10: Asistencia: un registro por estudiante por asignación por día; observación opcional
-- El profesor pasa lista una vez por día en los días que tiene la asignatura con esa sección.

-- 1. Asegurar que fecha existe y es NOT NULL (por si no se corrió 09)
ALTER TABLE Asistencia ADD COLUMN IF NOT EXISTS fecha DATE;
UPDATE Asistencia SET fecha = (fecha_hora::DATE) WHERE fecha IS NULL;
ALTER TABLE Asistencia ALTER COLUMN fecha SET NOT NULL;

-- 2. Unicidad: un estudiante solo puede tener un registro por (asignación, fecha). Si falla por duplicados, resolverlos antes.
ALTER TABLE Asistencia
ADD CONSTRAINT uq_asistencia_estudiante_asignacion_fecha
UNIQUE (id_persona_estudiante, id_profesor_materia_seccion, fecha);

-- 3. Observación opcional (puede ir vacía cuando solo se marca presente/ausente)
ALTER TABLE Asistencia ALTER COLUMN observacion DROP NOT NULL;
