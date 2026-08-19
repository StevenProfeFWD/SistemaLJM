import MainBar from "../side-bar/mainBar"
import InicioAdmin from "../../pages/admin/InicioAdmin"
import InicioPadre from "../../pages/tutor/InicioPadre"
import { useAuth } from "../../context/AuthContext"
import LoadingStatus from "../ui/LoadingStatus"

function Home() {
  const { user } = useAuth()

  if (user?.rol === 'administrador') {
    return <InicioAdmin />
  }

  if (user?.rol === 'padre_de_familia') {
    return <InicioPadre />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="container max-w-4xl">
          <h1 className="text-2xl font-semibold mb-2">Bienvenido al Sistema de Asistencias</h1>
          {user ? (
            <p className="text-muted-foreground">
              Hola, {user.nombre_completo}. Rol: {user.rol}. Use el menú para navegar.
            </p>
          ) : (
            <LoadingStatus label="Cargando perfil de usuario…" />
          )}
        </div>
      </main>
    </div>
  )
}

export default Home
