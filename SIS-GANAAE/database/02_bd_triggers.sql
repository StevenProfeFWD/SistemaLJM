
CREATE OR REPLACE FUNCTION tr_crear_usuario_sistema()
RETURNS TRIGGER AS $$
BEGIN
    -- Aquí va la lógica de INSERT
    INSERT INTO UsuarioSistema (persona_id, contrasena_hash, primer_login, activo) 
    VALUES (NEW.id_persona, crypt('liceomarti', gen_salt('bf')), TRUE, TRUE);
    
    RETURN NEW; -- Obligatorio devolver NEW en triggers AFTER
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trigger_crear_usuario_sistema
AFTER INSERT ON Persona
FOR EACH ROW
EXECUTE FUNCTION tr_crear_usuario_sistema();