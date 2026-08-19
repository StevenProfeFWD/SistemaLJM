-- 11: Matrícula - máximo 25 estudiantes por sección; al llenarse se crea la siguiente (lógica en aplicación)
-- Mínimo 15 es regla de negocio/reporte; aquí solo se limita el máximo por sección.

CREATE OR REPLACE FUNCTION tr_matricula_max_por_seccion()
RETURNS TRIGGER AS $$
DECLARE
    cnt INT;
BEGIN
    IF NEW.id_seccion IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Excluir este registro al contar la sección destino
        SELECT COUNT(*) INTO cnt
        FROM Matricula
        WHERE id_curso_lectivo = NEW.id_curso_lectivo
          AND id_seccion = NEW.id_seccion
          AND id_matricula != OLD.id_matricula;
    ELSE
        SELECT COUNT(*) INTO cnt
        FROM Matricula
        WHERE id_curso_lectivo = NEW.id_curso_lectivo
          AND id_seccion = NEW.id_seccion;
    END IF;

    IF cnt >= 25 THEN
        RAISE EXCEPTION 'La sección ya tiene el máximo de 25 estudiantes. Debe crear o asignar otra sección.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar al insert y update
DROP TRIGGER IF EXISTS trigger_matricula_max_por_seccion ON Matricula;
CREATE TRIGGER trigger_matricula_max_por_seccion
BEFORE INSERT OR UPDATE OF id_curso_lectivo, id_seccion ON Matricula
FOR EACH ROW
EXECUTE FUNCTION tr_matricula_max_por_seccion();
