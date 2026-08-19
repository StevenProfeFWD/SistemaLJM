import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Checkbox } from "../../components/ui/checkbox"
import { Label } from "../../components/ui/label"
import { CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Alert, AlertDescription } from "../../components/ui/alert"
import { EyeOff, Eye } from 'lucide-react'
import { LoginBackground } from "../../components/login/LoginBackground"

import servicio from '../../services/personaServices'
import { useAuth } from "../../context/AuthContext"
import { rutaInicioPorRol } from '../../lib/rutasPorRol'


function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState({ type: "", message: "" });

  const navigate = useNavigate();
  const { refreshUser } = useAuth();

const handleSubmit = async (e)  => {
    e.preventDefault();
    setToast({ type: "", message: "" });
    if (!email || !password) {
      setToast({ type: "error", message: "Por favor ingresa correo y contraseña." });
      return;
    }
    setIsLoading(true);

    try {
      const informacion = await servicio.postUsuarios(email, password)
      localStorage.setItem("infoUsuario", JSON.stringify(informacion))
      if (informacion.usuario.primer_login === true){
        setToast({ type: "success", message: `Bienvenido al sistema, ${informacion?.usuario?.nombre_completo || "usuario"}. Debe cambiar su contraseña.` });
        setTimeout(() => navigate("/cambiar-contraseña"), 400);
      } else {
        const sesion = await refreshUser();
        setToast({ type: "success", message: `Login exitoso. Bienvenido al sistema, ${sesion?.nombre_completo || informacion?.usuario?.nombre_completo || "usuario"}.` });
        const destino = rutaInicioPorRol(sesion?.rol);
        setTimeout(() => navigate(destino), 700);
      }
    } catch (err) {
      const backendMessage = err?.error || err?.message || "";
      if (backendMessage.toLowerCase().includes("usuario no encontrado")) {
        setToast({ type: "error", message: "Usuario no encontrado." });
      } else if (backendMessage.toLowerCase().includes("contraseña incorrecta") || backendMessage.toLowerCase().includes("correo no registrado")) {
        setToast({ type: "error", message: "Credenciales incorrectas." });
      } else if (backendMessage.toLowerCase().includes('demasiados intentos')) {
        setToast({ type: "error", message: backendMessage });
      } else {
        setToast({ type: "error", message: backendMessage || "No fue posible iniciar sesión." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoginBackground>
          <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                  <div className="w-48 h-16 rounded-lg flex items-center justify-center p-2">
                      <img src="/images/logo-liceo.jpg" alt="Ministerio de Educación Pública" className="w-full h-full object-contain"/>
                  </div>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground mb-2">Sistema de Asistencias</CardTitle>
              <p className="text-muted-foreground text-sm">Benemérito Liceo José Martí</p>
          </CardHeader>
          <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                  {toast?.message && (
                      <Alert className={toast.type === "success" ? "border-green-200 bg-green-50" : "border-destructive/20 bg-destructive/5"}>
                          <AlertDescription className={toast.type === "success" ? "text-green-700" : "text-destructive"}>{toast.message}</AlertDescription>
                      </Alert>
                  )}

                  <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium">
                          Correo Electrónico
                      </Label>
                      <Input
                          id="email"
                          type="email"
                          placeholder="estudiante@mep.go.cr"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-12 transition-all duration-200 focus:scale-[1.02] focus:shadow-lg"
                          required
                      />
                  </div>

                  <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-medium">
                          Contraseña
                      </Label>
                      <div className="relative">
                          <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="h-12 pr-12 transition-all duration-200 focus:scale-[1.02] focus:shadow-lg"
                              required
                          />
                          <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-accent/20"
                              onClick={() => setShowPassword(!showPassword)}
                              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          >
                              {showPassword ? (
                                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                  <Eye className="w-4 h-4 text-muted-foreground" />
                              )}
                          </Button>
                      </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center space-x-2 cursor-pointer">
                          <Checkbox disabled aria-disabled="true" />
                          <span className="text-muted-foreground">Recordarme (próximamente)</span>
                      </label>
                  </div>

                  <Button
                      type="submit"
                      className="w-full h-12 text-base font-medium transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                      disabled={isLoading}
                  >
                      {isLoading ? (
                        <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin motion-reduce:animate-none motion-reduce:border-primary-foreground" aria-hidden="true" />
                            <span>Iniciando sesión...</span>
                        </div>) : ("Iniciar Sesión")}
                  </Button>
              </form>

            {/* Footer */}
            <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">¿Necesitas ayuda?{" "} <button className="text-primary hover:text-primary/80 transition-colors font-medium">Contacta al administrador</button></p>
            </div>
            <div className="mt-3 text-center">
                <p className="text-xs text-muted-foreground">© 2025 Sistema de Asistencias Estudiantiles</p>
            </div>

          </CardContent>
    </LoginBackground>
  );
}

export default Login;
