import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { validarSeguridadEntorno } from './utils/validateEnv.js';
import { corsOriginCallback } from './utils/corsConfig.js';
import { apiRateLimiter } from './middlewares/rateLimitAuth.js';
import { verificarTokenInterno } from './middlewares/verificarToken.js';
import personaRoutes from './routes/personaRoutes.js';
import matriculaRoutes from './routes/matriculaRoutes.js';
import asignacionAsistenciaRoutes from './routes/asignacionAsistenciaRoutes.js';
import padresRoutes from './routes/padresRoutes.js';
import reportesRoutes from './routes/reportesRoutes.js';
import orientacionRoutes from './routes/orientacionRoutes.js';
import materiaRoutes from './routes/materiaRoutes.js';
import superadminRoutes from './routes/superadminRoutes.js';
import profesorGuiaRoutes from './routes/profesorGuiaRoutes.js';
import seccionRoutes from './routes/seccionRoutes.js';
import personalRoutes from './routes/personalRoutes.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { iniciarLimpiezaJwtCron } from './jobs/jwtCleanupCron.js';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
validarSeguridadEntorno();

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(compression());

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
  cors({
    origin: corsOriginCallback,
    credentials: true,
  })
);

app.use('/api', apiRateLimiter);

// Archivos subidos: requieren sesión válida (evita listado/descarga anónima)
app.use(
  '/uploads',
  verificarTokenInterno,
  express.static(path.join(__dirname, '../uploads'), {
    index: false,
    dotfiles: 'deny',
  })
);

app.use('/api', personaRoutes);
app.use('/api', matriculaRoutes);
app.use('/api', asignacionAsistenciaRoutes);
app.use('/api', padresRoutes);
app.use('/api', reportesRoutes);
app.use('/api', orientacionRoutes);
app.use('/api', materiaRoutes);
app.use('/api', superadminRoutes);
app.use('/api', profesorGuiaRoutes);
app.use('/api', seccionRoutes);
app.use('/api', personalRoutes);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  // Programación en segundo plano: no retrasa el listen ni el healthcheck
  iniciarLimpiezaJwtCron();
});
