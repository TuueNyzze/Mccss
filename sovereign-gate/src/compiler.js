// Expands an ACTION's PRIMITIVE calls into per-core instruction lists.
//
// Substitution rule: a primitive's INPUTS entries are used as the
// substitution values for placeholder tokens that appear literally inside
// its ASM_CORE0/ASM_CORE1 templates. When an INPUT's declared value looks
// like a concrete register (e.g. "r7"), it is inlined directly. When it
// isn't (a human description, or a symbolic reference like
// "SENTRY.CONST_TARGET"), the placeholder is left in the emitted
// instruction — since it isn't a valid operand on its own — and annotated
// with the call-site binding so an assembler/linker pass (or a human) can
// resolve it. This matches how the spec itself is written: some
// primitives (ASSERT_LINEAGE_ONEWAY) declare literal registers as their
// INPUTS, others (VERIFY_ONEWAY, SEAL_FRAME) declare descriptive INPUTS
// and already hardcode concrete registers in their ASM bodies.

const REGISTER_RE = /^r\d{1,2}$/i;

export function compileAction(ast, actionName) {
  const action = ast.actions[actionName];
  if (!action) throw new Error(`Unknown ACTION: ${actionName}`);

  const cores = { core0: [], core1: [] };
  const trace = [];

  for (const call of action.post) {
    const primitive = ast.primitives[call.name];
    if (!primitive) throw new Error(`ACTION ${actionName} references unknown PRIMITIVE ${call.name}`);

    const substitutions = buildSubstitutions(primitive, call);

    for (const coreKey of ['core0', 'core1']) {
      const instructions = primitive.expandsTo[coreKey] || [];
      if (instructions.length === 0) continue;
      cores[coreKey].push({
        primitive: call.name,
        instructions: instructions.map((ins) => substitute(ins, substitutions))
      });
    }

    trace.push({ primitive: call.name, args: call.args, substitutions });
  }

  return { action: actionName, main: action.main, cores, trace };
}

function buildSubstitutions(primitive, call) {
  const subs = {};
  for (const [name, defaultValue] of Object.entries(primitive.inputs)) {
    if (REGISTER_RE.test(String(defaultValue).trim())) {
      subs[name] = defaultValue;
    } else {
      subs[name] = {
        unresolved: name,
        boundTo: call.args[name] !== undefined ? call.args[name] : defaultValue
      };
    }
  }
  return subs;
}

function substitute(instruction, substitutions) {
  let out = instruction;
  const annotations = [];
  for (const [token, value] of Object.entries(substitutions)) {
    const re = new RegExp(`\\b${token}\\b`);
    if (!re.test(out)) continue;
    if (typeof value === 'object') {
      annotations.push(`${token} -> ${value.boundTo} (unresolved symbol)`);
    } else {
      out = out.replace(new RegExp(`\\b${token}\\b`, 'g'), value);
    }
  }
  return annotations.length ? `${out}  ; ${annotations.join('; ')}` : out;
}
