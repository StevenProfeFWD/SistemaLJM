-- 03_insert_data.sql

-- Insertar un registro en la tabla 'Persona'. 
-- El trigger se activará con este insert.
INSERT INTO Persona (nombre, apellido1, apellido2, cedula, correo, telefono, direccion, fecha_nacimiento, nombre_rol) 
VALUES ('Steven', 'Salas', 'Ledezma', '604710538', 'steven.salas@ejemplo.com', '86621066', 'La Riviera', '2002-02-16', 'administrador'::tipo_rol);