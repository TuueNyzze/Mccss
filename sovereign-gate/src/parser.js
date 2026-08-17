// Parser for the MONOLITH.DELTA DSL used by spec/monolith.delta.spec.
//
// The DSL is a hand-authored, YAML-flavored notation with a few custom
// extensions (WORD field declarations, EXPANDS_TO/ASM_CORE* instruction
// lists, bare ACTION statement blocks). This parser is a generic
// indentation-based reader: it groups sibling lines by relative indent,
// classifies each group as a list item, a WORD field, a "KEY: value" pair,
// or a raw statement, and recurses into nested blocks. It is not a general
// YAML parser — it only implements the constructs this spec actually uses.

function stripComment(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function tokenize(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const stripped = stripComment(raw);
    if (!stripped.trim()) continue;
    const indent = stripped.match(/^[ \t]*/)[0].length;
    out.push({ indent, text: stripped.trim() });
  }
  return out;
}

// Groups a flat, already-indented slice of lines into siblings (the first
// line's indent defines the sibling level); each sibling absorbs any more
// deeply indented lines that follow it as its own subtree.
function groupLines(lines) {
  if (lines.length === 0) return [];
  const childIndent = lines[0].indent;
  const groups = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i++;
    const subtree = [];
    while (i < lines.length && lines[i].indent > childIndent) {
      subtree.push(lines[i]);
      i++;
    }
    groups.push({ line, subtree });
  }
  return groups;
}

function flattenLines(lines) {
  return lines.map((l) => l.text);
}

function unquote(s) {
  const t = s.trim();
  if (t.startsWith('"')) {
    const last = t.lastIndexOf('"');
    if (last > 0) return t.slice(1, last);
  }
  return t;
}

function parseScalar(str) {
  const t = str.trim();
  if (t.startsWith('"')) return unquote(t);
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}

// Splits on a top-level separator, ignoring separators inside quoted strings.
function splitTopLevel(str, sep) {
  const parts = [];
  let inQuotes = false;
  let cur = '';
  for (const ch of str) {
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === sep) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseFlowMap(str) {
  const inner = str.trim().replace(/^\{/, '').replace(/\}$/, '');
  const out = {};
  for (const piece of splitTopLevel(inner, ',')) {
    const p = piece.trim();
    if (!p) continue;
    const idx = p.indexOf(':');
    if (idx === -1) continue;
    out[p.slice(0, idx).trim()] = parseScalar(p.slice(idx + 1).trim());
  }
  return out;
}

const KV_RE = /^([A-Za-z_][A-Za-z0-9_ ]*?):\s*(.*)$/;
const WORD_RE = /^WORD\s+([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/;

function resolveValue(inline, subtree) {
  if (inline === '>') return flattenLines(subtree).join(' ').trim();
  if (inline.startsWith('{') && inline.endsWith('}')) return parseFlowMap(inline);
  if (inline !== '') return parseScalar(inline);
  if (subtree.length === 0) return null;
  return parseChildren(groupLines(subtree));
}

function parseListItem(g) {
  const dashMatch = g.line.text.match(/^-\s*/);
  const after = g.line.text.slice(dashMatch[0].length);
  const contentIndent = g.line.indent + dashMatch[0].length;

  if (after.startsWith('{')) return parseFlowMap(after);

  if (after.startsWith('"')) {
    const quoteCount = (after.match(/"/g) || []).length;
    if (quoteCount >= 2) return unquote(after);
    // Unterminated quote: the string continues on subsequent, deeper-indented lines.
    return unquote([after, ...flattenLines(g.subtree)].join(' '));
  }

  if (KV_RE.test(after)) {
    const itemLines = [{ indent: contentIndent, text: after }, ...g.subtree];
    return parseChildren(groupLines(itemLines));
  }

  return [after, ...flattenLines(g.subtree)].join(' ').trim();
}

// Classifies a set of sibling groups as a list, a dict (possibly with WORD
// fields), or a raw block of free-form statement lines (used for ACTION's
// MAIN/POST bodies, which have no "KEY:" structure at all).
function parseChildren(groups) {
  let isList = false;
  const listItems = [];
  const fields = [];
  const raw = [];
  const dict = {};

  for (const g of groups) {
    const t = g.line.text;

    if (t.startsWith('-')) {
      isList = true;
      listItems.push(parseListItem(g));
      continue;
    }

    const wordMatch = t.match(WORD_RE);
    if (wordMatch) {
      fields.push({ name: wordMatch[1], count: wordMatch[2] ? Number(wordMatch[2]) : 1 });
      continue;
    }

    const kvMatch = t.match(KV_RE);
    if (kvMatch) {
      dict[kvMatch[1].trim()] = resolveValue(kvMatch[2].trim(), g.subtree);
      continue;
    }

    raw.push([t, ...flattenLines(g.subtree)].join(' ').trim());
  }

  if (isList) return { __list: listItems };
  if (raw.length && Object.keys(dict).length === 0 && fields.length === 0) return { __raw: raw };
  if (fields.length) dict.__fields = fields;
  if (raw.length) dict.__raw = raw;
  return dict;
}

function normalizeMemoryBanks(value) {
  return { ...value };
}

function normalizeFrame(value) {
  return { align: Number(value.ALIGN), fields: value.__fields || [] };
}

function normalizePrimitive(value) {
  const inputs = {};
  for (const item of (value.INPUTS && value.INPUTS.__list) || []) {
    const [[k, v]] = Object.entries(item);
    inputs[k] = v;
  }
  const expandsTo = value.EXPANDS_TO || {};
  return {
    purpose: value.PURPOSE || '',
    inputs,
    expandsTo: {
      core0: (expandsTo.ASM_CORE0 && expandsTo.ASM_CORE0.__list) || [],
      core1: (expandsTo.ASM_CORE1 && expandsTo.ASM_CORE1.__list) || []
    }
  };
}

function parseCall(str) {
  const m = str.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (!m) return { name: str, args: {} };
  const [, name, argsStr] = m;
  const args = {};
  for (const piece of splitTopLevel(argsStr, ',')) {
    const p = piece.trim();
    if (!p) continue;
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    args[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
  }
  return { name, args };
}

function normalizeAction(value) {
  const mainLines = (value.MAIN && value.MAIN.__raw) || [];
  const postLines = (value.POST && value.POST.__raw) || [];
  return { main: mainLines, post: postLines.map(parseCall) };
}

function toAST(raw, fallbackName) {
  const world = {
    name: null,
    version: null,
    purpose: null,
    topology: {},
    memoryBanks: {},
    frames: {},
    invariants: [],
    primitives: {},
    actions: {},
    bindings: {}
  };

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'NAME') world.name = value;
    else if (key === 'VERSION') world.version = value;
    else if (key === 'PURPOSE') world.purpose = value;
    else if (key === 'TOPOLOGY') world.topology = value;
    else if (key === 'MEMORY_BANKS') world.memoryBanks = normalizeMemoryBanks(value);
    else if (key === 'INVARIANTS') world.invariants = (value.__list || []).map((i) => ({ name: i.NAME, rule: i.RULE }));
    else if (key.startsWith('FRAME ')) world.frames[key.slice(6).trim()] = normalizeFrame(value);
    else if (key.startsWith('PRIMITIVE ')) world.primitives[key.slice(10).trim()] = normalizePrimitive(value);
    else if (key.startsWith('ACTION ')) world.actions[key.slice(7).trim()] = normalizeAction(value);
    else if (key.startsWith('BINDING ')) world.bindings[key.slice(8).trim()] = value;
  }

  if (!world.name) world.name = fallbackName;
  return world;
}

export function parseSpec(text) {
  const lines = tokenize(text);
  const worldIdx = lines.findIndex((l) => /^WORLD\s+\w+:$/.test(l.text));
  if (worldIdx === -1) throw new Error('No WORLD block found in spec');

  const worldLine = lines[worldIdx];
  const worldName = worldLine.text.match(/^WORLD\s+(\w+):$/)[1];

  const body = [];
  for (let i = worldIdx + 1; i < lines.length; i++) {
    if (lines[i].indent <= worldLine.indent) break;
    body.push(lines[i]);
  }

  const raw = parseChildren(groupLines(body));
  return toAST(raw, worldName);
}
