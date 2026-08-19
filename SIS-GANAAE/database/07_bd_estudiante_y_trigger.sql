-- 07: Rol estudiante en tipo_rol y trigger UsuarioSistema solo para quienes acceden al sistema
-- Los únicos que acceden: administrador, profesor, padre_de_familia (tutor legal). Los estudiantes no.

-- 1. Añadir 'estudiante' al ENUM tipo_rol (si no existe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'tipo_rol' AND e.enumlabel = 'estudiante') THEN
        ALTER TYPE tipo_rol ADD VALUE 'estudiante';
    END IF;
END
$$;

-- 2. Reemplazar trigger: crear UsuarioSistema solo para administrador, profesor y padre_de_familia
CREATE OR REPLACE FUNCTION tr_crear_usuario_sistema()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.nombre_rol IN ('administrador', 'profesor', 'padre_de_familia') THEN
        INSERT INTO UsuarioSistema (persona_id, contrasena_hash, primer_login, activo)
        VALUES (NEW.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe; solo actualizamos la función (no es necesario volver a crear el trigger).
