-- 34: Rol EPI (Equipo de Permanencia Estudiantil) — reportes de asistencia
-- Ejecutar después de 25.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_rol' AND e.enumlabel = 'epi'
  ) THEN
    ALTER TYPE tipo_rol ADD VALUE 'epi';
  END IF;
END
$$;

-- UsuarioSistema automático también para el rol EPI
CREATE OR REPLACE FUNCTION tr_crear_usuario_sistema()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nombre_rol IN (
    'administrador',
    'profesor',
    'padre_de_familia',
    'orientador',
    'super_administrador',
    'epi'
  ) THEN
    INSERT INTO UsuarioSistema (persona_id, contrasena_hash, primer_login, activo)
    VALUES (NEW.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE)
    ON CONFLICT (persona_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
