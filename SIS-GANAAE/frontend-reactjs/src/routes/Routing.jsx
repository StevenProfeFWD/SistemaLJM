import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Loading from '../pages/loading-screen/loading'
import Login from '../pages/login/Login'
import LoadingScreen from '../components/loading-screen/loading-screen'
import ProtectedRoute from './Protected_Routes'

// Login y splash: import estática para TTI mínimo en arranque
// Módulos pesados: carga bajo demanda por ruta (code splitting)

const Homepage = lazy(() => import('../pages/home/Homepage'))
const CambioContra = lazy(() => import('../pages/change-password/CambioContra'))

// Admin / padrón / matrícula
const Students = lazy(() => import('../pages/students/Students'))
const RegistrarPersonas = lazy(() => import('../pages/admin/registrarPersonas'))
const Matricula = lazy(() => import('../pages/matricula/Matricula'))
const PrecargaEstudiantes = lazy(() => import('../pages/admin/PrecargaEstudiantes'))
const Asignacion = lazy(() => import('../pages/asignacion/Asignacion'))
const GestionMaterias = lazy(() => import('../pages/admin/GestionMaterias'))
const GestionSecciones = lazy(() => import('../pages/admin/GestionSecciones'))
const GestionDocentes = lazy(() => import('../pages/admin/GestionDocentes'))
const DashboardAdmin = lazy(() => import('../pages/admin/DashboardAdmin'))

// Orientación
const PanelOrientador = lazy(() => import('../pages/orientador/PanelOrientador'))
const GestionEstadosOrientacion = lazy(() => import('../pages/orientador/GestionEstadosOrientacion'))
const HistorialEstados = lazy(() => import('../pages/orientador/HistorialEstados'))

// Super administrador
const PanelSuperAdmin = lazy(() => import('../pages/superadmin/PanelSuperAdmin'))
const GestionAdministradores = lazy(() => import('../pages/superadmin/GestionAdministradores'))

// Profesor / asistencia
const Asistencia = lazy(() => import('../pages/asistencia/Asistencia'))
const GrupoGuia = lazy(() => import('../pages/grupo-guia/GrupoGuia'))

// Tutor / padres
const MisEstudiantes = lazy(() => import('../pages/tutor/MisEstudiantes'))
const HistorialAsistenciaHijos = lazy(() => import('../pages/tutor/HistorialAsistenciaHijos'))
const EstadosHijos = lazy(() => import('../pages/tutor/EstadosHijos'))

function Routing() {
  return (
    <Router>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path='/' element={<Loading />}/>
          <Route path='/login' element={<Login/>}/>
          <Route path='/cambiar-contraseña' element={<ProtectedRoute allowedRoles={['administrador', 'profesor', 'padre_de_familia', 'orientador', 'super_administrador']} allowPendingPasswordChange={true}><CambioContra/></ProtectedRoute>}/>
          <Route path='/inicio' element={<ProtectedRoute allowedRoles={['administrador', 'profesor', 'padre_de_familia', 'orientador']}><Homepage/></ProtectedRoute>}/>
          <Route path='/panel-super-admin' element={<ProtectedRoute allowedRoles={['super_administrador']}><PanelSuperAdmin /></ProtectedRoute>}/>
          <Route path='/superadmin/administradores' element={<ProtectedRoute allowedRoles={['super_administrador']}><GestionAdministradores /></ProtectedRoute>}/>
          <Route path='/estudiantes' element={<ProtectedRoute allowedRoles={['administrador', 'super_administrador']}><Students /></ProtectedRoute>} />
          <Route path='/registro' element={<ProtectedRoute allowedRoles={['administrador']}><RegistrarPersonas/></ProtectedRoute>}/>
          <Route path='/matricula' element={<ProtectedRoute allowedRoles={['administrador']}><Matricula/></ProtectedRoute>}/>
          <Route path='/precarga-estudiantes' element={<ProtectedRoute allowedRoles={['administrador']}><PrecargaEstudiantes/></ProtectedRoute>}/>
          <Route path='/asistencia' element={<ProtectedRoute allowedRoles={['administrador', 'profesor']}><Asistencia/></ProtectedRoute>}/>
          <Route path='/grupo-guia' element={<ProtectedRoute allowedRoles={['profesor']}><GrupoGuia /></ProtectedRoute>}/>
          <Route path='/asignacion' element={<ProtectedRoute allowedRoles={['administrador']}><Asignacion/></ProtectedRoute>}/>
          <Route path='/gestion-profesores-guia' element={<ProtectedRoute allowedRoles={['administrador']}><GestionSecciones /></ProtectedRoute>}/>
          <Route path='/gestion-docentes' element={<ProtectedRoute allowedRoles={['administrador']}><GestionDocentes /></ProtectedRoute>}/>
          <Route path='/materias' element={<ProtectedRoute allowedRoles={['administrador']}><GestionMaterias /></ProtectedRoute>}/>
          <Route path='/dashboard-reportes' element={<ProtectedRoute allowedRoles={['administrador', 'orientador', 'super_administrador']}><DashboardAdmin /></ProtectedRoute>}/>
          <Route path='/panel-orientador' element={<ProtectedRoute allowedRoles={['orientador']}><PanelOrientador /></ProtectedRoute>}/>
          <Route path='/orientacion/estados' element={<ProtectedRoute allowedRoles={['administrador', 'orientador']}><GestionEstadosOrientacion /></ProtectedRoute>}/>
          <Route path='/orientacion/historial' element={<ProtectedRoute allowedRoles={['administrador', 'orientador', 'super_administrador']}><HistorialEstados /></ProtectedRoute>}/>
          <Route path='/mis-estudiantes' element={<ProtectedRoute allowedRoles={['padre_de_familia']}><MisEstudiantes/></ProtectedRoute>}/>
          <Route path='/historial-asistencia-hijos' element={<ProtectedRoute allowedRoles={['padre_de_familia']}><HistorialAsistenciaHijos/></ProtectedRoute>}/>
          <Route path='/estados-especiales-hijos' element={<ProtectedRoute allowedRoles={['padre_de_familia']}><EstadosHijos/></ProtectedRoute>}/>
        </Routes>
      </Suspense>
    </Router>
  )
}

export default Routing
