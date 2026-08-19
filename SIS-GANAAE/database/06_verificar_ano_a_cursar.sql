-- Script para verificar que la columna ano_a_cursar existe

-- Verificar si el tipo ENUM existe
SELECT typname, typtype 
FROM pg_type 
WHERE typname = 'ano_a_cursar';

-- Verificar si la columna existe en la tabla
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'matricula' 
AND column_name = 'ano_a_cursar';

-- Mostrar estructura de la tabla Matricula
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'matricula'
ORDER BY ordinal_position;
