-- 16: Unificación de nombre en Persona
-- Estrategia segura: agrega nombre_completo y migra datos existentes.
-- Se mantienen columnas antiguas (nombre, apellido1, apellido2) por compatibilidad temporal.

ALTER TABLE Persona
ADD COLUMN IF NOT EXISTS nombre_completo VARCHAR(255);

UPDATE Persona
SET nombre_completo = TRIM(CONCAT_WS(' ', nombre, apellido1, apellido2))
WHERE (nombre_completo IS NULL OR nombre_completo = '');

ALTER TABLE Persona
ALTER COLUMN nombre_completo SET NOT NULL;

