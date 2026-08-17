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

function checkRegisterBleed(ast, violations) {
  for (const [name, primitive] of Object.entries(ast.primitives)) {
    if (!/VERIFY_ONEWAY/i.test(name)) continue;
    for (const coreKey of ['core0', 'core1']) {
      const instrs = primitive.expandsTo[coreKey];
      if (!instrs || instrs.length === 0) continue;
      if (!endsWithBleed(instrs)) {
        violations.push({
          invariant: 'Register_Bleed_After_Verify',
          message: `PRIMITIVE ${name} (${coreKey}) does not end with a register-bleed epilogue`
        });
      }
    }
  }
}

function endsWithBleed(instrs) {
  return instrs.slice(-5).some((i) => /^MOVS\s+r\d+,\s*#0/i.test(i.trim()));
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
