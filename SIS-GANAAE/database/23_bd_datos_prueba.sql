-- =============================================================================
-- 23: Datos de prueba consolidados (ejecutar AL FINAL de todas las migraciones)
-- Prerrequisitos: 07, 08, 09, 10, 11, 12, 16/17 (nombre_completo), 15/21 (tutor),
--                 20 (habilitación docente), 22 (catálogo leccion + id_leccion).
-- Idempotente: ON CONFLICT / WHERE NOT EXISTS en inserciones clave.
-- =============================================================================

-- 1. Curso lectivo del año actual
INSERT INTO curso_lectivo (anio_curso_lectivo)
SELECT EXTRACT(YEAR FROM CURRENT_DATE)::INT
WHERE NOT EXISTS (
  SELECT 1 FROM curso_lectivo
  WHERE anio_curso_lectivo = EXTRACT(YEAR FROM CURRENT_DATE)::INT
);

-- 2. Personas de prueba (administrador, profesores, tutores, estudiantes)
INSERT INTO persona (nombre_completo, cedula, correo, telefono, direccion, fecha_nacimiento, nombre_rol, activo)
VALUES
  ('Admin Sistema Liceo', '101110111', 'admin@liceomarti.ed.cr', '88881111', 'Puntarenas', '1990-01-01', 'administrador', TRUE),
  ('María López García', '202220222', 'maria.lopez@liceomarti.ed.cr', '88882222', 'Puntarenas', '1985-05-15', 'profesor', TRUE),
  ('Carlos Méndez Rojas', '303330333', 'carlos.mendez@liceomarti.ed.cr', '88883333', 'Puntarenas', '1988-08-20', 'profesor', TRUE),
  ('Ana Hernández Vargas', '404440444', 'ana.hernandez@correo.com', '88884444', 'Puntarenas', '1980-03-10', 'padre_de_familia', TRUE),
  ('Luis Torres Solano', '505550555', 'luis.torres@correo.com', '88885555', 'Puntarenas', '1979-11-22', 'padre_de_familia', TRUE),
  ('Sofía López Hernández', '606660666', 'sofia.est@correo.com', '88886666', 'Puntarenas', '2010-02-14', 'estudiante', TRUE),
  ('Diego Méndez Hernández', '707770777', 'diego.est@correo.com', '88887777', 'Puntarenas', '2011-04-08', 'estudiante', TRUE)
ON CONFLICT (cedula) DO NOTHING;

-- 3. Secciones
INSERT INTO seccion (numero_seccion, nombre_seccion)
SELECT 1, '7-1' WHERE NOT EXISTS (SELECT 1 FROM seccion WHERE nombre_seccion = '7-1');
INSERT INTO seccion (numero_seccion, nombre_seccion)
SELECT 2, '7-2' WHERE NOT EXISTS (SELECT 1 FROM seccion WHERE nombre_seccion = '7-2');
INSERT INTO seccion (numero_seccion, nombre_seccion)
SELECT 1, '8-1' WHERE NOT EXISTS (SELECT 1 FROM seccion WHERE nombre_seccion = '8-1');

-- 4. Materias básicas
INSERT INTO materia (nombre_materia)
SELECT 'Español' WHERE NOT EXISTS (SELECT 1 FROM materia WHERE nombre_materia = 'Español');
INSERT INTO materia (nombre_materia)
SELECT 'Matemáticas' WHERE NOT EXISTS (SELECT 1 FROM materia WHERE nombre_materia = 'Matemáticas');
INSERT INTO materia (nombre_materia)
SELECT 'Ciencias' WHERE NOT EXISTS (SELECT 1 FROM materia WHERE nombre_materia = 'Ciencias');
INSERT INTO materia (nombre_materia)
SELECT 'Estudios Sociales' WHERE NOT EXISTS (SELECT 1 FROM materia WHERE nombre_materia = 'Estudios Sociales');

-- 5. Bloque transaccional: habilitación, carga docente, horarios por lección, vínculos y matrículas
DO $$
DECLARE
  id_curso INT;
  id_sec_71 INT;
  id_esp INT;
  id_mat INT;
  id_prof_maria INT;
  id_prof_carlos INT;
  id_est_sofia INT;
  id_est_diego INT;
  id_enc_ana INT;
  id_enc_luis INT;
  id_pms1 INT;
  id_pms2 INT;
  horario_ref TEXT := 'Lunes a Viernes 7:00 am a 5:40 pm';
BEGIN
  SELECT id_curso_lectivo INTO id_curso
  FROM curso_lectivo
  WHERE anio_curso_lectivo = EXTRACT(YEAR FROM CURRENT_DATE)::INT
  LIMIT 1;

  SELECT id_seccion INTO id_sec_71 FROM seccion WHERE nombre_seccion = '7-1' LIMIT 1;
  SELECT id_materia INTO id_esp FROM materia WHERE nombre_materia = 'Español' LIMIT 1;
  SELECT id_materia INTO id_mat FROM materia WHERE nombre_materia = 'Matemáticas' LIMIT 1;

  SELECT id_persona INTO id_prof_maria FROM persona WHERE cedula = '202220222' LIMIT 1;
  SELECT id_persona INTO id_prof_carlos FROM persona WHERE cedula = '303330333' LIMIT 1;
  SELECT id_persona INTO id_est_sofia FROM persona WHERE cedula = '606660666' LIMIT 1;
  SELECT id_persona INTO id_est_diego FROM persona WHERE cedula = '707770777' LIMIT 1;
  SELECT id_persona INTO id_enc_ana FROM persona WHERE cedula = '404440444' LIMIT 1;
  SELECT id_persona INTO id_enc_luis FROM persona WHERE cedula = '505550555' LIMIT 1;

  IF id_curso IS NULL OR id_sec_71 IS NULL OR id_esp IS NULL OR id_mat IS NULL
     OR id_prof_maria IS NULL OR id_prof_carlos IS NULL THEN
    RAISE NOTICE '23_bd_datos_prueba: faltan IDs base; omitiendo asignaciones y matrículas.';
    RETURN;
  END IF;

  -- Habilitación docente (requerida por la aplicación antes de asignar carga)
  INSERT INTO profesor_materia_habilitacion (id_persona_profesor, id_materia)
  VALUES (id_prof_maria, id_esp), (id_prof_carlos, id_mat)
  ON CONFLICT (id_persona_profesor, id_materia) DO NOTHING;

  -- Carga docente (asignación anual)
  INSERT INTO profesor_materia_seccion (id_persona_profesor, curso_lectivo, id_materia, id_seccion)
  VALUES (id_prof_maria, id_curso, id_esp, id_sec_71)
  ON CONFLICT (id_persona_profesor, curso_lectivo, id_materia, id_seccion) DO NOTHING
  RETURNING id_profesor_materia_seccion INTO id_pms1;

  IF id_pms1 IS NULL THEN
    SELECT id_profesor_materia_seccion INTO id_pms1
    FROM profesor_materia_seccion
    WHERE id_persona_profesor = id_prof_maria
      AND curso_lectivo = id_curso
      AND id_materia = id_esp
      AND id_seccion = id_sec_71
    LIMIT 1;
  END IF;

  INSERT INTO profesor_materia_seccion (id_persona_profesor, curso_lectivo, id_materia, id_seccion)
  VALUES (id_prof_carlos, id_curso, id_mat, id_sec_71)
  ON CONFLICT (id_persona_profesor, curso_lectivo, id_materia, id_seccion) DO NOTHING
  RETURNING id_profesor_materia_seccion INTO id_pms2;

  IF id_pms2 IS NULL THEN
    SELECT id_profesor_materia_seccion INTO id_pms2
    FROM profesor_materia_seccion
    WHERE id_persona_profesor = id_prof_carlos
      AND curso_lectivo = id_curso
      AND id_materia = id_mat
      AND id_seccion = id_sec_71
    LIMIT 1;
  END IF;

  -- Horarios por lección fija (catálogo 22: id_leccion 1–15)
  IF id_pms1 IS NOT NULL THEN
    INSERT INTO horarioasignacion (id_profesor_materia_seccion, dia_semana, id_leccion)
    VALUES
      (id_pms1, 1, 1),
      (id_pms1, 4, 4)
    ON CONFLICT (id_profesor_materia_seccion, dia_semana, id_leccion) DO NOTHING;
  END IF;

  IF id_pms2 IS NOT NULL THEN
    INSERT INTO horarioasignacion (id_profesor_materia_seccion, dia_semana, id_leccion)
    VALUES
      (id_pms2, 2, 1),
      (id_pms2, 5, 5)
    ON CONFLICT (id_profesor_materia_seccion, dia_semana, id_leccion) DO NOTHING;
  END IF;

  -- Encargado ↔ estudiante
  IF id_est_sofia IS NOT NULL AND id_enc_ana IS NOT NULL THEN
    INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
    SELECT id_est_sofia, id_enc_ana, CURRENT_DATE, TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM encargado_estudiante
      WHERE id_persona_estudiante = id_est_sofia AND id_persona_encargado = id_enc_ana
    );
  END IF;

  IF id_est_diego IS NOT NULL AND id_enc_luis IS NOT NULL THEN
    INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
    SELECT id_est_diego, id_enc_luis, CURRENT_DATE, TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM encargado_estudiante
      WHERE id_persona_estudiante = id_est_diego AND id_persona_encargado = id_enc_luis
    );
  END IF;

  -- Matrículas activas (con tutor y horario de referencia oficial)
  IF id_est_sofia IS NOT NULL AND id_enc_ana IS NOT NULL THEN
    INSERT INTO matricula (
      id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
      id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar
    )
    SELECT id_curso, CURRENT_DATE, 'activa', id_est_sofia, id_enc_ana,
           id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar
    WHERE NOT EXISTS (
      SELECT 1 FROM matricula
      WHERE id_curso_lectivo = id_curso AND id_persona_estudiante = id_est_sofia
    );
  END IF;

  IF id_est_diego IS NOT NULL AND id_enc_luis IS NOT NULL THEN
    INSERT INTO matricula (
      id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
      id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar
    )
    SELECT id_curso, CURRENT_DATE, 'activa', id_est_diego, id_enc_luis,
           id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar
    WHERE NOT EXISTS (
      SELECT 1 FROM matricula
      WHERE id_curso_lectivo = id_curso AND id_persona_estudiante = id_est_diego
    );
  END IF;

  RAISE NOTICE '23_bd_datos_prueba: seed completado (curso %, sección 7-1).', EXTRACT(YEAR FROM CURRENT_DATE)::INT;
END $$;
