import { cn } from '../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { Eye } from 'lucide-react';

/**
 * Capa visual del login (gradiente + card). Reutilizable como fondo difuminado
 * detrás del modal de cambio de contraseña.
 */
export function LoginBackground({ blurred = false, children }) {
  return (
    <main
      id={blurred ? undefined : 'main-content'}
      tabIndex={blurred ? undefined : -1}
      aria-hidden={blurred ? true : undefined}
      className={cn(
        'min-h-screen w-full bg-gradient-to-br from-background via-muted/30 to-accent/10 flex items-center justify-center p-4',
        blurred && 'fixed inset-0 z-10 pointer-events-none select-none'
      )}
    >
      <Card
        className={cn(
          'w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm',
          blurred && 'scale-[0.96] shadow-2xl'
        )}
      >
        {blurred ? (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="w-48 h-16 rounded-lg flex items-center justify-center p-2">
                  <img
                    src="/images/logo-liceo.jpg"
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground mb-2">
                Sistema de Asistencias
              </CardTitle>
              <p className="text-muted-foreground text-sm">Benemérito Liceo José Martí</p>
            </CardHeader>
            <CardContent className="space-y-6" aria-hidden="true">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Correo Electrónico</Label>
                <Input
                  value="estudiante@mep.go.cr"
                  readOnly
                  disabled
                  className="h-12"
                  tabIndex={-1}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Contraseña</Label>
                <div className="relative">
                  <Input
                    value="••••••••"
                    readOnly
                    disabled
                    className="h-12 pr-12 tracking-widest"
                    tabIndex={-1}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox disabled tabIndex={-1} />
                Recordarme (próximamente)
              </div>
              <Button type="button" tabIndex={-1} className="w-full h-12 pointer-events-none">
                Iniciar Sesión
              </Button>
              <p className="text-center text-sm text-muted-foreground pt-2">
                © 2025 Sistema de Asistencias Estudiantiles
              </p>
            </CardContent>
          </>
        ) : (
          children
        )}
      </Card>
    </main>
  );
}

export default LoginBackground;
