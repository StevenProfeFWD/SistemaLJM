-- Script de corrección para agregar la columna ano_a_cursar si no existe
-- Ejecutar este script si el anterior falló parcialmente

-- 1. Verificar si el tipo ENUM existe, si no crearlo
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ano_a_cursar') THEN
        CREATE TYPE ano_a_cursar AS ENUM (
            'septimo',
            'octavo',
            'noveno',
            'decimo',
            'undecimo'
        );
    END IF;
END $$;

-- 2. Verificar si la columna existe, si no agregarla
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'matricula' 
        AND column_name = 'ano_a_cursar'
    ) THEN
        ALTER TABLE Matricula 
        ADD COLUMN ano_a_cursar ano_a_cursar;
    END IF;
END $$;

-- 3. Verificar que id_seccion e id_materia no sean NOT NULL (ya que ahora son opcionales)
ALTER TABLE Matricula 
ALTER COLUMN id_seccion DROP NOT NULL;

ALTER TABLE Matricula 
ALTER COLUMN id_materia DROP NOT NULL;
