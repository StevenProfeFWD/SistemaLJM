-- Migración para módulo de matrícula
-- Agregar tipo de matrícula a la tabla Matricula
-- Crear tabla DocumentosMatricula

-- 1. Crear tipo ENUM para tipo de matrícula
CREATE TYPE tipo_matricula AS ENUM (
    'nuevo_ingreso',
    'regular',
    'traslado'
);

-- 2. Agregar campo tipo_matricula a la tabla Matricula
ALTER TABLE Matricula 
ADD COLUMN tipo_matricula tipo_matricula;

-- 3. Agregar campo para ratificación (fecha de ratificación para estudiantes regulares)
ALTER TABLE Matricula 
ADD COLUMN fecha_ratificacion DATE;

-- 4. Agregar campo para indicar si viene de otro colegio
ALTER TABLE Matricula 
ADD COLUMN viene_de_otro_colegio BOOLEAN DEFAULT FALSE;

-- 5. Agregar campo para nombre del colegio anterior (si aplica)
ALTER TABLE Matricula 
ADD COLUMN colegio_anterior VARCHAR(255);

-- 6. Crear tipo ENUM para año a cursar
CREATE TYPE ano_a_cursar AS ENUM (
    'septimo',
    'octavo',
    'noveno',
    'decimo',
    'undecimo'
);

-- 7. Agregar campo año a cursar
ALTER TABLE Matricula 
ADD COLUMN ano_a_cursar ano_a_cursar;

-- 8. Hacer que sección y materia sean opcionales (ya no son necesarias para matrícula)
ALTER TABLE Matricula 
ALTER COLUMN id_seccion DROP NOT NULL;

ALTER TABLE Matricula 
ALTER COLUMN id_materia DROP NOT NULL;

-- 9. Agregar campo para horario fijo (será el mismo para todos: lunes a viernes 7am-4:45pm)
-- Se mantiene el campo horario pero se usará un valor fijo

-- 10. Crear tabla para almacenar documentos de matrícula
CREATE TABLE DocumentosMatricula (
    id_documento SERIAL PRIMARY KEY,
    id_matricula INT NOT NULL REFERENCES Matricula(id_matricula) ON DELETE CASCADE,
    tipo_documento VARCHAR(100) NOT NULL, -- 'documento_identidad', 'dimex', 'residencia', 'pruebas_estudios', 'comprobante_pago', 'certificacion_calificaciones', 'solicitud_traslado', 'hoja_matricula'
    ruta_archivo VARCHAR(500) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT NOW(),
    observaciones TEXT
);

-- 11. Agregar índices para mejorar consultas
CREATE INDEX idx_matricula_tipo ON Matricula(tipo_matricula);
CREATE INDEX idx_matricula_estudiante ON Matricula(id_persona_estudiante);
CREATE INDEX idx_matricula_curso_lectivo ON Matricula(id_curso_lectivo);
CREATE INDEX idx_documentos_matricula ON DocumentosMatricula(id_matricula);
