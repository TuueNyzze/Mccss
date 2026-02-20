// core/task-engine.js
// Lightweight task engine for scheduled background work in the substrate runtime

export class TaskEngine {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.tasks = new Map();
    this.intervals = new Map();
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger.info && this.logger.info('[TaskEngine] started');
  }

  stop() {
    this.intervals.forEach(clearInterval);
    this.intervals.clear();
    this.running = false;
    this.logger.info && this.logger.info('[TaskEngine] stopped');
  }

  schedule(id, fn, intervalMs) {
    if (this.intervals.has(id)) {
      clearInterval(this.intervals.get(id));
    }

    const wrapped = async () => {
      try {
        await fn();
        const meta = this.tasks.get(id) || {};
        meta.lastRun = new Date().toISOString();
        this.tasks.set(id, meta);
      } catch (e) {
        this.logger.error && this.logger.error('[TaskEngine] task error', e);
      }
    };

    const iv = setInterval(wrapped, intervalMs);
    this.intervals.set(id, iv);
    this.tasks.set(id, { intervalMs, lastRun: null });
    this.logger.info && this.logger.info('[TaskEngine] scheduled', id, intervalMs);
    return id;
  }

  runOnce(id, fn) {
    Promise.resolve()
      .then(fn)
      .then(() => {
        const meta = this.tasks.get(id) || {};
        meta.lastRun = new Date().toISOString();
        this.tasks.set(id, meta);
      })
      .catch(e => this.logger.error && this.logger.error('[TaskEngine] runOnce error', e));
  }

  list() {
    return Array.from(this.tasks.entries()).map(([id, meta]) => ({ id, ...meta }));
  }
}

export const Engine = new TaskEngine();
