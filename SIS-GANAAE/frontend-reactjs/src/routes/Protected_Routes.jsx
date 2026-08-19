import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingStatus from '../components/ui/LoadingStatus';

const ProtectedRoute = ({ children, allowedRoles = [], allowPendingPasswordChange = false }) => {
  const { user, loading } = useAuth();
  const infoUsuario = (() => {
    try {
      return JSON.parse(localStorage.getItem('infoUsuario') || 'null');
    } catch {
      return null;
    }
  })();
  const pendingFirstLogin = infoUsuario?.usuario?.primer_login === true;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <LoadingStatus label="Verificando sesión…" />
      </div>
    );
  }

  if (!user && !(allowPendingPasswordChange && pendingFirstLogin)) {
    return <Navigate to="/login" replace />;
  }

  if (user && allowedRoles.length > 0 && !allowedRoles.includes(user.rol)) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;