-- =============================================================================
-- 19: Seed de historial de matrícula 2024 / 2025 (y curso 2026 vacío)
-- Ejecutar después de migraciones 04, 15 (id_persona_tutor), 16/17 (nombre_completo).
-- Idempotente: no borra datos; usa ON CONFLICT / WHERE NOT EXISTS.
--
-- Mapa de pruebas manuales (tutor → estudiantes):
--   TUTOR A — Carmen Mora Solís (ced 108760543) → hijos: Laura Chaves Mora, Kevin Chaves Mora
--   TUTOR B — Roberto Núñez Jiménez (ced 209870654) → hijo: Daniel Arias Núñez
--   TUTOR C — Patricia Vega Rojas (ced 310980765) → hijos: Melissa Castro Vega, Andrés Solano Vega
--
-- Cursos lectivos: 2024 y 2025 con matrícula activa por estudiante; 2026 creado para pruebas futuras.
-- 2024: todos en séptimo | 2025: mismo tutor, todos en octavo (promoción simulada).
-- =============================================================================

-- Cursos lectivos (sin borrar existentes)
INSERT INTO curso_lectivo (anio_curso_lectivo)
SELECT 2024 WHERE NOT EXISTS (SELECT 1 FROM curso_lectivo WHERE anio_curso_lectivo = 2024);
INSERT INTO curso_lectivo (anio_curso_lectivo)
SELECT 2025 WHERE NOT EXISTS (SELECT 1 FROM curso_lectivo WHERE anio_curso_lectivo = 2025);
INSERT INTO curso_lectivo (anio_curso_lectivo)
SELECT 2026 WHERE NOT EXISTS (SELECT 1 FROM curso_lectivo WHERE anio_curso_lectivo = 2026);

-- Sección 7-1 y 8-1 (por si no existen)
INSERT INTO seccion (numero_seccion, nombre_seccion)
SELECT 1, '7-1' WHERE NOT EXISTS (SELECT 1 FROM seccion WHERE nombre_seccion = '7-1');
INSERT INTO seccion (numero_seccion, nombre_seccion)
SELECT 1, '8-1' WHERE NOT EXISTS (SELECT 1 FROM seccion WHERE nombre_seccion = '8-1');

-- Tutores (padre_de_familia) — cédulas únicas para no chocar con 23_bd_datos_prueba
INSERT INTO persona (nombre_completo, cedula, correo, telefono, direccion, fecha_nacimiento, nombre_rol, activo)
VALUES
  ('Carmen Mora Solís', '108760543', 'carmen.mora@seed-historial.test', '60001101', 'Puntarenas', '1982-04-12', 'padre_de_familia', TRUE),
  ('Roberto Núñez Jiménez', '209870654', 'roberto.nunez@seed-historial.test', '60001102', 'Esparza', '1978-09-03', 'padre_de_familia', TRUE),
  ('Patricia Vega Rojas', '310980765', 'patricia.vega@seed-historial.test', '60001103', 'Barranca', '1980-11-20', 'padre_de_familia', TRUE)
ON CONFLICT (cedula) DO NOTHING;

-- Estudiantes (5)
INSERT INTO persona (nombre_completo, cedula, correo, telefono, direccion, fecha_nacimiento, nombre_rol, activo)
VALUES
  ('Laura Chaves Mora', '401230987', 'laura.chaves@seed-historial.test', '70001101', 'Puntarenas', '2010-01-15', 'estudiante', TRUE),
  ('Kevin Chaves Mora', '502340876', 'kevin.chaves@seed-historial.test', '70001102', 'Puntarenas', '2011-06-22', 'estudiante', TRUE),
  ('Daniel Arias Núñez', '603450765', 'daniel.arias@seed-historial.test', '70001103', 'Esparza', '2010-03-08', 'estudiante', TRUE),
  ('Melissa Castro Vega', '704560654', 'melissa.castro@seed-historial.test', '70001104', 'Barranca', '2009-12-01', 'estudiante', TRUE),
  ('Andrés Solano Vega', '805670543', 'andres.solano@seed-historial.test', '70001105', 'Barranca', '2010-08-19', 'estudiante', TRUE)
ON CONFLICT (cedula) DO NOTHING;

-- Vínculos encargado ↔ estudiante (una fila por par; patria potestad según caso de prueba)
DO $$
DECLARE
  id_tutor_carmen INT;
  id_tutor_roberto INT;
  id_tutor_patricia INT;
  id_est_laura INT;
  id_est_kevin INT;
  id_est_daniel INT;
  id_est_melissa INT;
  id_est_andres INT;
  id_curso_2024 INT;
  id_curso_2025 INT;
  id_sec_71 INT;
  id_sec_81 INT;
  horario_ref TEXT := 'Lunes a Viernes 7am a 4:45pm (Referencia)';
BEGIN
  SELECT id_persona INTO id_tutor_carmen FROM persona WHERE cedula = '108760543' LIMIT 1;
  SELECT id_persona INTO id_tutor_roberto FROM persona WHERE cedula = '209870654' LIMIT 1;
  SELECT id_persona INTO id_tutor_patricia FROM persona WHERE cedula = '310980765' LIMIT 1;

  SELECT id_persona INTO id_est_laura FROM persona WHERE cedula = '401230987' LIMIT 1;
  SELECT id_persona INTO id_est_kevin FROM persona WHERE cedula = '502340876' LIMIT 1;
  SELECT id_persona INTO id_est_daniel FROM persona WHERE cedula = '603450765' LIMIT 1;
  SELECT id_persona INTO id_est_melissa FROM persona WHERE cedula = '704560654' LIMIT 1;
  SELECT id_persona INTO id_est_andres FROM persona WHERE cedula = '805670543' LIMIT 1;

  SELECT id_curso_lectivo INTO id_curso_2024 FROM curso_lectivo WHERE anio_curso_lectivo = 2024 LIMIT 1;
  SELECT id_curso_lectivo INTO id_curso_2025 FROM curso_lectivo WHERE anio_curso_lectivo = 2025 LIMIT 1;
  SELECT id_seccion INTO id_sec_71 FROM seccion WHERE nombre_seccion = '7-1' LIMIT 1;
  SELECT id_seccion INTO id_sec_81 FROM seccion WHERE nombre_seccion = '8-1' LIMIT 1;

  IF id_tutor_carmen IS NULL OR id_tutor_roberto IS NULL OR id_tutor_patricia IS NULL THEN
    RAISE NOTICE 'Seed historial: faltan tutores (¿conflicto de cédula?).';
    RETURN;
  END IF;
  IF id_est_laura IS NULL OR id_est_kevin IS NULL OR id_est_daniel IS NULL OR id_est_melissa IS NULL OR id_est_andres IS NULL THEN
    RAISE NOTICE 'Seed historial: faltan estudiantes.';
    RETURN;
  END IF;
  IF id_curso_2024 IS NULL OR id_curso_2025 IS NULL THEN
    RAISE NOTICE 'Seed historial: faltan cursos lectivos 2024/2025.';
    RETURN;
  END IF;
  IF id_sec_71 IS NULL OR id_sec_81 IS NULL THEN
    RAISE NOTICE 'Seed historial: faltan secciones 7-1 u 8-1.';
    RETURN;
  END IF;

  -- Encargado-estudiante (vínculos; no duplicar pares)
  INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
  SELECT id_est_laura, id_tutor_carmen, '2024-02-01'::date, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM encargado_estudiante WHERE id_persona_estudiante = id_est_laura AND id_persona_encargado = id_tutor_carmen);

  INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
  SELECT id_est_kevin, id_tutor_carmen, '2024-02-01'::date, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM encargado_estudiante WHERE id_persona_estudiante = id_est_kevin AND id_persona_encargado = id_tutor_carmen);

  INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
  SELECT id_est_daniel, id_tutor_roberto, '2024-02-01'::date, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM encargado_estudiante WHERE id_persona_estudiante = id_est_daniel AND id_persona_encargado = id_tutor_roberto);

  INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
  SELECT id_est_melissa, id_tutor_patricia, '2024-02-01'::date, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM encargado_estudiante WHERE id_persona_estudiante = id_est_melissa AND id_persona_encargado = id_tutor_patricia);

  INSERT INTO encargado_estudiante (id_persona_estudiante, id_persona_encargado, fecha, patria_potestad)
  SELECT id_est_andres, id_tutor_patricia, '2024-02-01'::date, FALSE
  WHERE NOT EXISTS (SELECT 1 FROM encargado_estudiante WHERE id_persona_estudiante = id_est_andres AND id_persona_encargado = id_tutor_patricia);

  -- Matrículas 2024 (nuevo ingreso / traslado mix no necesario: todos nuevo_ingreso para el seed)
  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, colegio_anterior
  )
  SELECT id_curso_2024, '2024-02-15'::date, 'activa', id_est_laura, id_tutor_carmen,
         id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar, FALSE, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2024 AND id_persona_estudiante = id_est_laura
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, colegio_anterior
  )
  SELECT id_curso_2024, '2024-02-15'::date, 'activa', id_est_kevin, id_tutor_carmen,
         id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar, FALSE, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2024 AND id_persona_estudiante = id_est_kevin
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, colegio_anterior
  )
  SELECT id_curso_2024, '2024-02-15'::date, 'activa', id_est_daniel, id_tutor_roberto,
         id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar, FALSE, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2024 AND id_persona_estudiante = id_est_daniel
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, colegio_anterior
  )
  SELECT id_curso_2024, '2024-02-15'::date, 'activa', id_est_melissa, id_tutor_patricia,
         id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar, FALSE, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2024 AND id_persona_estudiante = id_est_melissa
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, colegio_anterior
  )
  SELECT id_curso_2024, '2024-02-15'::date, 'activa', id_est_andres, id_tutor_patricia,
         id_sec_71, NULL, horario_ref, 'nuevo_ingreso'::tipo_matricula, 'septimo'::ano_a_cursar, FALSE, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2024 AND id_persona_estudiante = id_est_andres
  );

  -- Matrículas 2025 (mismo tutor por estudiante; tipo regular; octavo)
  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, fecha_ratificacion
  )
  SELECT id_curso_2025, '2025-02-10'::date, 'activa', id_est_laura, id_tutor_carmen,
         id_sec_81, NULL, horario_ref, 'regular'::tipo_matricula, 'octavo'::ano_a_cursar, FALSE, '2025-02-10'::date
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2025 AND id_persona_estudiante = id_est_laura
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, fecha_ratificacion
  )
  SELECT id_curso_2025, '2025-02-10'::date, 'activa', id_est_kevin, id_tutor_carmen,
         id_sec_81, NULL, horario_ref, 'regular'::tipo_matricula, 'octavo'::ano_a_cursar, FALSE, '2025-02-10'::date
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2025 AND id_persona_estudiante = id_est_kevin
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, fecha_ratificacion
  )
  SELECT id_curso_2025, '2025-02-10'::date, 'activa', id_est_daniel, id_tutor_roberto,
         id_sec_81, NULL, horario_ref, 'regular'::tipo_matricula, 'octavo'::ano_a_cursar, FALSE, '2025-02-10'::date
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2025 AND id_persona_estudiante = id_est_daniel
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, fecha_ratificacion
  )
  SELECT id_curso_2025, '2025-02-10'::date, 'activa', id_est_melissa, id_tutor_patricia,
         id_sec_81, NULL, horario_ref, 'regular'::tipo_matricula, 'octavo'::ano_a_cursar, FALSE, '2025-02-10'::date
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2025 AND id_persona_estudiante = id_est_melissa
  );

  INSERT INTO matricula (
    id_curso_lectivo, fecha_matricula, estado, id_persona_estudiante, id_persona_tutor,
    id_seccion, id_materia, horario, tipo_matricula, ano_a_cursar, viene_de_otro_colegio, fecha_ratificacion
  )
  SELECT id_curso_2025, '2025-02-10'::date, 'activa', id_est_andres, id_tutor_patricia,
         id_sec_81, NULL, horario_ref, 'regular'::tipo_matricula, 'octavo'::ano_a_cursar, FALSE, '2025-02-10'::date
  WHERE NOT EXISTS (
    SELECT 1 FROM matricula WHERE id_curso_lectivo = id_curso_2025 AND id_persona_estudiante = id_est_andres
  );

  RAISE NOTICE 'Seed historial matrícula 2024/2025 aplicado (o ya existía).';
END $$;

-- Referencia rápida (consulta manual)
-- SELECT cl.anio_curso_lectivo, p.nombre_completo AS estudiante, p.cedula, t.nombre_completo AS tutor
-- FROM matricula m
-- JOIN curso_lectivo cl ON m.id_curso_lectivo = cl.id_curso_lectivo
-- JOIN persona p ON m.id_persona_estudiante = p.id_persona
-- JOIN persona t ON m.id_persona_tutor = t.id_persona
-- WHERE p.cedula IN ('401230987','502340876','603450765','704560654','805670543')
-- ORDER BY cl.anio_curso_lectivo, p.nombre_completo;
