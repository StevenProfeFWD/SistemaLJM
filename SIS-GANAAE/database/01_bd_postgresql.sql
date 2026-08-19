-- Active: 1761524738007@@127.0.0.1@5432@gestion_asistencias_marti
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE tipo_rol AS ENUM (
    'administrador',
    'profesor',
    'padre_de_familia'
    );

CREATE TABLE Persona (
    id_persona SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido1 VARCHAR(255) NOT NULL,
    apellido2 VARCHAR(255) NOT NULL,
    cedula VARCHAR(255) NOT NULL UNIQUE,
    correo VARCHAR(255) NOT NULL UNIQUE,
    telefono VARCHAR(255) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    nombre_rol tipo_rol NOT NULL
);

CREATE TABLE UsuarioSistema (
    id_usuario SERIAL PRIMARY KEY,
    persona_id INT NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL DEFAULT crypt('liceomarti', gen_salt('bf')),
    primer_login BOOLEAN DEFAULT TRUE,
    fecha_registro TIMESTAMP DEFAULT NOW(),
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (persona_id) REFERENCES Persona(id_persona)
);

CREATE TABLE Curso_Lectivo (
    id_curso_lectivo SERIAL PRIMARY KEY,
    anio_curso_lectivo INT NOT NULL
);

CREATE TABLE Seccion (
    id_seccion SERIAL PRIMARY KEY,
    numero_seccion INT NOT NULL,
    nombre_seccion VARCHAR(25) NOT NULL
);

CREATE TABLE Materia (
    id_materia SERIAL PRIMARY KEY,
    nombre_materia VARCHAR(255) NOT NULL
);

CREATE TABLE Profesor_Materia_Seccion (
    id_profesor_materia_seccion SERIAL PRIMARY KEY,
    id_persona_profesor INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    curso_lectivo INT NOT NULL REFERENCES Curso_Lectivo(id_curso_lectivo) ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES Materia(id_materia) ON DELETE CASCADE,
    id_seccion INT NOT NULL REFERENCES Seccion(id_seccion) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_salida TIME NOT NULL
);

CREATE TABLE Matricula (
    id_matricula SERIAL PRIMARY KEY,
    id_curso_lectivo INT NOT NULL REFERENCES Curso_Lectivo(id_curso_lectivo) ON DELETE CASCADE,
    fecha_matricula DATE NOT NULL,
    estado VARCHAR(50) NOT NULL,
    id_persona_estudiante INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    id_seccion INT NOT NULL REFERENCES Seccion(id_seccion) ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES Materia(id_materia) ON DELETE CASCADE,
    horario VARCHAR(255) NOT NULL
);

CREATE TABLE Encargado_Estudiante (
    id_encargado_estudiante SERIAL PRIMARY KEY,
    id_persona_estudiante INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    id_persona_encargado INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    patria_potestad BOOLEAN NOT NULL
);

CREATE TABLE Asistencia (
    id_asistencia SERIAL PRIMARY KEY,
    fecha_hora TIMESTAMP NOT NULL DEFAULT NOW(),
    estado VARCHAR(50) NOT NULL,
    observacion TEXT NOT NULL,
    id_persona_estudiante INT NOT NULL REFERENCES Persona(id_persona) ON DELETE CASCADE,
    id_profesor_materia_seccion INT NOT NULL REFERENCES Profesor_Materia_Seccion(id_profesor_materia_seccion) ON DELETE CASCADE
);

CREATE TABLE Justificacion (
    id_justificacion SERIAL PRIMARY KEY,
    tipo_justificacion VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    fecha_ingreso DATE NOT NULL,
    documento VARCHAR(255) NOT NULL,
    id_asistencia INT NOT NULL REFERENCES Asistencia(id_asistencia) ON DELETE CASCADE
);

CREATE TABLE Notificacion (
    id_notificacion SERIAL PRIMARY KEY,
    medio_comunicacion VARCHAR(255) NOT NULL,
    fecha_envio TIMESTAMP NOT NULL DEFAULT NOW(),
    estado_envio VARCHAR(50) NOT NULL,
    observacion VARCHAR(255) NOT NULL,
    id_encargado_estudiante INT NOT NULL REFERENCES Encargado_Estudiante(id_encargado_estudiante) ON DELETE CASCADE,
    id_asistencia INT NOT NULL REFERENCES Asistencia(id_asistencia) ON DELETE CASCADE
);


-- DROPS
-- Primero las tablas que dependen de otras (hijas)
-- DROP TABLE IF EXISTS Notificacion CASCADE;
-- DROP TABLE IF EXISTS Justificacion CASCADE;
-- DROP TABLE IF EXISTS Asistencia CASCADE;
-- DROP TABLE IF EXISTS Encargado_Estudiante CASCADE;
-- DROP TABLE IF EXISTS Matricula CASCADE;
-- DROP TABLE IF EXISTS Profesor_Materia_Seccion CASCADE;

-- Luego las tablas base (padres)
-- DROP TABLE IF EXISTS Materia CASCADE;
-- DROP TABLE IF EXISTS Seccion CASCADE;
-- DROP TABLE IF EXISTS Curso_Lectivo CASCADE;
-- DROP TABLE IF EXISTS Persona CASCADE;
