import { strict as assert } from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpec } from '../src/parser.js';
import { compileAction } from '../src/compiler.js';
import { checkInvariants } from '../src/invariants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specText = fs.readFileSync(path.join(__dirname, '../spec/monolith.delta.spec'), 'utf8');

function testParsesWorldMetadata() {
  const ast = parseSpec(specText);
  assert.equal(ast.name, 'MCCSS-Lite / One-Way Cryptographic Gate v1');
  assert.equal(ast.version, '1.0.0');
  assert.equal(Object.keys(ast.memoryBanks).length, 6, 'expected 6 memory banks');
  assert.ok(ast.memoryBanks.BANK2_FRAMES, 'BANK2_FRAMES bank missing');
  assert.equal(ast.memoryBanks.BANK2_FRAMES.ORIGIN, 0x20020000);
  assert.equal(ast.memoryBanks.BANK2_FRAMES.ROLE, 'FRAMES_PRE_MAIN_POST');
}

function testParsesFramesAndPrimitives() {
  const ast = parseSpec(specText);
  assert.equal(ast.frames.PRE.align, 64);
  assert.deepEqual(ast.frames.PRE.fields.map((f) => f.name), ['PAYLOAD', 'LINEAGE_HASH', 'FLAGS', 'MONO_COUNTER']);
  assert.deepEqual(ast.frames.PRE.fields.map((f) => f.count), [4, 4, 1, 1]);
  assert.ok(ast.primitives.VERIFY_ONEWAY, 'VERIFY_ONEWAY primitive missing');
  assert.ok(ast.primitives.SEAL_FRAME.expandsTo.core0.length > 0);
  assert.equal(ast.invariants.length, 4);
  assert.ok(ast.invariants.some((i) => i.name === 'OneWay_Data_Flow'));
}

function testCompilesSecureStateTransition() {
  const ast = parseSpec(specText);
  const compiled = compileAction(ast, 'SecureStateTransition');

  assert.equal(compiled.cores.core1.length, 2, 'expected ASSERT_LINEAGE_ONEWAY + VERIFY_ONEWAY on core1');
  assert.equal(compiled.cores.core0.length, 1, 'expected SEAL_FRAME on core0');

  const assertBlock = compiled.cores.core1.find((b) => b.primitive === 'ASSERT_LINEAGE_ONEWAY');
  assert.ok(
    assertBlock.instructions.some((i) => i.includes('CMP  r7, r6')),
    'expected concrete registers substituted into ASSERT_LINEAGE_ONEWAY'
  );

  const verifyBlock = compiled.cores.core1.find((b) => b.primitive === 'VERIFY_ONEWAY');
  assert.ok(
    verifyBlock.instructions.some((i) => i.includes('CONST_REF') && i.includes('SENTRY.CONST_TARGET')),
    'expected CONST_REF left unresolved with a call-site annotation'
  );
}

function testCanonicalSpecHasNoInvariantViolations() {
  const ast = parseSpec(specText);
  const violations = checkInvariants(ast);
  assert.deepEqual(violations, [], `expected no violations, got: ${JSON.stringify(violations, null, 2)}`);
}

function testDetectsOneWayViolation() {
  const ast = parseSpec(specText);
  ast.bindings.HARDWARE_PROFILE.DETAILS.LINKS.__list[0].FROM = 'Core1';
  const violations = checkInvariants(ast);
  assert.ok(
    violations.some((v) => v.invariant === 'OneWay_Data_Flow'),
    'expected OneWay_Data_Flow violation to be detected'
  );
}

function testDetectsMissingRegisterBleed() {
  const ast = parseSpec(specText);
  ast.primitives.VERIFY_ONEWAY.expandsTo.core1 = ast.primitives.VERIFY_ONEWAY.expandsTo.core1.slice(0, -5);
  const violations = checkInvariants(ast);
  assert.ok(
    violations.some((v) => v.invariant === 'Register_Bleed_After_Verify'),
    'expected Register_Bleed_After_Verify violation to be detected'
  );
}

function run() {
  const tests = [
    testParsesWorldMetadata,
    testParsesFramesAndPrimitives,
    testCompilesSecureStateTransition,
    testCanonicalSpecHasNoInvariantViolations,
    testDetectsOneWayViolation,
    testDetectsMissingRegisterBleed
  ];

  let failed = 0;
  for (const t of tests) {
    try {
      t();
      console.log(`ok - ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL - ${t.name}`);
      console.error(e);
    }
  }

  if (failed > 0) {
    console.error(`${failed}/${tests.length} tests failed`);
    process.exitCode = 1;
  } else {
    console.log(`All ${tests.length} tests passed`);
  }
}

run();
