# sovereign-gate

A compiler/verifier prototype for the `MONOLITH.DELTA` DSL: a spec for a
one-way, hardware-enforced gate between an "Executor" core and a "Sentry"
core (modeled on a dual-RP2040-Pico, simplex-FIFO/SPI topology).

This directory is a standalone subsystem, unrelated to the MCCSS
substrate/Edenfield admin apps documented in the repo root `CLAUDE.md`. It
has its own `package.json` and no dependency on `Edenfield-main`.

## What this is (and isn't)

The canonical spec lives at `spec/monolith.delta.spec` (verbatim from the
original `MONOLITH.DELTA` design doc). This tool:

- **Parses** the DSL into a structured AST (`src/parser.js`).
- **Compiles** an `ACTION` by expanding its `PRIMITIVE` calls into
  per-core instruction lists, substituting each primitive's `INPUTS`
  into its `EXPANDS_TO` template (`src/compiler.js`).
- **Verifies** the four `INVARIANTS` declared in the spec
  (`src/invariants.js`), rejecting compilation if any are violated — this
  is the "Enforce INVARIANTS at compile-time" rule from
  `BINDING COMPILER_BACKEND`.
- **Emits** per-core pseudo-assembly listings and a C memory-map header
  (`src/codegen.js`).

It is **not** a real assembler/linker and does not produce bootable RP2040
firmware. The `.gen.s` output uses the mnemonics exactly as written in the
spec, which mixes real Cortex-M0+ Thumb instructions with unresolved
pseudo-ops (e.g. `LOAD frame payload/hash/counter into r1,r2,r7`,
`BL _Compute_Lineage_Hash` with no body defined anywhere in the spec).
Treat the output as a documented intermediate form that a human (or a
follow-up pass) still needs to hand-complete before it can be assembled
with the Pico SDK's `arm-none-eabi` toolchain.

## Usage

```bash
cd sovereign-gate
npm test                  # runs tests/compile.test.js (plain node assert, no deps)
npm run compile            # compiles spec/monolith.delta.spec's first ACTION into build/
node ./src/cli.js compile spec/monolith.delta.spec SecureStateTransition --out build
```

A successful compile writes `build/core0.gen.s`, `build/core1.gen.s`, and
`build/memory_map.h`. A rejected compile (invariant violation) prints each
violation and exits with status `2`.

## Substitution rule (why some tokens stay unresolved)

A `PRIMITIVE`'s `INPUTS` block sometimes declares a literal register (e.g.
`ASSERT_LINEAGE_ONEWAY`'s `COUNTER_REG: "r7"`) and sometimes a human
description (e.g. `VERIFY_ONEWAY`'s `CONST_REF: "Immutable invariant
constant"`). The compiler only inlines a substitution when the declared
value looks like a concrete register (`r0`–`r99`); otherwise it leaves the
placeholder token in the emitted instruction — since a description isn't a
valid operand — and appends an annotation comment recording what the
`ACTION`'s call site bound it to, e.g.:

```
CMP  r4, CONST_REF  ; CONST_REF -> SENTRY.CONST_TARGET (unresolved symbol)
```

This mirrors how the spec itself is written and keeps the transformation
deterministic and testable against the literal spec text (see
`tests/compile.test.js`).

## Design/security notes from reviewing the spec

- `VERIFY_ONEWAY`'s "cryptographic" check is an unkeyed XOR-mix + 32-bit
  rotate, not a MAC/hash — anyone who can write to `BANK3_SPIBUF` can
  compute the same permutation. If this is meant to authenticate frames
  (not just detect corruption), it needs a keyed primitive (HMAC, or a
  keyed permutation) instead.
- `ASSERT_LINEAGE_ONEWAY`'s `BLS` monotonicity check is unsigned and will
  treat 32-bit counter wraparound as a permanent anomaly — likely the
  intended fail-safe behavior for a sovereign gate, but worth confirming
  and documenting explicitly rather than leaving implicit.
- `VERIFY_ONEWAY`'s register-bleed epilogue zeroes `r1`, `r2`, `r3`, `r7`,
  `r12`, but not `r0`/`r4` — both of which hold the fully-mixed
  permutation value at the `CMP` — right before the epilogue runs. If the
  bleed's purpose is to prevent that value leaking via register/debug
  state, `r0`/`r4` should be included.
- `SEAL_FRAME` only ever writes `PAYLOAD[0]`; `PAYLOAD[1..3]` and all of
  `LINEAGE_HASH[4]` are declared in the `FRAME` layout but never populated
  by any primitive shown in the spec (`_Compute_Lineage_Hash` is called
  but not defined). Fine for a "hello world" `ACTION`, but worth flagging
  as unimplemented rather than assuming the frame is fully sealed.
- `Anomaly_Only_BANK4` is currently unenforceable in a meaningful sense:
  no primitive in the spec writes to `BANK4_ANOM` at all (the anomaly/
  vault branch targets `_Trigger_Soft_Anomaly_Counter` and
  `_Vault_Violation` are referenced but never defined), so the invariant
  passes vacuously. `checkAnomalyOnlyBank4` in `src/invariants.js` is
  still written generically so it will catch a real violation once an
  anomaly-handling primitive is added.
- On the positive side, the topology is a genuinely strong property: both
  links (`Core0->Core1` FIFO, `PicoA->PicoB` SPI) are physically simplex,
  so even a fully compromised Executor core can never read Sentry state
  or open a reverse channel — at worst it can cause Sentry to reject
  frames. The software invariants checked here are a second line of
  defense on top of that hardware guarantee, not a substitute for it.
