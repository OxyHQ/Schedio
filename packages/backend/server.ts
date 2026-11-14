// --- Imports ---
import express from 'express';
import { closeDatabase, connectToDatabase } from './src/db';
import {
  createOxyAuthMiddleware,
  createOxyCors,
  createOxyRateLimit,
  createOxySecurityHeaders,
  oxyTrustProxy,
  startEcosystemTraffic,
} from '@oxy.so/core/server';
import { oxy } from './src/oxy';

// Routers
import capabilityRoutes from './src/routes/capabilities';
import profileSettingsRoutes from './src/routes/profileSettings';
import publishingRoutes from './src/publishing/routes';
import { publishingErrors } from './src/publishing/errors';
import { openapi } from '@schedio/contracts';
import { startPublishingWorker } from './src/publishing/worker';
import analyticsRoutes from './src/routes/analytics';

import { logger } from './src/utils/logger';
import { validateTokenCipherConfiguration } from './src/utils/tokenCipher';

// The entry point, never imported by a test: the publisher starts with the process.
const traffic = startEcosystemTraffic({
  service: 'schedio',
  ready: () => server?.listening === true,
});
const app = express();
app.use(traffic.observeHttp);

// The real client behind Cloudflare and the ALB, for the rate limiter's key.
app.set('trust proxy', oxyTrustProxy);
app.use(createOxySecurityHeaders());
app.use(
  createOxyCors({
    appOrigins: [
      process.env.FRONTEND_URL || 'https://schedio.app',
      ...(process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:8081', 'http://localhost:8082']),
    ],
  }),
);
// Answers are per user and per session; no shared cache may keep one.
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection middleware
app.use(async (_req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    logger.error('PostgreSQL connection unavailable:', error);
    if (res.headersSent) {
      return;
    }
    res.status(503).json({
      error: { code: 'service_unavailable', message: 'Database temporarily unavailable' },
    });
  }
});

// --- API ROUTES ---
// Public API routes (no authentication required)
const publicApiRouter = express.Router();

// Health check
publicApiRouter.get('/openapi.json', (_req, res) => res.json(openapi()));

publicApiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'schedio-backend' });
});

// Authenticated API routes (require authentication)
const authenticatedApiRouter = express.Router();
authenticatedApiRouter.use('/profile', profileSettingsRoutes);
authenticatedApiRouter.use(publishingRoutes);
authenticatedApiRouter.use('/analytics', analyticsRoutes);

// Mount public and authenticated API routers. Health/public routes are mounted
// before the limiter; everything after is limited per user (per hashed IP when
// anonymous).
app.use('/api', publicApiRouter);
app.use(createOxyRateLimit(oxy));
app.use('/_oxy/capabilities', capabilityRoutes);
app.use('/api', createOxyAuthMiddleware(oxy), authenticatedApiRouter);
app.use('/api', (_req, res) =>
  res.status(404).json({ error: { code: 'unknown_route', message: 'Unknown API route' } }),
);
app.use(publishingErrors);

// --- Root API Welcome Route ---
app.get('/', async (_req, res) => {
  res.json({ message: 'Welcome to Schedio API', version: '1.0.0' });
});

// --- Server Listen ---
const PORT = process.env.PORT || 3000;
let server: ReturnType<typeof app.listen> | undefined;
let stopWorker: (() => Promise<void>) | undefined;

function installGracefulShutdown(): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}; stopping Schedio backend`);

    const forceExit = setTimeout(() => {
      logger.error('Timed out while stopping Schedio backend');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    const finish = (exitCode: number) => {
      void Promise.resolve(stopWorker?.())
        .then(() => traffic.stop())
        .then(() => closeDatabase())
        .then(
          () => process.exit(exitCode),
          (error: unknown) => {
            logger.error('Failed to close PostgreSQL cleanly', error);
            process.exit(1);
          },
        );
    };

    if (!server) {
      finish(0);
      return;
    }
    server.close((error?: Error) => finish(error ? 1 : 0));
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

const bootServer = async () => {
  try {
    validateTokenCipherConfiguration();
    await connectToDatabase();
    stopWorker = startPublishingWorker();
    server = app.listen(PORT, () => {
      logger.info(`Schedio backend server running on port ${PORT}`);
    });
    installGracefulShutdown();
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

if (require.main === module) {
  void bootServer();
}

export default app;
