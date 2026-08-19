-- 24: Rol orientador + tabla estado_estudiante_periodo (exclusiones / permisos)
-- Ejecutar después de 07 (trigger UsuarioSistema) y antes o después de 23 (datos prueba).

-- 1. Añadir 'orientador' al ENUM tipo_rol
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_rol' AND e.enumlabel = 'orientador'
  ) THEN
    ALTER TYPE tipo_rol ADD VALUE 'orientador';
  END IF;
END
$$;

-- 2. UsuarioSistema también para orientadores
CREATE OR REPLACE FUNCTION tr_crear_usuario_sistema()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nombre_rol IN ('administrador', 'profesor', 'padre_de_familia', 'orientador') THEN
    INSERT INTO UsuarioSistema (persona_id, contrasena_hash, primer_login, activo)
    VALUES (NEW.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE)
    ON CONFLICT (persona_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Estados especiales de estudiantes por periodo
CREATE TABLE IF NOT EXISTS estado_estudiante_periodo (
  id_estado_periodo SERIAL PRIMARY KEY,
  id_persona_estudiante INT NOT NULL REFERENCES Persona(id_persona),
  tipo_estado VARCHAR(50) NOT NULL CHECK (
    tipo_estado IN ('suspension', 'permiso_institucional', 'expulsion')
  ),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  motivo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estado_estudiante_periodo_estudiante
  ON estado_estudiante_periodo (id_persona_estudiante);

CREATE INDEX IF NOT EXISTS idx_estado_estudiante_periodo_fechas
  ON estado_estudiante_periodo (fecha_inicio, fecha_fin);

-- 4. Usuario orientador de prueba (contraseña inicial: liceomarti)
INSERT INTO persona (nombre_completo, cedula, correo, telefono, direccion, fecha_nacimiento, nombre_rol, activo)
SELECT
  'Patricia Vega Mora',
  '808880888',
  'patricia.vega@liceomarti.ed.cr',
  '88889999',
  'Puntarenas',
  '1982-06-18',
  'orientador',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM persona WHERE cedula = '808880888');

-- Credencial por si el trigger no corrió (persona ya existía)
INSERT INTO usuariosistema (persona_id, contrasena_hash, primer_login, activo)
SELECT p.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE
FROM persona p
WHERE p.cedula = '808880888'
  AND NOT EXISTS (SELECT 1 FROM usuariosistema u WHERE u.persona_id = p.id_persona);
