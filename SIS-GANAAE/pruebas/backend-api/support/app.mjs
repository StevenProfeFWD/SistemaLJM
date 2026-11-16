/**
 * App Express de prueba: monta los routers reales bajo /api + notFound/errorHandler reales.
 * Requiere que `src/db/knex.js` ya esté sustituido por el fake (vi.mock o loader hook).
 */
import { appUrl, requireApp } from './paths.mjs';

const express = requireApp('express');
const cookieParser = requireApp('cookie-parser');

export async function crearApp() {
  const { default: epiRoutes } = await import(appUrl('routes/epiRoutes.js'));
  const { default: reportesRoutes } = await import(appUrl('routes/reportesRoutes.js'));
  const { errorHandler, notFound } = await import(appUrl('middlewares/errorHandler.js'));
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', reportesRoutes);
  app.use('/api', epiRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
