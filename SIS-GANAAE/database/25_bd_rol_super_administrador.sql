-- 25: Rol super_administrador (gestión de administradores + lectura estratégica)
-- Ejecutar después de 24.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_rol' AND e.enumlabel = 'super_administrador'
  ) THEN
    ALTER TYPE tipo_rol ADD VALUE 'super_administrador';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tr_crear_usuario_sistema()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nombre_rol IN (
    'administrador',
    'profesor',
    'padre_de_familia',
    'orientador',
    'super_administrador'
  ) THEN
    INSERT INTO UsuarioSistema (persona_id, contrasena_hash, primer_login, activo)
    VALUES (NEW.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE)
    ON CONFLICT (persona_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Primer Super Administrador del sistema (contraseña inicial: liceomarti)
INSERT INTO persona (nombre_completo, cedula, correo, telefono, direccion, fecha_nacimiento, nombre_rol, activo)
SELECT
  'Super Admin Sistema Liceo',
  '100000001',
  'superadmin@liceomarti.ed.cr',
  '22223333',
  'Puntarenas, Costa Rica',
  '1980-01-15',
  'super_administrador',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM persona WHERE cedula = '100000001');

INSERT INTO usuariosistema (persona_id, contrasena_hash, primer_login, activo)
SELECT p.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE
FROM persona p
WHERE p.cedula = '100000001'
  AND NOT EXISTS (SELECT 1 FROM usuariosistema u WHERE u.persona_id = p.id_persona);
