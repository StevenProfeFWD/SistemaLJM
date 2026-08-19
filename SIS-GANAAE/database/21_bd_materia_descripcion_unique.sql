-- Catálogo de materias: descripción opcional y unicidad del nombre (insensible a mayúsculas/espacios extremos).

ALTER TABLE materia ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Un solo registro por nombre "lógico" (tras trim + minúsculas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_materia_nombre_lower_trim
  ON materia (lower(trim(both from nombre_materia)));
