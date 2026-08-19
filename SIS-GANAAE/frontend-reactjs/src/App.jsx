import './App.css'
import Routing from './routes/Routing'
import SkipToMainContent from './components/a11y/SkipToMainContent'
// Rutas de la aplicación (incluye /materias, /asignacion, etc.): ver Routing.jsx

function App() {
  return (
    <div>
      <SkipToMainContent />
      <Routing />
    </div>
  );
}

export default App
