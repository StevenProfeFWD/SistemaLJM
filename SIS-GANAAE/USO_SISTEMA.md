# Guía de uso del Sistema de Asistencias (SIS-GANAAE)

## 1. Preparación de la base de datos

Ejecutar los scripts SQL en este orden (sobre la BD ya creada con `01_bd_postgresql.sql`, `04_bd_migracion_matricula.sql`, etc.):

1. `07_bd_estudiante_y_trigger.sql` — Rol estudiante y trigger de usuarios  
2. `08_bd_enum_estados_tipos.sql` — ENUMs de estados  
3. `09_bd_asignacion_anual_horario_sustitucion.sql` — Asignación anual + horarios + sustituciones  
4. `10_bd_asistencia_unicidad_observacion.sql` — Unicidad y observación en asistencia  
5. `11_bd_matricula_max_estudiantes_seccion.sql` — Máximo 25 por sección  
6. `12_bd_auditoria.sql` — Columnas de auditoría  
7. `22_bd_catalogo_leccion.sql` — Catálogo de 15 lecciones y migración de horarios  
8. `28_bd_matricula_cupo_solo_activas.sql` — Cupo por sección solo matrículas activas  
9. `29_bd_jwt_revocacion.sql` — Tabla de JWT revocados (logout)  
10. `30_bd_indices_rendimiento.sql` — Índices compuestos (cupos, sección, rol, asistencia)  
11. `23_bd_datos_prueba.sql` — Datos de prueba (ejecutar al final) 

Luego, **contraseña por defecto** para cualquier usuario creado por el sistema: **`liceomarti`** (cambiar en primer inicio de sesión si aplica).

---

## 2. Usuarios de prueba (después de ejecutar 23_bd_datos_prueba.sql)

| Rol              | Correo (login)              | Contraseña  | Uso |
|------------------|-----------------------------|-------------|-----|
| Administrador    | admin@liceomarti.ed.cr      | liceomarti  | Gestión completa |
| Administrador    | steven.salas@ejemplo.com    | (la que tenga en BD) | Admin ya existente |
| Profesor         | maria.lopez@liceomarti.ed.cr | liceomarti | Pasar lista (Español 7-1) |
| Profesor         | carlos.mendez@liceomarti.ed.cr | liceomarti | Pasar lista (Matemáticas 7-1) |
| Padre/Tutor      | ana.hernandez@correo.com    | liceomarti  | Ver “Mis estudiantes” |
| Padre/Tutor      | luis.torres@correo.com      | liceomarti  | Ver “Mis estudiantes” |

Los **estudiantes** (Sofía, Diego) no tienen usuario: no inician sesión.

---

## 3. Uso por rol

### 3.1 Administrador

- **Inicio:** mensaje de bienvenida y menú según rol.  
- **Gestión de Estudiantes:** listar/consultar estudiantes.  
- **Matrícula:** nuevo ingreso, regular, traslado. Al matricular se asigna sección automáticamente (máx. 25 por sección; si se llena, se crea la siguiente, p. ej. 7-1, 7-2).  
- **Asistencia:** ver todas las asignaciones y pasar lista en cualquier clase.  
- **Asignación de Materias:** crear asignaciones (profesor + materia + sección) y horarios (día 1–5 y hora inicio/fin).  
- **Registro de Personas:** alta de personas con rol: Administrador, Docente, Padre de familia/Tutor o **Estudiante**. Solo admin, profesor y tutor reciben usuario; los estudiantes no acceden al sistema.

### 3.2 Profesor

- **Inicio:** bienvenida y menú reducido.  
- **Asistencia:** solo sus clases.  
  1. Elegir “Clase” (materia y sección).  
  2. Elegir “Fecha”.  
  3. Se lista la sección; marcar por cada estudiante: Presente, Ausente, Justificado, Tardanza.  
  4. “Guardar asistencia”.  
  Solo se puede pasar lista **una vez por día** por esa asignación (unicidad en BD).

### 3.3 Padre de familia / Tutor

- **Inicio:** bienvenida y menú.  
- **Mis Estudiantes:** lista de estudiantes a su cargo (relación Encargado–Estudiante) con datos de matrícula (año, grado, sección, estado). Solo consulta; no edita matrícula ni asistencia.

---

## 4. Flujos principales

### Matrícula (admin)

1. Ir a **Matrícula** y elegir tipo: Nuevo ingreso / Regular / Traslado.  
2. Completar datos del estudiante (y encargado si aplica) y documentos.  
3. Al guardar, el sistema asigna **sección** según año a cursar y cupo (máx. 25); si la sección actual está llena, se crea una nueva (p. ej. 7-2).

### Pasar lista (profesor o admin)

1. Ir a **Asistencia**.  
2. Seleccionar clase (materia – sección) y fecha.  
3. Ajustar estado por estudiante y pulsar **Guardar asistencia**.  
4. Si ya había lista ese día para esa clase, se reemplaza con la nueva.

### Asignar materia a profesor (admin)

1. Ir a **Asignación de Materias**.  
2. Elegir Profesor, Materia y Sección.  
3. Añadir uno o más horarios (día 1–5, hora inicio y fin).  
4. Crear asignación.  
A partir de ahí, ese profesor verá la clase en **Asistencia** y podrá pasar lista.

---

## 5. Resumen de lo implementado

- **BD:** Rol `estudiante`; trigger de usuario solo para admin/profesor/tutor; asignación anual + `HorarioAsignacion` + `Sustitucion`; asistencia con `fecha` y unicidad (estudiante, asignación, fecha); observación opcional; ENUMs de estados; máximo 25 por sección en matrícula; auditoría en tablas clave.  
- **Backend:** Asignación de sección en matrícula (máx. 25); rutas de asignaciones y asistencia; sesión y “mis estudiantes” para tutor; estudiantes con rol `estudiante` sin usuario.  
- **Frontend:** Menú por rol (admin, profesor, tutor); páginas Asistencia (pasar lista), Asignación (crear asignaciones y horarios), Mis Estudiantes (tutor); registro de personas con rol Estudiante; contexto de autenticación y sesión.

Para probar: ejecutar migraciones (incluido `22` y `23_bd_datos_prueba.sql`), levantar backend y frontend, e iniciar sesión con los correos y contraseña indicados arriba.
