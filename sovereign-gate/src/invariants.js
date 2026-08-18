// Static checks matching the four INVARIANTS declared in the spec's
// WORLD.INVARIANTS section. These run over the parsed AST (not the
// compiled per-action output) since the invariants are properties of the
// PRIMITIVE/BINDING definitions themselves, not of any one ACTION.

export function checkInvariants(ast) {
  const violations = [];
  checkOneWayDataFlow(ast, violations);
  checkRegisterBleed(ast, violations);
  checkFramesInBank2(ast, violations);
  checkAnomalyOnlyBank4(ast, violations);
  return violations;
}

function checkOneWayDataFlow(ast, violations) {
  const binding = ast.bindings.HARDWARE_PROFILE;
  const links = (binding && binding.DETAILS && binding.DETAILS.LINKS && binding.DETAILS.LINKS.__list) || [];
  for (const link of links) {
    const type = String(link.TYPE || '');
    const from = String(link.FROM || '');
    if (!/SIMPLEX/i.test(type)) {
      violations.push({
        invariant: 'OneWay_Data_Flow',
        message: `Link ${JSON.stringify(link)} is not declared SIMPLEX`
      });
    }
    if (/^(Core1|SENTRY|PicoB)$/i.test(from)) {
      violations.push({
        invariant: 'OneWay_Data_Flow',
        message: `Link ${JSON.stringify(link)} originates from the sentry side, violating one-way flow`
      });
    }
  }
}

// --- Register_Bleed_After_Verify -------------------------------------
//
// The invariant's own text names exactly two primitives: "Every
// VERIFY_ONEWAY or ASSERT_LINEAGE_ONEWAY expansion must end with a
// mandatory register-bleed epilogue that zeroes all intermediate
// registers used in the permutation." So this check is scoped to those
// two primitives by exact name, not a fuzzy match.
//
// A register is considered "used in the permutation" if it is (a) written
// during the mix/compare phase (everything before the decision branch),
// or (b) read as an operand of the CMP that feeds that branch — even if
// it was never freshly computed here (e.g. a value passed in by the
// caller). A primitive's own INPUTS can mark a register as intentionally
// persistent/stateful (its declared value contains the word
// "persistent") — that register is exempt, since zeroing it would break
// the very state the primitive is designed to carry across calls (e.g.
// ASSERT_LINEAGE_ONEWAY's last-known-good counter).
//
// "Bled" is computed with a simple forward dataflow pass over the
// instructions after the branch: a register is zero if the last
// instruction to write it was an immediate `MOVS rX, #0`, or a
// register-to-register MOV/MOVS copying from a register that was zero at
// that point. Any other write marks it non-zero again.

const WRITE_RE = /^(LDR[BH]?|EORS?|LSLS|LSRS|ORRS?|ANDS?|ADDS?|SUBS?|MOVS?|RORS?)\s+r(\d+)\b/i;
const BRANCH_RE = /^B(NE|LS|EQ|CS|CC|LE|GE|LT|GT|HI|LO)\b/i;
const CMP_RE = /^CMP\s+r(\d+)\s*,\s*(\S+)/i;
const ZERO_RE = /^MOVS?\s+r(\d+)\s*,\s*#0\b/i;
const REG_MOV_RE = /^MOVS?\s+r(\d+)\s*,\s*r(\d+)\b/i;
const REGISTER_PREFIX_RE = /^r\d+/i;

function substitutePlaceholders(instr, primitive) {
  let out = instr;
  for (const [name, value] of Object.entries(primitive.inputs)) {
    const regMatch = String(value).trim().match(REGISTER_PREFIX_RE);
    if (!regMatch) continue;
    out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), regMatch[0]);
  }
  return out;
}

function extractExemptRegisters(primitive) {
  const exempt = new Set();
  for (const value of Object.values(primitive.inputs)) {
    const m = String(value).match(/^r(\d+)\b.*persistent/i);
    if (m) exempt.add(`r${m[1]}`);
  }
  return exempt;
}

function computeMixRegisters(mixPhase, exempt) {
  const regs = new Set();
  let lastCmp = null;
  for (const instr of mixPhase) {
    const write = instr.match(WRITE_RE);
    if (write) regs.add(`r${write[2]}`);
    const cmp = instr.match(CMP_RE);
    if (cmp) lastCmp = cmp;
  }
  if (lastCmp) {
    regs.add(`r${lastCmp[1]}`);
    if (/^r\d+$/i.test(lastCmp[2])) regs.add(lastCmp[2].toLowerCase());
  }
  for (const reg of exempt) regs.delete(reg);
  return regs;
}

function computeBledRegisters(epilogue) {
  const isZero = new Map();
  for (const instr of epilogue) {
    const zero = instr.match(ZERO_RE);
    if (zero) {
      isZero.set(`r${zero[1]}`, true);
      continue;
    }
    const mov = instr.match(REG_MOV_RE);
    if (mov) {
      isZero.set(`r${mov[1]}`, !!isZero.get(`r${mov[2]}`));
      continue;
    }
    const write = instr.match(WRITE_RE);
    if (write) isZero.set(`r${write[2]}`, false);
  }
  return new Set([...isZero.entries()].filter(([, z]) => z).map(([r]) => r));
}

function checkRegisterBleed(ast, violations) {
  for (const primName of ['VERIFY_ONEWAY', 'ASSERT_LINEAGE_ONEWAY']) {
    const primitive = ast.primitives[primName];
    if (!primitive) continue;
    const exempt = extractExemptRegisters(primitive);

    for (const coreKey of ['core0', 'core1']) {
      const rawInstrs = primitive.expandsTo[coreKey];
      if (!rawInstrs || rawInstrs.length === 0) continue;
      const instrs = rawInstrs.map((i) => substitutePlaceholders(i, primitive));

      const branchIdx = instrs.findIndex((i) => BRANCH_RE.test(i.trim()));
      if (branchIdx === -1) continue; // no decision branch in this core's expansion

      const mixPhase = instrs.slice(0, branchIdx);
      const epilogue = instrs.slice(branchIdx + 1);

      const mixRegisters = computeMixRegisters(mixPhase, exempt);
      const bledRegisters = computeBledRegisters(epilogue);
      const missing = [...mixRegisters].filter((r) => !bledRegisters.has(r));

      if (missing.length > 0) {
        violations.push({
          invariant: 'Register_Bleed_After_Verify',
          message: `PRIMITIVE ${primName} (${coreKey}) leaves register(s) ${missing.join(', ')} unbled after the permutation/comparison`
        });
      }
    }
  }
}

function checkFramesInBank2(ast, violations) {
  const entries = Object.entries(ast.memoryBanks).filter(([, b]) => b.ROLE === 'FRAMES_PRE_MAIN_POST');
  if (entries.length === 0) {
    violations.push({ invariant: 'Frames_In_BANK2', message: 'No memory bank declared with ROLE FRAMES_PRE_MAIN_POST' });
  } else if (entries[0][0] !== 'BANK2_FRAMES') {
    violations.push({
      invariant: 'Frames_In_BANK2',
      message: `FRAMES_PRE_MAIN_POST role is assigned to ${entries[0][0]}, expected BANK2_FRAMES`
    });
  }

  for (const [frameName, frame] of Object.entries(ast.frames)) {
    if (frame.align % 64 !== 0) {
      violations.push({
        invariant: 'Frames_In_BANK2',
        message: `FRAME ${frameName} is not 64-byte aligned (ALIGN=${frame.align})`
      });
    }
  }

  const seal = ast.primitives.SEAL_FRAME;
  if (seal) {
    const refsBank2 = (seal.expandsTo.core0 || []).some((i) => /BANK2_FRAMES_ORIGIN/.test(i));
    if (!refsBank2) {
      violations.push({
        invariant: 'Frames_In_BANK2',
        message: 'SEAL_FRAME does not anchor frame writes to BANK2_FRAMES_ORIGIN'
      });
    }
  }
}

function checkAnomalyOnlyBank4(ast, violations) {
  for (const [name, primitive] of Object.entries(ast.primitives)) {
    const isAnomalyPath = /ANOMALY/i.test(name) || /anomaly/i.test(primitive.purpose || '');
    for (const coreKey of ['core0', 'core1']) {
      for (const instr of primitive.expandsTo[coreKey] || []) {
        if (/BANK4|_ANOM/i.test(instr) && !isAnomalyPath) {
          violations.push({
            invariant: 'Anomaly_Only_BANK4',
            message: `PRIMITIVE ${name} (${coreKey}) touches the anomaly bank outside an anomaly-designated path: "${instr}"`
          });
        }
      }
    }
  }
}
