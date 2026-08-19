-- 17: Fase final - eliminar columnas legacy de nombre
-- Ejecutar SOLO después de:
--  1) correr 16_bd_nombre_completo.sql
--  2) desplegar backend/frontend que ya usan nombre_completo

-- Normaliza posibles nombres de columna antiguos
ALTER TABLE Persona DROP COLUMN IF EXISTS primer_apellido;
ALTER TABLE Persona DROP COLUMN IF EXISTS segundo_apellido;

-- Columnas legacy usadas originalmente en este proyecto
ALTER TABLE Persona DROP COLUMN IF EXISTS nombre;
ALTER TABLE Persona DROP COLUMN IF EXISTS apellido1;
ALTER TABLE Persona DROP COLUMN IF EXISTS apellido2;

