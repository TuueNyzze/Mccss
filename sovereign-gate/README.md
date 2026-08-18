# sovereign-gate

A compiler/verifier prototype for the `MONOLITH.DELTA` DSL: a spec for a
one-way, hardware-enforced gate between an "Executor" core and a "Sentry"
core (modeled on a dual-RP2040-Pico, simplex-FIFO/SPI topology).

This directory is a standalone subsystem, unrelated to the MCCSS
substrate/Edenfield admin apps documented in the repo root `CLAUDE.md`. It
has its own `package.json` and no dependency on `Edenfield-main`.

## What this is (and isn't)

Two spec files:

- **`spec/monolith.delta.spec`** — the canonical v1.0.0 spec, kept
  byte-for-byte as originally given. It compiles, but has two real
  register-bleed bugs (see below) — those are left in place rather than
  silently fixed, since this file is meant to be the unmodified source of
  truth.
- **`spec/monolith.delta.hardened.spec`** — a v1.1.0 revision fixing every
  issue found by reviewing the original: complete register bleeds, a
  keyed lineage hash, full `PAYLOAD`/`LINEAGE_HASH` writes, and concrete
  implementations of the two branch targets (`_Trigger_Soft_Anomaly_Counter`,
  `_Vault_Violation`) the original only referenced by name. Its header
  comment enumerates every change against the original.

The tool itself:

- **Parses** the DSL into a structured AST (`src/parser.js`).
- **Compiles** an `ACTION` by expanding its `PRIMITIVE` calls into
  per-core instruction lists, substituting each primitive's `INPUTS`
  into its `EXPANDS_TO` template (`src/compiler.js`).
- **Verifies** the four `INVARIANTS` declared in the spec
  (`src/invariants.js`), rejecting compilation if any are violated — this
  is the "Enforce INVARIANTS at compile-time" rule from
  `BINDING COMPILER_BACKEND`. `Register_Bleed_After_Verify` is real
  register-flow analysis (tracks which registers hold live intermediate
  state and whether they're provably zeroed before the primitive exits),
  not a string-pattern heuristic — it's what caught the two bugs below.
- **Emits** per-core pseudo-assembly listings and a C memory-map header
  (`src/codegen.js`).

It is **not** a real assembler/linker and does not produce bootable RP2040
firmware. Even the hardened `.gen.s` output should be treated as a
documented intermediate form — real deployment needs an actual
`arm-none-eabi` toolchain pass (unavailable in the environment this was
built in) to confirm it assembles and links as intended.

## Usage

```bash
cd sovereign-gate
npm test                     # runs tests/compile.test.js (plain node assert, no deps)
npm run compile               # compiles the canonical spec's first ACTION into build/
npm run compile:hardened      # compiles the hardened spec's ACTION into build-hardened/
node ./src/cli.js compile spec/monolith.delta.hardened.spec SecureStateTransitionHardened --out build
```

A successful compile writes `<out>/core0.gen.s`, `<out>/core1.gen.s`, and
`<out>/memory_map.h`. A rejected compile (invariant violation) prints each
violation and exits with status `2` — try it against the canonical spec:
`node ./src/cli.js compile spec/monolith.delta.spec` exits `2` and prints
the two register-bleed violations described below.

## Substitution rule (why some tokens stay unresolved)

A `PRIMITIVE`'s `INPUTS` block sometimes declares a literal register (e.g.
`ASSERT_LINEAGE_ONEWAY`'s `COUNTER_REG: "r7"`, or the hardened spec's
annotated `"r7 (transient — bled after use)"`) and sometimes a human
description (e.g. `VERIFY_ONEWAY`'s `CONST_REF: "Immutable invariant
constant"`). The compiler only inlines a substitution when the declared
value *starts with* a concrete register token (`r0`–`r99`, optionally
followed by parenthetical notes); otherwise it leaves the placeholder
token in the emitted instruction — since a description isn't a valid
operand — and appends an annotation comment recording what the `ACTION`'s
call site bound it to, e.g.:

```
CMP  r4, CONST_REF  ; CONST_REF -> SENTRY.CONST_TARGET (unresolved symbol)
```

This mirrors how the spec itself is written and keeps the transformation
deterministic and testable against the literal spec text (see
`tests/compile.test.js`).

## Findings from reviewing the spec, and what's fixed

- **`VERIFY_ONEWAY` never bled `r0`/`r4`, which hold the fully-mixed
  permutation value right at the `CMP`.** Confirmed by the strengthened
  `Register_Bleed_After_Verify` check, not just eyeballing: it identifies
  every register written during the mix phase or read by the deciding
  `CMP`, and checks each is provably zero (directly or via a traced
  register-copy) by the time the primitive returns. **Fixed** in the
  hardened spec, which zeroes `r0`–`r4` and `r7`.
- **`ASSERT_LINEAGE_ONEWAY` had no bleed epilogue at all**, and its
  `INPUTS` never stated that `LAST_GOOD_REG` is meant to persist across
  calls — so there was no way to tell "intentionally stateful" apart from
  "leaking a register" just by reading the spec. The strengthened checker
  correctly flags *both* `r6` and `r7` as unbled against the original
  text. **Fixed**: the hardened spec's `INPUTS` explicitly marks
  `LAST_GOOD_REG` as `"(persistent watchdog state — intentionally not
  bled)"`, which the checker now treats as an exemption, while
  `COUNTER_REG` (the transient per-call value) is bled.
- **`VERIFY_ONEWAY`'s "cryptographic" check was an unkeyed XOR-mix + 32-bit
  rotate**, not a MAC — anyone who can write to `BANK3_SPIBUF` could
  compute the same permutation. **Partially addressed**: the hardened
  `SEAL_FRAME` now keys its lineage-hash computation with a value loaded
  from a new `BANK6_KEY` bank (EOR with the key, mixed with the counter,
  rotated by a distinct amount per word). This is explicitly *not* a
  vetted MAC/hash — no cross-word diffusion, no resistance to related-key
  or algebraic attacks — just a step up from "no key at all." A real
  deployment should use HMAC-SHA256 or another vetted keyed primitive, and
  source the key from RP2040 OTP or a secure boot slot, not a plain SRAM
  bank (`BANK6_KEY`'s address in this spec sits right at the real
  RP2040's 264KB SRAM ceiling — it's illustrative of the DSL mechanics,
  not a realistic production memory map).
- **`SEAL_FRAME` only ever wrote `PAYLOAD[0]`**, and called an undefined
  `_Compute_Lineage_Hash`. **Fixed**: the hardened version copies all four
  `PAYLOAD` words and computes all four `LINEAGE_HASH` words inline.
- **`Anomaly_Only_BANK4` was unenforceable in any meaningful sense** —
  nothing in the original spec ever wrote to `BANK4_ANOM`, so the
  invariant passed vacuously. **Fixed**: the hardened spec adds
  `TRIGGER_SOFT_ANOMALY` (a 256-slot ring buffer at the front of the bank)
  and `VAULT_VIOLATION` (a permanent lockout marker in its last 8 bytes,
  followed by a trap that halts Core1) as the real implementations of the
  branch targets the original only named. `tests/compile.test.js`
  confirms both are correctly recognized as anomaly-designated paths, and
  that a non-anomaly primitive touching `BANK4` is still caught.
- **`ASSERT_LINEAGE_ONEWAY`'s `BLS` monotonicity check is unsigned** and
  will treat 32-bit counter wraparound as a permanent anomaly. Left
  as-is in both specs — plausibly the intended fail-safe behavior for a
  sovereign gate, but worth stating explicitly rather than leaving
  implicit if this were to go further.
- On the positive side, the topology remains a genuinely strong property
  in both specs: both links (`Core0->Core1` FIFO, `PicoA->PicoB` SPI) are
  physically simplex, so even a fully compromised Executor core can never
  read Sentry state or open a reverse channel — at worst it can cause
  Sentry to reject frames. The software invariants checked here are a
  second line of defense on top of that hardware guarantee, not a
  substitute for it.
