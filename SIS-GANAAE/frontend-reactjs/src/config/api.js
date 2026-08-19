import axios from 'axios';

const rawBase = import.meta.env.VITE_API_BASE_URL || 'https://sistemaljm.onrender.com/api';

export const API_BASE_URL = String(rawBase).replace(/\/$/, '');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let redirigiendoSesion = false;

/**
 * Ante 401 (sesión faltante/revocada/expirada): limpia estado local y vuelve al login.
 * No redirige en login/cambio de contraseña ni ante 403 de autorización de negocio.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    const enAuthPublica =
      url.includes('/personas/login') ||
      window.location.pathname.includes('/login') ||
      window.location.pathname.includes('/cambiar');

    if (status === 401 && !enAuthPublica && !redirigiendoSesion) {
      redirigiendoSesion = true;
      try {
        localStorage.removeItem('infoUsuario');
      } catch {
        /* ignore */
      }
      if (!window.location.pathname.includes('/login')) {
        window.location.assign('/login');
      }
      setTimeout(() => {
        redirigiendoSesion = false;
      }, 2000);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
