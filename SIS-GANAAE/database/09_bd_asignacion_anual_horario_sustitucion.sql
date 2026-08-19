-- 09: Profesor_Materia_Seccion como asignación anual + HorarioAsignacion (días y horas) + Sustitucion
-- Ejemplo: Profesor X da Matemáticas a sección Y los días 1 y 5 (ej. lunes y viernes) de tal hora a tal hora durante el año, con opción de ser sustituido.

-- 1. Crear tabla nueva de asignación (sin fecha/hora por fila)
CREATE TABLE IF NOT EXISTS Profesor_Materia_Seccion_New (
    id_profesor_materia_seccion SERIAL PRIMARY KEY,
    id_persona_profesor INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    curso_lectivo INT NOT NULL REFERENCES Curso_Lectivo(id_curso_lectivo) ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES Materia(id_materia) ON DELETE CASCADE,
    id_seccion INT NOT NULL REFERENCES Seccion(id_seccion) ON DELETE CASCADE,
    UNIQUE(id_persona_profesor, curso_lectivo, id_materia, id_seccion)
);

-- 2. Poblar con asignaciones únicas (una fila por profesor-curso-materia-sección)
INSERT INTO Profesor_Materia_Seccion_New (id_persona_profesor, curso_lectivo, id_materia, id_seccion)
SELECT DISTINCT id_persona_profesor, curso_lectivo, id_materia, id_seccion
FROM Profesor_Materia_Seccion
ON CONFLICT (id_persona_profesor, curso_lectivo, id_materia, id_seccion) DO NOTHING;

-- 3. Tabla de horario por asignación: día(s) de la semana y hora inicio/fin
-- dia_semana: 1 = lunes, 7 = domingo (ISO 1-7)
CREATE TABLE IF NOT EXISTS HorarioAsignacion (
    id_horario SERIAL PRIMARY KEY,
    id_profesor_materia_seccion INT NOT NULL REFERENCES Profesor_Materia_Seccion_New(id_profesor_materia_seccion) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 1 AND dia_semana <= 7),
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL
);

-- 4. Migrar horarios desde la tabla antigua (cada fila antigua = un día/hora; puede haber duplicados de día)
INSERT INTO HorarioAsignacion (id_profesor_materia_seccion, dia_semana, hora_inicio, hora_fin)
SELECT n.id_profesor_materia_seccion,
       -- PostgreSQL EXTRACT(DOW) devuelve 0=domingo..6=sábado; convertimos a 1=lunes..7=domingo
       CASE WHEN EXTRACT(ISODOW FROM o.fecha) = 0 THEN 7 ELSE EXTRACT(ISODOW FROM o.fecha)::SMALLINT END,
       o.hora_inicio,
       o.hora_salida
FROM Profesor_Materia_Seccion o
JOIN Profesor_Materia_Seccion_New n
  ON n.id_persona_profesor = o.id_persona_profesor AND n.curso_lectivo = o.curso_lectivo
 AND n.id_materia = o.id_materia AND n.id_seccion = o.id_seccion;

-- 5. Tabla de sustituciones (profesor sustituto cuando el titular se incapacita)
CREATE TABLE IF NOT EXISTS Sustitucion (
    id_sustitucion SERIAL PRIMARY KEY,
    id_profesor_materia_seccion INT NOT NULL REFERENCES Profesor_Materia_Seccion_New(id_profesor_materia_seccion) ON DELETE CASCADE,
    id_persona_sustituto INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL
);

-- 6. Asistencia: añadir fecha (día de la clase) y migrar FK a la nueva tabla
ALTER TABLE Asistencia ADD COLUMN IF NOT EXISTS fecha DATE;

UPDATE Asistencia SET fecha = (fecha_hora::DATE) WHERE fecha IS NULL;

-- Mapeo old id -> new id (misma asignación)
ALTER TABLE Asistencia ADD COLUMN IF NOT EXISTS id_profesor_materia_seccion_new INT REFERENCES Profesor_Materia_Seccion_New(id_profesor_materia_seccion);

UPDATE Asistencia a
SET id_profesor_materia_seccion_new = n.id_profesor_materia_seccion
FROM Profesor_Materia_Seccion o
JOIN Profesor_Materia_Seccion_New n
  ON n.id_persona_profesor = o.id_persona_profesor AND n.curso_lectivo = o.curso_lectivo
 AND n.id_materia = o.id_materia AND n.id_seccion = o.id_seccion
WHERE o.id_profesor_materia_seccion = a.id_profesor_materia_seccion;

-- Quitar FK y columna antigua, usar la nueva
ALTER TABLE Asistencia DROP CONSTRAINT IF EXISTS asistencia_id_profesor_materia_seccion_fkey;
ALTER TABLE Asistencia DROP COLUMN IF EXISTS id_profesor_materia_seccion;

ALTER TABLE Asistencia RENAME COLUMN id_profesor_materia_seccion_new TO id_profesor_materia_seccion;
ALTER TABLE Asistencia ALTER COLUMN id_profesor_materia_seccion SET NOT NULL;

-- 7. Eliminar tabla antigua y renombrar la nueva
DROP TABLE IF EXISTS Profesor_Materia_Seccion CASCADE;
ALTER TABLE Profesor_Materia_Seccion_New RENAME TO Profesor_Materia_Seccion;

-- 8. Recrear FK de Asistencia por si el nombre del constraint importa
ALTER TABLE Asistencia
ADD CONSTRAINT asistencia_id_profesor_materia_seccion_fkey
FOREIGN KEY (id_profesor_materia_seccion) REFERENCES Profesor_Materia_Seccion(id_profesor_materia_seccion) ON DELETE CASCADE;

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_horario_asignacion_pms ON HorarioAsignacion(id_profesor_materia_seccion);
CREATE INDEX IF NOT EXISTS idx_sustitucion_pms ON Sustitucion(id_profesor_materia_seccion);
