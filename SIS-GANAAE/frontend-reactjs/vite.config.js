import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,      // Escucha en 0.0.0.0, accesible desde fuera del contenedor
    port: 5173,      // Puerto que coincide con docker-compose
    strictPort: true // Evita que busque otro puerto si 5173 está ocupado
  }
})

