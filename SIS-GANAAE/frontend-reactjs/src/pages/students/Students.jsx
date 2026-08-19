import MainBar from '../../components/side-bar/mainBar';
import StudentsScreen from '../../components/students-screen/StudentsScreen';
import { useAuth } from '../../context/AuthContext';

function Students() {
  const { user } = useAuth();
  const soloLectura = user?.rol !== 'administrador';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainBar />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
        <StudentsScreen soloLectura={soloLectura} />
      </main>
    </div>
  );
}

export default Students;
