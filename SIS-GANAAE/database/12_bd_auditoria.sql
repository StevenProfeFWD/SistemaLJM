-- 12: Auditoría en tablas clave (created_at, updated_at, created_by)
-- Sin afectar relaciones existentes: created_by es nullable (id_persona que realizó la acción).

-- Persona
ALTER TABLE Persona ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE Persona ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE Persona ADD COLUMN IF NOT EXISTS created_by INT REFERENCES Persona(id_persona);
-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION tr_actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_persona_updated_at ON Persona;
CREATE TRIGGER trigger_persona_updated_at
BEFORE UPDATE ON Persona
FOR EACH ROW EXECUTE FUNCTION tr_actualizar_updated_at();

-- UsuarioSistema (ya tiene fecha_registro; añadimos updated_at y created_by)
ALTER TABLE UsuarioSistema ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE UsuarioSistema ADD COLUMN IF NOT EXISTS created_by INT REFERENCES Persona(id_persona);

DROP TRIGGER IF EXISTS trigger_usuariosistema_updated_at ON UsuarioSistema;
CREATE TRIGGER trigger_usuariosistema_updated_at
BEFORE UPDATE ON UsuarioSistema
FOR EACH ROW EXECUTE FUNCTION tr_actualizar_updated_at();

-- Matricula
ALTER TABLE Matricula ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE Matricula ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE Matricula ADD COLUMN IF NOT EXISTS created_by INT REFERENCES Persona(id_persona);

DROP TRIGGER IF EXISTS trigger_matricula_updated_at ON Matricula;
CREATE TRIGGER trigger_matricula_updated_at
BEFORE UPDATE ON Matricula
FOR EACH ROW EXECUTE FUNCTION tr_actualizar_updated_at();

-- Asistencia
ALTER TABLE Asistencia ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE Asistencia ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE Asistencia ADD COLUMN IF NOT EXISTS created_by INT REFERENCES Persona(id_persona);

DROP TRIGGER IF EXISTS trigger_asistencia_updated_at ON Asistencia;
CREATE TRIGGER trigger_asistencia_updated_at
BEFORE UPDATE ON Asistencia
FOR EACH ROW EXECUTE FUNCTION tr_actualizar_updated_at();
