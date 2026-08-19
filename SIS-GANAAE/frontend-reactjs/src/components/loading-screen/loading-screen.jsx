// Importaciones de terceros
import { GraduationCap } from "lucide-react"
import LoadingStatus from "../ui/LoadingStatus"

function LoadingScreen() {
    return (
        <main
            id="main-content"
            tabIndex={-1}
            className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent/10 flex items-center justify-center flex-col"
        >
            <img className="w-2/6 h-2/6 mb-10" src="/images/logo-mep.png" alt="Logotipo del ministerio de educación pública" />
            <div className="text-center">
                <div className="relative mb-8">
                    <div className="w-20 h-20 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-2xl animate-pulse motion-reduce:animate-none">
                        <GraduationCap className="w-10 h-10 text-primary-foreground" aria-hidden="true" />
                    </div>
                    <div className="absolute -inset-4 bg-primary/20 rounded-3xl blur-xl animate-ping motion-reduce:animate-none motion-reduce:opacity-0" aria-hidden="true" />
                </div>

                <h2 className="text-2xl font-bold text-foreground mb-4 animate-fade-in-up motion-reduce:animate-none">Sistema de Asistencias</h2>

                <div className="flex items-center justify-center space-x-2 mb-6 motion-reduce:hidden" aria-hidden="true">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-300" />
                </div>

                <LoadingStatus label="Cargando tu experiencia educativa…" className="justify-center animate-fade-in-up delay-500 motion-reduce:animate-none" />
            </div>
        </main>
    )
}

export default LoadingScreen
