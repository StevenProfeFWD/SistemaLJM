import { Link } from 'react-router-dom';
import MainBar from '../../components/side-bar/mainBar';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Users, PieChart, History } from 'lucide-react';

export default function PanelOrientador() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Panel del orientador</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Departamento de orientación: gestión de estados especiales y seguimiento de permanencia estudiantil.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link to="/orientacion/estados">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <Users className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Gestión de estudiantes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Registrar suspensiones, permisos institucionales y expulsiones por periodo.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/orientacion/historial">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <History className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Historial y reportes PDF</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Consulte el historial de estados, filtre por periodo y exporte comprobantes oficiales.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/dashboard-reportes">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <PieChart className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Reportes y alertas de permanencia</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Métricas estadísticas, gráficos y alertas tempranas (≥ 3 tardías o ausencias).
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
