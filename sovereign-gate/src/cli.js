#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseSpec } from './parser.js';
import { compileAction } from './compiler.js';
import { checkInvariants } from './invariants.js';
import { generateAsm, generateMemoryMapHeader } from './codegen.js';

function main() {
  const [, , cmd, specPathArg, actionArg] = process.argv;

  if (cmd !== 'compile') {
    console.error('Usage: node src/cli.js compile <spec-file> [ACTION_NAME] [--out <dir>]');
    process.exitCode = 1;
    return;
  }

  const specPath = path.resolve(process.cwd(), specPathArg || 'spec/monolith.delta.spec');
  const outFlagIdx = process.argv.indexOf('--out');
  const outDir = path.resolve(process.cwd(), outFlagIdx !== -1 ? process.argv[outFlagIdx + 1] : 'build');

  const text = fs.readFileSync(specPath, 'utf8');
  const ast = parseSpec(text);

  const actionName = actionArg && !actionArg.startsWith('--') ? actionArg : Object.keys(ast.actions)[0];
  if (!actionName) {
    console.error('No ACTION found in spec');
    process.exitCode = 1;
    return;
  }

  // BINDING COMPILER_BACKEND.RULES: "Enforce INVARIANTS at compile-time;
  // reject code that violates ..." — run invariant checks before emitting
  // any output.
  const violations = checkInvariants(ast);
  if (violations.length > 0) {
    console.error(`Compilation rejected — ${violations.length} invariant violation(s):`);
    for (const v of violations) console.error(`  [${v.invariant}] ${v.message}`);
    process.exitCode = 2;
    return;
  }

  const compiled = compileAction(ast, actionName);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'core0.gen.s'), generateAsm(compiled, 'core0'));
  fs.writeFileSync(path.join(outDir, 'core1.gen.s'), generateAsm(compiled, 'core1'));
  fs.writeFileSync(path.join(outDir, 'memory_map.h'), generateMemoryMapHeader(ast));

  console.log(`Compiled WORLD "${ast.name}" ACTION "${actionName}" — 0 invariant violations.`);
  console.log(`Wrote ${path.relative(process.cwd(), outDir)}/{core0.gen.s, core1.gen.s, memory_map.h}`);
}

main();
