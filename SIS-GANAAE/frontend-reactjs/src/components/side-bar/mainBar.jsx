import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Users,
  PieChart,
  UserCheck,
  LogOut,
  Menu,
  ChevronDown,
  History,
  ShieldAlert,
  Shield,
  GraduationCap,
  Home,
  LayoutGrid,
  X,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { useAuth } from "../../context/AuthContext"
import SidebarAdmin from './SidebarAdmin'
import grupoGuiaServicio from '../../services/grupoGuiaServices'

const ITEMS_SUPER_ADMIN = [
  { icon: Shield, label: 'Panel principal', href: '/panel-super-admin' },
  { icon: Shield, label: 'Gestión de administradores', href: '/superadmin/administradores' },
  { icon: Users, label: 'Gestión de estudiantes', href: '/estudiantes' },
  { icon: PieChart, label: 'Gráficos estadísticos', href: '/dashboard-reportes' },
  { icon: History, label: 'Reportes de orientación', href: '/orientacion/historial' },
];

const ITEMS_PROFESOR = [
  { icon: BarChart3, label: "Inicio", href: "/inicio" },
  { icon: UserCheck, label: "Asistencia", href: "/asistencia" },
];

const ITEM_ORIENTADOR = [
  { icon: LayoutGrid, label: 'Panel de Control', href: '/panel-orientador' },
  { icon: Users, label: "Gestión de Estudiantes", href: "/orientacion/estados", roles: ['orientador'] },
  { icon: History, label: "Historial de estados", href: "/orientacion/historial", roles: ['orientador'] },
  { icon: PieChart, label: "Reportes y Alertas", href: "/dashboard-reportes", roles: ['orientador'] },
];

const ITEM_TUTOR = [
  { icon: Home, label: "Inicio", href: "/inicio", roles: ['padre_de_familia'] },
  { icon: Users, label: "Mis Estudiantes", href: "/mis-estudiantes", roles: ['padre_de_familia'] },
  { icon: UserCheck, label: "Historial de asistencia", href: "/historial-asistencia-hijos", roles: ['padre_de_familia'] },
  { icon: ShieldAlert, label: "Estados especiales", href: "/estados-especiales-hijos", roles: ['padre_de_familia'] },
];

const MainBar = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [isReportesOpen, setIsReportesOpen] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [esProfesorGuia, setEsProfesorGuia] = useState(false)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (user?.rol !== 'profesor') {
      setEsProfesorGuia(false)
      return
    }
    grupoGuiaServicio
      .getMiSeccionGuia()
      .then((data) =>
        setEsProfesorGuia(Boolean(data?.seccionesGuia?.length || data?.seccionGuia))
      )
      .catch(() => setEsProfesorGuia(false))
  }, [user?.rol, user?.id])

  const handleCerrarSesion = () => {
    localStorage.removeItem('infoUsuario')
    logout(() => navigate('/login'))
  }

  const cerrarMenuMovil = () => setIsMobileMenuOpen(false)

  const menuItems = useMemo(() => {
    if (!user?.rol) return []
    if (user.rol === 'super_administrador') {
      return ITEMS_SUPER_ADMIN
    }
    if (user.rol === 'orientador') {
      return ITEM_ORIENTADOR
    }
    if (user.rol === 'profesor') {
      const items = [...ITEMS_PROFESOR]
      if (esProfesorGuia) {
        items.push({ icon: GraduationCap, label: 'Mi Grupo Guía', href: '/grupo-guia' })
      }
      return items
    }
    if (user.rol === 'padre_de_familia') {
      return ITEM_TUTOR.filter((item) => item.roles.includes(user.rol))
    }
    return []
  }, [user?.rol, esProfesorGuia])

  const esAdministrador = user?.rol === 'administrador'

  return (
    <>
      {!isMobileMenuOpen && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="fixed top-3 left-3 z-30 lg:hidden shadow-md bg-background"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-expanded={false}
          aria-controls="main-sidebar-nav"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}

      {isMobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Cerrar menú de navegación"
          onClick={cerrarMenuMovil}
        />
      )}

      <aside
        id="main-sidebar-nav"
        className={cn(
          'flex h-screen w-80 max-w-[min(100vw,20rem)] flex-col border-r border-border bg-background shrink-0',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out motion-reduce:transition-none',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:z-auto lg:translate-x-0 lg:max-w-none'
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
              <img src="/images/logo-liceo.jpg" alt="Logo del Liceo" className="h-10 w-10 rounded-lg object-cover"/>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">Liceo José Martí</h2>
              <p className="text-sm text-muted-foreground">Puntarenas</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={cerrarMenuMovil}
            className="lg:hidden shrink-0"
            aria-expanded={isMobileMenuOpen}
            aria-controls="main-sidebar-nav"
            aria-label="Cerrar menú de navegación"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4" aria-label="Navegación principal">
          {esAdministrador ? (
            <SidebarAdmin onNavigate={cerrarMenuMovil} />
          ) : (
            <ul className="space-y-2">
              {menuItems.map((item, index) => (
                <li key={index}>
                  {item.hasSubmenu ? (
                    <div>
                      <button onClick={() => setIsReportesOpen(!isReportesOpen)}
                        className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors","hover:bg-accent hover:text-accent-foreground",
                          isReportesOpen && "bg-accent text-accent-foreground",
                        )}>
                        <div className="flex items-center gap-3">
                          <item.icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isReportesOpen && "rotate-180")} />
                      </button>
                      {isReportesOpen && item.submenu && (
                        <ul className="ml-8 mt-2 space-y-1">
                          {item.submenu.map((subItem, subIndex) => (
                            <li key={subIndex}>
                              <Link
                                to={subItem.href}
                                onClick={cerrarMenuMovil}
                                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                {subItem.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Link
                      to={item.href}
                      onClick={cerrarMenuMovil}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </nav>
        <div className="border-t border-border p-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={handleCerrarSesion}
          >
            <LogOut className="h-5 w-5" />
            Cerrar sesión
          </Button>
        </div>
      </aside>
    </>
  )
}

export default MainBar
