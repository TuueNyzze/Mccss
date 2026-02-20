// core/readiness.js
// Readiness engine: computes a readiness score and status based on config and runtime signals.

import config from '../config.js';
import { Engine } from './task-engine.js';
import { SyncLog } from './sync-log.js';

export function computeReadiness() {
  const base = 50; // baseline

  // config-based adjustments
  const compliance = (config.nist && config.nist.compliancePercentage) ? Number(config.nist.compliancePercentage) : 0;
  const perf = (config.performance && config.performance.uptime_sla) ? 99.99 : 0;

  // task engine activity
  const tasks = Engine ? Engine.list().length : 0;

  // recent sync success rate heuristic
  const logs = SyncLog.list ? SyncLog.list().slice(-20) : [];
  const successes = logs.filter(l => l.type === 'push' || l.type === 'sync').length;
  const successRate = logs.length ? Math.round((successes / logs.length) * 100) : 100;

  let score = base;
  score += Math.min(Math.max(compliance / 2, 0), 25); // compliance contributes up to 25
  score += tasks > 0 ? 10 : 0;
  score += successRate > 80 ? 15 : Math.round((successRate / 100) * 10);

  // clamp
  if (score > 100) score = 100;
  if (score < 0) score = 0;

  const status = score > 80 ? 'green' : score > 50 ? 'yellow' : 'red';

  return {
    score,
    status,
    details: {
      compliancePercentage: compliance,
      taskCount: tasks,
      recentSuccessRate: successRate
    }
  };
}

export default { computeReadiness };
