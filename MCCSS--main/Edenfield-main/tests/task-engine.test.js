// This file is informational; the actual runnable unit test uses scripts/run-unit-tests.js
// Kept for reference and possible future Jest integration.

import { TaskEngine } from '../../core/task-engine.js';

describe('TaskEngine basic', () => {
  test('schedules and runs', async () => {
    const engine = new TaskEngine({ logger: console });
    engine.start();
    let ran = false;
    engine.schedule('t1', async () => { ran = true; }, 50);
    await new Promise(r => setTimeout(r, 120));
    expect(ran).toBe(true);
    engine.stop();
  });
});
