import LoadingScreen from '../../components/loading-screen/loading-screen';
import { useState, useEffect } from 'react';
import Login from '../login/Login';


function Loading() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simula un tiempo de carga (2 segundos)
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <LoadingScreen />
    );
  }

  return (
    <Login />
  );

}

export default Loading