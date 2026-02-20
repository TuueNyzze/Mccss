import fs from 'fs';
import path from 'path';
import pino from 'pino';
import config from '../Edenfield-main/config.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const AUDIT_DIR = process.env.AUDIT_DIR || path.resolve(process.cwd(), 'audit_logs');
try { fs.mkdirSync(AUDIT_DIR, { recursive: true }); } catch (e) { /* best-effort */ }

export function validateConfig() {
  // Minimal validation using the key parameters in config
  if (!config || !config.system || !config.system.name) {
    throw new Error('invalid configuration: missing system.name');
  }

  if (!config.encryption || !config.encryption.algorithm) {
    logger.warn('encryption not fully configured; defaulting to AES-256-GCM');
  }

  return true;
}

export function auditLog(entry = {}) {
  const record = {
    time: new Date().toISOString(),
    system: config.system && config.system.name,
    ...entry
  };

  // write to rotating daily file (simple append)
  try {
    const file = path.join(AUDIT_DIR, `${new Date().toISOString().slice(0,10)}.log`);
    fs.appendFile(file, JSON.stringify(record) + '\n', () => {});
  } catch (e) {
    logger.warn('audit write failed', String(e));
  }

  logger.info({ audit: true, ...record });
}

export function enforceRetention() {
  const days = (config.audit && config.audit.retentionDays) || 2555;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(AUDIT_DIR);
    files.forEach(f => {
      try {
        const p = path.join(AUDIT_DIR, f);
        const stat = fs.statSync(p);
        if (stat.mtimeMs < cutoff) fs.unlinkSync(p);
      } catch (e) { /* ignore per-file errors */ }
    });
  } catch (e) { /* ignore */ }
}

export default { validateConfig, auditLog, enforceRetention };
