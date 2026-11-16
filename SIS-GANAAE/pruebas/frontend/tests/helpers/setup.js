import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cliente HTTP falso: ninguna prueba puede llegar a un backend real
// (la app apunta por defecto a https://sistemaljm.onrender.com/api).
vi.mock('@/config/api', () => {
  const fail = (url) => Promise.reject(new Error(`Llamada HTTP no simulada: ${url}`));
  const apiClient = {
    get: vi.fn(fail),
    post: vi.fn(fail),
    put: vi.fn(fail),
    patch: vi.fn(fail),
    delete: vi.fn(fail),
    interceptors: { response: { use: vi.fn() }, request: { use: vi.fn() } },
  };
  return { default: apiClient, apiClient, API_BASE_URL: 'http://mock.invalid/api' };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  });
}
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:mock';
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
