-- 15: Horario flexible por sección/grupo y curso lectivo
-- Permite asignar hora de entrada/salida por día (L-V) para una sección en un curso lectivo.

CREATE TABLE IF NOT EXISTS HorarioSeccion (
    id_horario_seccion SERIAL PRIMARY KEY,
    id_curso_lectivo INT NOT NULL REFERENCES Curso_Lectivo(id_curso_lectivo) ON DELETE CASCADE,
    id_seccion INT NOT NULL REFERENCES Seccion(id_seccion) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 1 AND dia_semana <= 5), -- L(1) .. V(5)
    hora_entrada TIME NOT NULL,
    hora_salida TIME NOT NULL,
    UNIQUE (id_curso_lectivo, id_seccion, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_horarioseccion_curso_seccion ON HorarioSeccion(id_curso_lectivo, id_seccion);

