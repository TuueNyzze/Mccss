import { PermissionContext } from '../permissions/context.js';
import { Sync } from '../sync.js';

export function registerSyncTask(engine, { logger = console, intervalMs = 60000 } = {}) {
  // schedule a safe sync pull that runs as system
  engine.schedule('sync-pull', async () => {
    const prev = { ...PermissionContext.current };
    try {
      PermissionContext.current.role = 'system';
      logger.info && logger.info('[sync-task] starting pull');
      const remote = await Sync.pull();
      logger.info && logger.info('[sync-task] pull complete', { ok: true, got: !!remote });
    } catch (e) {
      logger.error && logger.error('[sync-task] error', e);
    } finally {
      PermissionContext.current = prev;
    }
  }, intervalMs);
}
