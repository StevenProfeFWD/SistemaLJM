-- 30: Índices compuestos de alto impacto (cupos, listados, rol, asistencia)
-- Acelera triggers de cupo, filtros por sección, catálogo de personas y consultas de asistencia.

CREATE INDEX IF NOT EXISTS idx_matricula_curso_seccion_estado
ON matricula (id_curso_lectivo, id_seccion, estado);

CREATE INDEX IF NOT EXISTS idx_matricula_seccion
ON matricula (id_seccion);

CREATE INDEX IF NOT EXISTS idx_persona_rol_activo
ON persona (nombre_rol, activo);

CREATE INDEX IF NOT EXISTS idx_asistencia_fecha
ON asistencia (fecha);
