-- 28: Cupo por sección — solo matrículas con estado 'activa' consumen el límite de 25.
-- Alinea el trigger de BD con contarMatriculasActivasPorSeccion() en la aplicación.

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
