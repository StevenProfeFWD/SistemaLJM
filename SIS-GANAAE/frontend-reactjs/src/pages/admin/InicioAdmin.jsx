import { Link } from 'react-router-dom';
import MainBar from '../../components/side-bar/mainBar';
import {
  Wrench,
  Database,
  GraduationCap,
  ClipboardCheck,
  PieChart,
  ArrowRight,
} from 'lucide-react';

const TARJETAS = [
  {
    icon: Database,
    titulo: 'Gestión de Personal y Datos',
    etiqueta: 'Configuración',
    descripcion:
      'Registro de personas, control de catálogo de materias y procesos de precarga masiva por archivos CSV.',
    enlaces: [
      { label: 'Registro de Personas', href: '/registro' },
      { label: 'Gestión de docentes', href: '/gestion-docentes' },
      { label: 'Precarga masiva (CSV)', href: '/precarga-estudiantes' },
      { label: 'Gestión de materias', href: '/materias' },
    ],
  },
  {
    icon: GraduationCap,
    titulo: 'Control y Matrícula Académica',
    etiqueta: 'Académico',
    descripcion:
      'Asignación de estudiantes a secciones, vinculación de docentes a materias y administración del catálogo de alumnos.',
    enlaces: [
      { label: 'Matrícula', href: '/matricula' },
      { label: 'Asignación de Materias', href: '/asignacion' },
      { label: 'Profesores guía', href: '/gestion-profesores-guia' },
      { label: 'Gestión de Estudiantes', href: '/estudiantes' },
    ],
  },
  {
    icon: ClipboardCheck,
    titulo: 'Control de Asistencia y Convivencia',
    etiqueta: 'Convivencia',
    descripcion:
      'Supervisión global de marcas de asistencia en el aula e ingreso/auditoría de estados especiales (suspensiones y permisos).',
    enlaces: [
      { label: 'Asistencia', href: '/asistencia' },
      { label: 'Estados especiales', href: '/orientacion/estados' },
      { label: 'Historial de estados', href: '/orientacion/historial' },
    ],
  },
  {
    icon: PieChart,
    titulo: 'Analítica y Reportes Estadísticos',
    etiqueta: 'Reportes',
    descripcion:
      'Consulta de gráficos dinámicos del nivel de asistencia general y monitoreo de alertas de permanencia escolar.',
    enlaces: [{ label: 'Reportes estadísticos', href: '/dashboard-reportes' }],
  },
];

export default function InicioAdmin() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold">Panel de Administración Operativa</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión académica, control de matrícula, asistencia y analítica estratégica del centro
              educativo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {TARJETAS.map((tarjeta) => (
              <article
                key={tarjeta.titulo}
                className="group flex flex-col rounded-xl border border-slate-700/80 bg-slate-900 p-6 text-slate-100 shadow-lg transition-all duration-200 hover:border-slate-500 hover:bg-slate-800/95 hover:shadow-xl"
              >
                <div className="mb-4">
                  <tarjeta.icon className="h-8 w-8 text-sky-400 mb-3" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                    {tarjeta.etiqueta}
                  </p>
                  <h2 className="text-lg font-semibold leading-snug">{tarjeta.titulo}</h2>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed flex-1">{tarjeta.descripcion}</p>
                <div className="mt-5 pt-4 border-t border-slate-700/60 flex flex-wrap gap-2">
                  {tarjeta.enlaces.map((enlace) => (
                    <Link
                      key={enlace.href}
                      to={enlace.href}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-sky-600 hover:text-white"
                    >
                      {enlace.label}
                      <ArrowRight className="h-3 w-3 opacity-70 group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
