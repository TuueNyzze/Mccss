import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import promClient from 'prom-client';
import config from './Edenfield-main/config.js';
import { fetchSecretFromVault } from './core/vault.js';
import { Engine } from './core/task-engine.js';
import { jwtAuth } from './core/middleware/auth.js';
import { validateTaskPayload } from './core/middleware/validation.js';
import { registerSyncTask } from './core/tasks/sync-task.js';
import governance from './core/governance.js';
import mobileApi from './core/mobile-api.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Metrics
const collectDefault = promClient.collectDefaultMetrics;
collectDefault();

const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', true);

// Basic rate limiting
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT) || 200,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), started: process.env.START_TIME || null });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// Audit middleware: log important request metadata
app.use((req, res, next) => {
  try {
    governance.auditLog({ type: 'request', method: req.method, path: req.path, ip: req.ip });
  } catch (e) { /* best-effort */ }
  next();
});

// Minimal CORS so mobile UI served from another port can call these endpoints
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Mount mobile API router (chat, patch drafting, action queue)
app.use('/mobile', mobileApi);

// Simple task endpoints (protected)
const auth = jwtAuth();

app.post('/api/v1/tasks', auth, validateTaskPayload, (req, res) => {
  const { id, intervalMs } = req.body || {};

  Engine.schedule(id, async () => {
    logger.info({ msg: 'running task', id });
  }, Number(intervalMs));

  res.json({ ok: true, id });
});

app.get('/api/v1/tasks', auth, (req, res) => {
  res.json(Engine.list());
});

// Bootstrap process for substrate
async function bootstrap() {
  try {
    logger.info({ msg: 'Starting substrate runtime', system: config.system && config.system.name });

    // validate configuration and enforce governance
    try { governance.validateConfig(); } catch (e) { logger.error({ msg: 'config validation failed', error: String(e) }); throw e; }

    // enforce audit retention in background (best-effort)
    setInterval(() => governance.enforceRetention(), Number(process.env.AUDIT_RETENTION_CHECK_MS) || 12 * 60 * 60 * 1000);

    // Attempt to hydrate secrets if Vault info present (best-effort)
    if (process.env.VAULT_ADDR && process.env.VAULT_TOKEN) {
      try {
        const secret = await fetchSecretFromVault(process.env.VAULT_PATH || 'secret/data/eden', 'app-key');
        logger.info({ msg: 'vault: fetched secret', hasSecret: !!secret });
      } catch (e) {
        logger.warn({ msg: 'vault fetch failed', error: String(e) });
      }
    }

    Engine.start();

    // register built-in system tasks
    try {
      registerSyncTask(Engine, { logger, intervalMs: Number(process.env.SYNC_INTERVAL_MS) || 60000 });
      logger.info({ msg: 'registered built-in tasks' });
    } catch (e) {
      logger.warn({ msg: 'registering tasks failed', error: String(e) });
    }

    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => {
      logger.info({ msg: 'Substrate listening', port });
    });
  } catch (e) {
    logger.error({ msg: 'bootstrap failed', error: String(e) });
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down');
  Engine.stop();
  process.exit(0);
});
