-- 18: Soft delete para personas (incluye estudiantes)
ALTER TABLE Persona
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

UPDATE Persona SET activo = TRUE WHERE activo IS NULL;

ALTER TABLE Persona
ALTER COLUMN activo SET NOT NULL;

