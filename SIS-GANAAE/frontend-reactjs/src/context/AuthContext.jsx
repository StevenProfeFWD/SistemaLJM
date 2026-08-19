import { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../config/api';

const API = apiClient;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/personas/sesion')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = (onDone) => {
    API.post('/personas/logout')
      .catch(() => {})
      .finally(() => {
        try {
          localStorage.removeItem('infoUsuario');
        } catch {
          /* ignore */
        }
        setUser(null);
        if (typeof onDone === 'function') onDone();
      });
  };
  const refreshUser = () => {
    return API.get('/personas/sesion')
      .then((res) => { setUser(res.data); return res.data; })
      .catch(() => { setUser(null); return null; });
  };
  const isAuthenticated = Boolean(user);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
