import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Users,
  PieChart,
  UserCheck,
  Book,
  User,
  Link2,
  ClipboardList,
  Upload,
  History,
  GraduationCap,
  UserCog,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const SECCIONES = [
  {
    titulo: 'General',
    items: [{ icon: BarChart3, label: 'Inicio', href: '/inicio' }],
  },
  {
    titulo: 'Configuración del Sistema',
    items: [
      { icon: User, label: 'Registro de Personas', href: '/registro' },
      { icon: UserCog, label: 'Gestión de docentes', href: '/gestion-docentes' },
      { icon: Upload, label: 'Precarga masiva (CSV)', href: '/precarga-estudiantes' },
      { icon: Book, label: 'Gestión de materias', href: '/materias' },
    ],
  },
  {
    titulo: 'Control Académico',
    items: [
      { icon: ClipboardList, label: 'Matrícula', href: '/matricula' },
      { icon: Link2, label: 'Asignación de Materias', href: '/asignacion' },
      { icon: GraduationCap, label: 'Profesores guía', href: '/gestion-profesores-guia' },
      { icon: Users, label: 'Gestión de Estudiantes', href: '/estudiantes' },
    ],
  },
  {
    titulo: 'Asistencia y Convivencia',
    items: [
      { icon: UserCheck, label: 'Asistencia', href: '/asistencia' },
      { icon: User, label: 'Estados especiales', href: '/orientacion/estados' },
      { icon: History, label: 'Historial de estados', href: '/orientacion/historial' },
    ],
  },
  {
    titulo: 'Reportes',
    items: [{ icon: PieChart, label: 'Reportes estadísticos', href: '/dashboard-reportes' }],
  },
];

function SidebarAdmin({ onNavigate }) {
  const { pathname } = useLocation();

  return (
    <ul className="space-y-6">
      {SECCIONES.map((seccion) => (
        <li key={seccion.titulo}>
          <span className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-2 block px-3">
            {seccion.titulo}
          </span>
          <ul className="space-y-1">
            {seccion.items.map((item) => {
              const activo = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => onNavigate?.()}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      activo
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default SidebarAdmin;
