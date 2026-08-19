-- ============================================================================
-- SIS-GANAAE - Schema definitivo PostgreSQL
-- Generado por consolidación de scripts database/*.sql (32 archivos físicos).
-- Nota: existen numeraciones duplicadas 15_* y 21_*, por eso el total físico
--       supera los 31 scripts esperados en el enunciado.
--
-- Objetivo:
--   - Crear el esquema final idempotente para instalación limpia.
--   - Preservar nombres de tablas, columnas, tipos y restricciones usadas por
--     el backend actual.
--   - No incluir seeds de prueba ni scripts de verificación.
--   - Incluir catálogo técnico fijo de lecciones porque es requerido por la app.
-- ============================================================================

-- ============================================================================
-- 1. Extensiones
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. Tipos personalizados / ENUMs
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_rol') THEN
    CREATE TYPE tipo_rol AS ENUM (
      'administrador',
      'profesor',
      'padre_de_familia',
      'estudiante',
      'orientador',
      'super_administrador'
    );
  END IF;
END $$;

ALTER TYPE tipo_rol ADD VALUE IF NOT EXISTS 'administrador';
ALTER TYPE tipo_rol ADD VALUE IF NOT EXISTS 'profesor';
ALTER TYPE tipo_rol ADD VALUE IF NOT EXISTS 'padre_de_familia';
ALTER TYPE tipo_rol ADD VALUE IF NOT EXISTS 'estudiante';
ALTER TYPE tipo_rol ADD VALUE IF NOT EXISTS 'orientador';
ALTER TYPE tipo_rol ADD VALUE IF NOT EXISTS 'super_administrador';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_matricula') THEN
    CREATE TYPE tipo_matricula AS ENUM ('nuevo_ingreso', 'regular', 'traslado');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ano_a_cursar') THEN
    CREATE TYPE ano_a_cursar AS ENUM ('septimo', 'octavo', 'noveno', 'decimo', 'undecimo');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_matricula') THEN
    CREATE TYPE estado_matricula AS ENUM ('pendiente', 'activa', 'cancelada', 'graduado');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asistencia') THEN
    CREATE TYPE estado_asistencia AS ENUM ('presente', 'ausente', 'justificado', 'tardanza');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_envio_notificacion') THEN
    CREATE TYPE estado_envio_notificacion AS ENUM ('pendiente', 'enviado', 'fallido');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_justificacion_enum') THEN
    CREATE TYPE tipo_justificacion_enum AS ENUM ('medica', 'personal', 'familiar', 'otro');
  END IF;
END $$;

-- ============================================================================
-- 3. Tablas base / independientes
-- ============================================================================
CREATE TABLE IF NOT EXISTS persona (
  id_persona SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(255) NOT NULL,
  cedula VARCHAR(255) NOT NULL UNIQUE,
  correo VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(255) NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  nombre_rol tipo_rol NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INT REFERENCES persona(id_persona),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS curso_lectivo (
  id_curso_lectivo SERIAL PRIMARY KEY,
  anio_curso_lectivo INT NOT NULL
);

CREATE TABLE IF NOT EXISTS materia (
  id_materia SERIAL PRIMARY KEY,
  nombre_materia VARCHAR(255) NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS leccion (
  id_leccion SMALLINT PRIMARY KEY,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  es_recreo_almuerzo BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- 4. Tablas dependientes por jerarquía de claves foráneas
-- ============================================================================
CREATE TABLE IF NOT EXISTS usuariosistema (
  id_usuario SERIAL PRIMARY KEY,
  persona_id INT NOT NULL UNIQUE REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION,
  contrasena_hash VARCHAR(255) NOT NULL DEFAULT crypt('liceomarti', gen_salt('bf')),
  primer_login BOOLEAN DEFAULT TRUE,
  fecha_registro TIMESTAMP DEFAULT NOW(),
  activo BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INT REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS seccion (
  id_seccion SERIAL PRIMARY KEY,
  numero_seccion INT NOT NULL,
  nombre_seccion VARCHAR(25) NOT NULL,
  id_persona_profesor_guia INT REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS profesor_materia_habilitacion (
  id_profesor_materia_habilitacion SERIAL PRIMARY KEY,
  id_persona_profesor INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_materia INT NOT NULL REFERENCES materia(id_materia) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT uq_profesor_materia_habilitacion UNIQUE (id_persona_profesor, id_materia)
);

CREATE TABLE IF NOT EXISTS profesor_materia_seccion (
  id_profesor_materia_seccion SERIAL PRIMARY KEY,
  id_persona_profesor INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  curso_lectivo INT NOT NULL REFERENCES curso_lectivo(id_curso_lectivo) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_materia INT NOT NULL REFERENCES materia(id_materia) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_seccion INT NOT NULL REFERENCES seccion(id_seccion) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT uq_profesor_materia_seccion UNIQUE (id_persona_profesor, curso_lectivo, id_materia, id_seccion)
);

CREATE TABLE IF NOT EXISTS horarioasignacion (
  id_horario SERIAL PRIMARY KEY,
  id_profesor_materia_seccion INT NOT NULL REFERENCES profesor_materia_seccion(id_profesor_materia_seccion) ON UPDATE NO ACTION ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 1 AND dia_semana <= 7),
  id_leccion SMALLINT NOT NULL REFERENCES leccion(id_leccion) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT uq_horarioasignacion_pms_dia_leccion UNIQUE (id_profesor_materia_seccion, dia_semana, id_leccion)
);

CREATE TABLE IF NOT EXISTS sustitucion (
  id_sustitucion SERIAL PRIMARY KEY,
  id_profesor_materia_seccion INT NOT NULL REFERENCES profesor_materia_seccion(id_profesor_materia_seccion) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_persona_sustituto INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS matricula (
  id_matricula SERIAL PRIMARY KEY,
  id_curso_lectivo INT NOT NULL REFERENCES curso_lectivo(id_curso_lectivo) ON UPDATE NO ACTION ON DELETE CASCADE,
  fecha_matricula DATE NOT NULL,
  estado VARCHAR(50) NOT NULL,
  id_persona_estudiante INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_seccion INT REFERENCES seccion(id_seccion) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_materia INT REFERENCES materia(id_materia) ON UPDATE NO ACTION ON DELETE CASCADE,
  horario VARCHAR(255) NOT NULL,
  tipo_matricula tipo_matricula,
  fecha_ratificacion DATE,
  viene_de_otro_colegio BOOLEAN DEFAULT FALSE,
  colegio_anterior VARCHAR(255),
  ano_a_cursar ano_a_cursar,
  estado_enum estado_matricula,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INT REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION,
  id_persona_tutor INT REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS encargado_estudiante (
  id_encargado_estudiante SERIAL PRIMARY KEY,
  id_persona_estudiante INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_persona_encargado INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  fecha DATE NOT NULL,
  patria_potestad BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS asistencia (
  id_asistencia SERIAL PRIMARY KEY,
  fecha_hora TIMESTAMP NOT NULL DEFAULT NOW(),
  estado VARCHAR(50) NOT NULL,
  observacion TEXT,
  id_persona_estudiante INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_profesor_materia_seccion INT NOT NULL REFERENCES profesor_materia_seccion(id_profesor_materia_seccion) ON UPDATE NO ACTION ON DELETE CASCADE,
  fecha DATE NOT NULL,
  estado_enum estado_asistencia,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INT REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT uq_asistencia_estudiante_asignacion_fecha UNIQUE (id_persona_estudiante, id_profesor_materia_seccion, fecha)
);

CREATE TABLE IF NOT EXISTS justificacion (
  id_justificacion SERIAL PRIMARY KEY,
  tipo_justificacion VARCHAR(255) NOT NULL,
  descripcion TEXT NOT NULL,
  fecha_ingreso DATE NOT NULL,
  documento VARCHAR(255) NOT NULL,
  id_asistencia INT NOT NULL REFERENCES asistencia(id_asistencia) ON UPDATE NO ACTION ON DELETE CASCADE,
  tipo_justificacion_enum tipo_justificacion_enum
);

CREATE TABLE IF NOT EXISTS estado_estudiante_periodo (
  id_estado_periodo SERIAL PRIMARY KEY,
  id_persona_estudiante INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE NO ACTION,
  tipo_estado VARCHAR(50) NOT NULL CHECK (tipo_estado IN ('suspension', 'permiso_institucional', 'expulsion')),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  motivo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comentario_seguimiento_guia (
  id_comentario SERIAL PRIMARY KEY,
  id_estado_periodo INT NOT NULL REFERENCES estado_estudiante_periodo(id_estado_periodo) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_persona_profesor INT NOT NULL REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE CASCADE,
  comentario TEXT NOT NULL,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificacion (
  id_notificacion SERIAL PRIMARY KEY,
  medio_comunicacion VARCHAR(255) NOT NULL,
  fecha_envio TIMESTAMP NOT NULL DEFAULT NOW(),
  estado_envio VARCHAR(50) NOT NULL,
  observacion VARCHAR(255) NOT NULL,
  id_encargado_estudiante INT NOT NULL REFERENCES encargado_estudiante(id_encargado_estudiante) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_asistencia INT REFERENCES asistencia(id_asistencia) ON UPDATE NO ACTION ON DELETE CASCADE,
  estado_envio_enum estado_envio_notificacion,
  id_estado_periodo INT REFERENCES estado_estudiante_periodo(id_estado_periodo) ON UPDATE NO ACTION ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS horarioseccion (
  id_horario_seccion SERIAL PRIMARY KEY,
  id_curso_lectivo INT NOT NULL REFERENCES curso_lectivo(id_curso_lectivo) ON UPDATE NO ACTION ON DELETE CASCADE,
  id_seccion INT NOT NULL REFERENCES seccion(id_seccion) ON UPDATE NO ACTION ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 1 AND dia_semana <= 5),
  hora_entrada TIME NOT NULL,
  hora_salida TIME NOT NULL,
  CONSTRAINT uq_horarioseccion_curso_seccion_dia UNIQUE (id_curso_lectivo, id_seccion, dia_semana)
);

CREATE TABLE IF NOT EXISTS jwt_revocado (
  jti VARCHAR(64) PRIMARY KEY,
  id_persona INTEGER REFERENCES persona(id_persona) ON UPDATE NO ACTION ON DELETE SET NULL,
  revocado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_en TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- 5. Catálogo técnico requerido por la aplicación
-- ============================================================================
INSERT INTO leccion (id_leccion, hora_inicio, hora_fin, es_recreo_almuerzo) VALUES
  (1, '07:00:00', '07:40:00', FALSE),
  (2, '07:40:00', '08:20:00', FALSE),
  (3, '08:35:00', '09:15:00', FALSE),
  (4, '09:15:00', '09:55:00', FALSE),
  (5, '10:00:00', '10:40:00', FALSE),
  (6, '10:40:00', '11:20:00', FALSE),
  (7, '11:20:00', '12:00:00', TRUE),
  (8, '12:00:00', '12:40:00', FALSE),
  (9, '12:40:00', '13:20:00', FALSE),
  (10, '13:20:00', '14:00:00', FALSE),
  (11, '14:10:00', '14:50:00', FALSE),
  (12, '14:50:00', '15:30:00', FALSE),
  (13, '15:40:00', '16:20:00', FALSE),
  (14, '16:20:00', '17:00:00', FALSE),
  (15, '17:00:00', '17:40:00', FALSE)
ON CONFLICT (id_leccion) DO UPDATE SET
  hora_inicio = EXCLUDED.hora_inicio,
  hora_fin = EXCLUDED.hora_fin,
  es_recreo_almuerzo = EXCLUDED.es_recreo_almuerzo;

-- ============================================================================
-- 6. Índices
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_matricula_tipo ON matricula(tipo_matricula);
CREATE INDEX IF NOT EXISTS idx_matricula_estudiante ON matricula(id_persona_estudiante);
CREATE INDEX IF NOT EXISTS idx_matricula_curso_lectivo ON matricula(id_curso_lectivo);
CREATE INDEX IF NOT EXISTS idx_matricula_tutor ON matricula(id_persona_tutor);
CREATE INDEX IF NOT EXISTS idx_matricula_curso_seccion_estado ON matricula(id_curso_lectivo, id_seccion, estado);
CREATE INDEX IF NOT EXISTS idx_matricula_seccion ON matricula(id_seccion);

CREATE INDEX IF NOT EXISTS idx_persona_rol_activo ON persona(nombre_rol, activo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_materia_nombre_lower_trim ON materia (lower(trim(both from nombre_materia)));

CREATE INDEX IF NOT EXISTS idx_pmh_profesor ON profesor_materia_habilitacion(id_persona_profesor);
CREATE INDEX IF NOT EXISTS idx_horario_asignacion_pms ON horarioasignacion(id_profesor_materia_seccion);
CREATE INDEX IF NOT EXISTS idx_horarioasignacion_leccion ON horarioasignacion(id_leccion);
CREATE INDEX IF NOT EXISTS idx_sustitucion_pms ON sustitucion(id_profesor_materia_seccion);
CREATE INDEX IF NOT EXISTS idx_horarioseccion_curso_seccion ON horarioseccion(id_curso_lectivo, id_seccion);
CREATE INDEX IF NOT EXISTS idx_seccion_profesor_guia ON seccion(id_persona_profesor_guia);

CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON asistencia(fecha);

CREATE INDEX IF NOT EXISTS idx_estado_estudiante_periodo_estudiante ON estado_estudiante_periodo(id_persona_estudiante);
CREATE INDEX IF NOT EXISTS idx_estado_estudiante_periodo_fechas ON estado_estudiante_periodo(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_estado_estudiante_suspension_estudiante_fechas
  ON estado_estudiante_periodo(id_persona_estudiante, fecha_inicio, fecha_fin)
  WHERE tipo_estado = 'suspension';

CREATE INDEX IF NOT EXISTS idx_comentario_seguimiento_estado ON comentario_seguimiento_guia(id_estado_periodo);
CREATE INDEX IF NOT EXISTS idx_notificacion_estado_periodo ON notificacion(id_estado_periodo);
CREATE INDEX IF NOT EXISTS idx_jwt_revocado_expira_en ON jwt_revocado(expira_en);

-- ============================================================================
-- 7. Funciones y triggers
-- ============================================================================
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
    INSERT INTO usuariosistema (persona_id, contrasena_hash, primer_login, activo)
    VALUES (NEW.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE)
    ON CONFLICT (persona_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crear_usuario_sistema ON persona;
CREATE TRIGGER trigger_crear_usuario_sistema
AFTER INSERT ON persona
FOR EACH ROW
EXECUTE FUNCTION tr_crear_usuario_sistema();

CREATE OR REPLACE FUNCTION tr_actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_persona_updated_at ON persona;
CREATE TRIGGER trigger_persona_updated_at
BEFORE UPDATE ON persona
FOR EACH ROW
EXECUTE FUNCTION tr_actualizar_updated_at();

DROP TRIGGER IF EXISTS trigger_usuariosistema_updated_at ON usuariosistema;
CREATE TRIGGER trigger_usuariosistema_updated_at
BEFORE UPDATE ON usuariosistema
FOR EACH ROW
EXECUTE FUNCTION tr_actualizar_updated_at();

DROP TRIGGER IF EXISTS trigger_matricula_updated_at ON matricula;
CREATE TRIGGER trigger_matricula_updated_at
BEFORE UPDATE ON matricula
FOR EACH ROW
EXECUTE FUNCTION tr_actualizar_updated_at();

DROP TRIGGER IF EXISTS trigger_asistencia_updated_at ON asistencia;
CREATE TRIGGER trigger_asistencia_updated_at
BEFORE UPDATE ON asistencia
FOR EACH ROW
EXECUTE FUNCTION tr_actualizar_updated_at();

CREATE OR REPLACE FUNCTION tr_matricula_max_por_seccion()
RETURNS TRIGGER AS $$
DECLARE
  cnt INT;
BEGIN
  IF NEW.id_seccion IS NULL OR NEW.estado IS DISTINCT FROM 'activa' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COUNT(*) INTO cnt
    FROM matricula
    WHERE id_curso_lectivo = NEW.id_curso_lectivo
      AND id_seccion = NEW.id_seccion
      AND estado = 'activa'
      AND id_matricula != OLD.id_matricula;
  ELSE
    SELECT COUNT(*) INTO cnt
    FROM matricula
    WHERE id_curso_lectivo = NEW.id_curso_lectivo
      AND id_seccion = NEW.id_seccion
      AND estado = 'activa';
  END IF;

  IF cnt >= 25 THEN
    RAISE EXCEPTION 'La sección ya tiene el máximo de 25 estudiantes activos. Debe crear o asignar otra sección.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_matricula_max_por_seccion ON matricula;
CREATE TRIGGER trigger_matricula_max_por_seccion
BEFORE INSERT OR UPDATE OF id_curso_lectivo, id_seccion, estado ON matricula
FOR EACH ROW
EXECUTE FUNCTION tr_matricula_max_por_seccion();

CREATE OR REPLACE FUNCTION tr_validar_suspension_sin_solapamiento()
RETURNS TRIGGER AS $$
DECLARE
  colision RECORD;
BEGIN
  IF NEW.tipo_estado <> 'suspension' THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_fin IS NULL THEN
    RAISE EXCEPTION 'Las suspensiones requieren fecha_fin';
  END IF;

  SELECT e.id_estado_periodo, e.fecha_inicio, e.fecha_fin
  INTO colision
  FROM estado_estudiante_periodo e
  WHERE e.id_persona_estudiante = NEW.id_persona_estudiante
    AND e.tipo_estado = 'suspension'
    AND e.id_estado_periodo IS DISTINCT FROM NEW.id_estado_periodo
    AND e.fecha_inicio <= NEW.fecha_fin
    AND e.fecha_fin >= NEW.fecha_inicio
  ORDER BY e.fecha_inicio ASC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'El estudiante ya cuenta con una suspensión activa en el rango de fechas seleccionado (del % al %).',
      to_char(colision.fecha_inicio, 'DD/MM/YYYY'),
      to_char(colision.fecha_fin, 'DD/MM/YYYY')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_suspension_sin_solapamiento ON estado_estudiante_periodo;
CREATE TRIGGER trg_validar_suspension_sin_solapamiento
BEFORE INSERT OR UPDATE ON estado_estudiante_periodo
FOR EACH ROW
EXECUTE FUNCTION tr_validar_suspension_sin_solapamiento();
