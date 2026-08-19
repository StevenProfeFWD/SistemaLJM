-- 14: Eliminar lógica de documentos de matrícula (cliente confirmó que no se usará)
-- Ejecutar después de 04_bd_migracion_matricula.sql si ya fue aplicada.

-- 1) Tabla de documentos de matrícula
DROP TABLE IF EXISTS DocumentosMatricula CASCADE;

-- Nota: Si existen otras columnas relacionadas a rutas de archivos en otras tablas (p.ej. Justificacion.documento),
-- este script NO las elimina porque pueden seguir usándose para otros módulos. El requerimiento actual fue solo para Matrícula.

