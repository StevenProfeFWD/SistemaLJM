-- 21: Precarga masiva — permite matrícula pendiente sin tutor asignado aún.
-- Ejecutar en PostgreSQL antes de usar POST /api/matriculas/precarga-masiva.
-- tipo_matricula: se usa 'regular' con estado 'pendiente' para filas de precarga.

ALTER TABLE matricula
  ALTER COLUMN id_persona_tutor DROP NOT NULL;
