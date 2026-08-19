-- 08: ENUMs para estados y tipos (catálogos en el modelo)

-- 1. Estado de matrícula
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_matricula') THEN
        CREATE TYPE estado_matricula AS ENUM (
            'pendiente',
            'activa',
            'cancelada',
            'graduado'
        );
    END IF;
END $$;

-- 2. Estado de asistencia
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asistencia') THEN
        CREATE TYPE estado_asistencia AS ENUM (
            'presente',
            'ausente',
            'justificado',
            'tardanza'
        );
    END IF;
END $$;

-- 3. Estado de envío de notificación
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_envio_notificacion') THEN
        CREATE TYPE estado_envio_notificacion AS ENUM (
            'pendiente',
            'enviado',
            'fallido'
        );
    END IF;
END $$;

-- 4. Tipo de justificación
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_justificacion_enum') THEN
        CREATE TYPE tipo_justificacion_enum AS ENUM (
            'medica',
            'personal',
            'familiar',
            'otro'
        );
    END IF;
END $$;

-- 5. Aplicar ENUMs a columnas existentes (solo si las columnas son VARCHAR y se desea migrar)
-- Matricula.estado -> estado_matricula (requiere que valores actuales coincidan con el ENUM o migración previa)
-- Se agrega columna nueva, se copia/mapea, se elimina antigua y se renombra (o se hace en pasos separados).
-- Para no romper datos existentes: agregar columna opcional con ENUM y dejar la antigua hasta migrar datos.
ALTER TABLE Matricula
    ADD COLUMN IF NOT EXISTS estado_enum estado_matricula;

-- Si ya hay datos en estado, actualizar estado_enum donde coincida (ej: 'activa' -> 'activa'::estado_matricula)
UPDATE Matricula SET estado_enum = estado::estado_matricula
WHERE estado IN ('pendiente','activa','cancelada','graduado') AND estado_enum IS NULL;

-- Opcional: después de migrar todos los datos, hacer DROP COLUMN estado y RENAME estado_enum -> estado.
-- Por ahora dejamos ambas; la aplicación puede usar estado_enum cuando esté lista.

-- Asistencia.estado -> estado_asistencia
ALTER TABLE Asistencia
    ADD COLUMN IF NOT EXISTS estado_enum estado_asistencia;

UPDATE Asistencia SET estado_enum = estado::estado_asistencia
WHERE estado IN ('presente','ausente','justificado','tardanza') AND estado_enum IS NULL;

-- Notificacion.estado_envio -> estado_envio_notificacion
ALTER TABLE Notificacion
    ADD COLUMN IF NOT EXISTS estado_envio_enum estado_envio_notificacion;

UPDATE Notificacion SET estado_envio_enum = estado_envio::estado_envio_notificacion
WHERE estado_envio IN ('pendiente','enviado','fallido') AND estado_envio_enum IS NULL;

-- Justificacion.tipo_justificacion -> tipo_justificacion_enum
ALTER TABLE Justificacion
    ADD COLUMN IF NOT EXISTS tipo_justificacion_enum tipo_justificacion_enum;

UPDATE Justificacion SET tipo_justificacion_enum = tipo_justificacion::tipo_justificacion_enum
WHERE tipo_justificacion IN ('medica','personal','familiar','otro') AND tipo_justificacion_enum IS NULL;
