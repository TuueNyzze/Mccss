import { strict as assert } from 'assert';
import { TaskEngine } from '../../core/task-engine.js';

async function testTaskEngineSchedule() {
  const engine = new TaskEngine({ logger: console });
  engine.start();

  let ran = false;
  engine.schedule('t1', async () => { ran = true; }, 100);

  await new Promise(r => setTimeout(r, 250));
  assert.ok(ran, 'scheduled task should have run at least once');
  engine.stop();
}

async function testRunOnce() {
  const engine = new TaskEngine({ logger: console });
  let ran = false;
  engine.runOnce('o1', async () => { ran = true; });
  await new Promise(r => setTimeout(r, 50));
  assert.ok(ran, 'runOnce should execute the function');
}

async function runAll() {
  try {
    await testTaskEngineSchedule();
    await testRunOnce();
    console.log('All unit tests passed');
  } catch (e) {
    console.error('Unit tests failed', e);
    process.exitCode = 2;
  }
}

runAll();
