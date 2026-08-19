import { Link } from 'react-router-dom';
import MainBar from '../../components/side-bar/mainBar';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Shield, Users, PieChart, History } from 'lucide-react';

export default function PanelSuperAdmin() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold">Panel del Super Administrador</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión de cuentas administrativas y consulta estratégica de reportes, estudiantes e historial de orientación.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Link to="/superadmin/administradores">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full border-primary/20">
                <CardHeader>
                  <Shield className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Gestión de administradores</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Crear, editar y activar o desactivar las cuentas de administradores operativos del liceo.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/estudiantes">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <Users className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Gestión de estudiantes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Consulta del catálogo de alumnos matriculados, sección actual y tutor vinculado (solo lectura).
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/dashboard-reportes">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <PieChart className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Gráficos estadísticos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Asistencia general, tardías, ausencias y alertas de permanencia estudiantil.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/orientacion/historial">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <History className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Reportes de orientación</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Historial de suspensiones, permisos y expulsiones con descarga de comprobantes oficiales.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
