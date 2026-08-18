import { strict as assert } from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpec } from '../src/parser.js';
import { compileAction } from '../src/compiler.js';
import { checkInvariants } from '../src/invariants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specText = fs.readFileSync(path.join(__dirname, '../spec/monolith.delta.spec'), 'utf8');
const hardenedText = fs.readFileSync(path.join(__dirname, '../spec/monolith.delta.hardened.spec'), 'utf8');

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

// The canonical v1.0.0 spec, taken literally, has two real register-bleed
// bugs found by manual review and confirmed by the (now register-flow-
// based, not just pattern-matched) invariant checker:
//   - VERIFY_ONEWAY never zeroes r0/r4, which hold the fully-mixed
//     permutation value right up to the CMP.
//   - ASSERT_LINEAGE_ONEWAY has no bleed epilogue at all, and never
//     documents that LAST_GOOD_REG (r6) is meant to persist across
//     calls — so the checker can't tell that gap apart from a real leak,
//     and correctly flags both r6 and r7.
// This test locks in that finding rather than asserting a clean spec.
// See spec/monolith.delta.hardened.spec for the fix.
function testCanonicalSpecHasKnownRegisterBleedGaps() {
  const ast = parseSpec(specText);
  const violations = checkInvariants(ast);

  assert.equal(violations.length, 2, `expected exactly 2 known violations, got: ${JSON.stringify(violations, null, 2)}`);
  assert.ok(violations.every((v) => v.invariant === 'Register_Bleed_After_Verify'));

  const verifyViolation = violations.find((v) => v.message.includes('VERIFY_ONEWAY'));
  assert.ok(verifyViolation, 'expected a VERIFY_ONEWAY violation');
  assert.ok(verifyViolation.message.includes('r0') && verifyViolation.message.includes('r4'));

  const assertViolation = violations.find((v) => v.message.includes('ASSERT_LINEAGE_ONEWAY'));
  assert.ok(assertViolation, 'expected an ASSERT_LINEAGE_ONEWAY violation');
  assert.ok(assertViolation.message.includes('r7') && assertViolation.message.includes('r6'));
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
    violations.some((v) => v.invariant === 'Register_Bleed_After_Verify' && v.message.includes('VERIFY_ONEWAY')),
    'expected Register_Bleed_After_Verify violation to be detected once the epilogue is removed entirely'
  );
}

// --- Hardened spec: everything above, fixed --------------------------

function testHardenedSpecParsesAndAddsKeyBank() {
  const ast = parseSpec(hardenedText);
  assert.equal(ast.version, '1.1.0');
  assert.equal(Object.keys(ast.memoryBanks).length, 7, 'expected 7 memory banks (adds BANK6_KEY)');
  assert.ok(ast.primitives.TRIGGER_SOFT_ANOMALY, 'TRIGGER_SOFT_ANOMALY primitive missing');
  assert.ok(ast.primitives.VAULT_VIOLATION, 'VAULT_VIOLATION primitive missing');
}

function testHardenedSpecHasNoInvariantViolations() {
  const ast = parseSpec(hardenedText);
  const violations = checkInvariants(ast);
  assert.deepEqual(violations, [], `expected no violations, got: ${JSON.stringify(violations, null, 2)}`);
}

function testHardenedCompileFixesRegisterBleed() {
  const ast = parseSpec(hardenedText);
  const compiled = compileAction(ast, 'SecureStateTransitionHardened');

  const verifyBlock = compiled.cores.core1.find((b) => b.primitive === 'VERIFY_ONEWAY');
  for (const reg of ['r0', 'r1', 'r2', 'r3', 'r4', 'r7']) {
    assert.ok(
      verifyBlock.instructions.some((i) => i.trim() === `MOVS ${reg}, #0`),
      `expected VERIFY_ONEWAY to zero ${reg}`
    );
  }

  const assertBlock = compiled.cores.core1.find((b) => b.primitive === 'ASSERT_LINEAGE_ONEWAY');
  assert.ok(
    assertBlock.instructions.some((i) => i.trim() === 'MOVS r7, #0'),
    'expected the transient counter register (r7) to be bled'
  );
  assert.ok(
    !assertBlock.instructions.some((i) => i.trim() === 'MOVS r6, #0'),
    'expected the persistent watchdog register (r6) to be left alone'
  );
}

function testAnomalyOnlyBank4IsNowMeaningful() {
  const ast = parseSpec(hardenedText);
  // Sanity: the real anomaly-path primitives already touch BANK4 and are correctly exempted.
  assert.deepEqual(checkInvariants(ast), []);

  // Now make a non-anomaly primitive touch BANK4 and confirm the check catches it —
  // proving Anomaly_Only_BANK4 is no longer vacuous now that BANK4 has real writers.
  ast.primitives.SEAL_FRAME.expandsTo.core0.push('STR  r0, [r0, #0]  // BANK4_ANOM_ORIGIN');
  const violations = checkInvariants(ast);
  assert.ok(
    violations.some((v) => v.invariant === 'Anomaly_Only_BANK4' && v.message.includes('SEAL_FRAME')),
    'expected a non-anomaly primitive touching BANK4 to be flagged'
  );
}

function run() {
  const tests = [
    testParsesWorldMetadata,
    testParsesFramesAndPrimitives,
    testCompilesSecureStateTransition,
    testCanonicalSpecHasKnownRegisterBleedGaps,
    testDetectsOneWayViolation,
    testDetectsMissingRegisterBleed,
    testHardenedSpecParsesAndAddsKeyBank,
    testHardenedSpecHasNoInvariantViolations,
    testHardenedCompileFixesRegisterBleed,
    testAnomalyOnlyBank4IsNowMeaningful
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
