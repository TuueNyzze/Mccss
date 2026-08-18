// ======================================================================
// MONOLITH.DELTA — HARDENED REVISION (v1.1.0)
//
// This file is NOT the canonical spec (that's monolith.delta.spec,
// preserved verbatim). It's a fixed revision addressing every gap found
// by reviewing the original and by strengthening sovereign-gate's own
// Register_Bleed_After_Verify check from a pattern heuristic into real
// register-flow analysis:
//
//   1. VERIFY_ONEWAY's frame load was an unexpanded pseudo-op ("LOAD
//      frame payload/hash/counter into r1,r2,r7") — replaced with real
//      LDR instructions against the frame's actual field offsets.
//   2. VERIFY_ONEWAY's bleed epilogue zeroed the four *input* registers
//      (r1,r2,r3,r7) but not r0/r4, which hold the fully-mixed
//      permutation value right up to the CMP — fixed.
//   3. ASSERT_LINEAGE_ONEWAY had NO bleed epilogue at all, and its INPUTS
//      never stated that LAST_GOOD_REG is meant to persist across calls
//      (so a naive "zero everything" fix would have broken the
//      monotonicity check it exists to perform). Fixed: COUNTER_REG is
//      bled, LAST_GOOD_REG is explicitly annotated as persistent and
//      intentionally left alone.
//   4. SEAL_FRAME only ever wrote PAYLOAD[0] and called an undefined
//      "_Compute_Lineage_Hash" — replaced with a real (if intentionally
//      lightweight — see README) keyed mix over all four PAYLOAD words,
//      writing all of LINEAGE_HASH.
//   5. Anomaly_Only_BANK4 was unenforceable: nothing in the original spec
//      ever wrote to BANK4_ANOM, so the check passed vacuously. Added
//      concrete TRIGGER_SOFT_ANOMALY and VAULT_VIOLATION primitives that
//      implement the two branch targets the original spec only
//      referenced by name (_Trigger_Soft_Anomaly_Counter,
//      _Vault_Violation), giving the invariant something real to check.
// ======================================================================

WORLD SovereignGate:
  NAME: "MCCSS-Lite / One-Way Cryptographic Gate v1 (hardened)"
  VERSION: "1.1.0"
  PURPOSE: >
    Hardened revision of the sovereign execution physics for a one-way,
    cryptographic, hardware-enforced gate between Executor and Sentry
    domains, fixing the register-bleed and anomaly-handling gaps found in
    the canonical v1.0.0 spec.

  TOPOLOGY:
    EXECUTOR_CORE: "Core0"
    SENTRY_CORE:   "Core1"

    BOARD_A: "Pico A / Sovereign Engine"
    BOARD_B: "Pico B / Sentinel Replica"

    LINK_INTERCORE: "HARDWARE_FIFO_SIMPLEX"
    LINK_INTERBOARD: "SPI_SIMPLEX_MOSI_ONLY"

  // BANK6_KEY is new in this revision. Note: its ORIGIN sits exactly at
  // the real RP2040's 264KB SRAM boundary (banks 0-5 already total
  // 270,336 bytes = 264KB), so on real hardware this is illustrative
  // only — production key material belongs in RP2040 OTP or a secure
  // boot key slot, never plain SRAM. See README "Design/security notes".
  MEMORY_BANKS:
    BANK0_CORE0:  { ORIGIN: 0x20000000, SIZE: 65536, ROLE: "CORE0_VM_STACK" }
    BANK1_CORE1:  { ORIGIN: 0x20010000, SIZE: 65536, ROLE: "CORE1_SENTRY_STACK" }
    BANK2_FRAMES: { ORIGIN: 0x20020000, SIZE: 65536, ROLE: "FRAMES_PRE_MAIN_POST" }
    BANK3_SPIBUF: { ORIGIN: 0x20030000, SIZE: 65536, ROLE: "SPI_INGRESS_BUFFERS" }
    BANK4_ANOM:   { ORIGIN: 0x20040000, SIZE: 4096,  ROLE: "ANOMALY_RING_BUFFER" }
    BANK5_VECT:   { ORIGIN: 0x20041000, SIZE: 4096,  ROLE: "EXCEPTION_VECTORS" }
    BANK6_KEY:    { ORIGIN: 0x20042000, SIZE: 32,    ROLE: "LINEAGE_KEY_MATERIAL" }

  FRAME PRE:
    ALIGN: 64
    WORD PAYLOAD[4]
    WORD LINEAGE_HASH[4]
    WORD FLAGS
    WORD MONO_COUNTER

  FRAME POST:
    ALIGN: 64
    WORD PAYLOAD[4]
    WORD LINEAGE_HASH[4]
    WORD FLAGS
    WORD MONO_COUNTER

  INVARIANTS:
    - NAME: "OneWay_Data_Flow"
      RULE: >
        No ACTION, INSTRUCTION, or BINDING may define a reverse channel
        from SENTRY_CORE to EXECUTOR_CORE, nor from BOARD_B to BOARD_A.

    - NAME: "Register_Bleed_After_Verify"
      RULE: >
        Every VERIFY_ONEWAY or ASSERT_LINEAGE_ONEWAY expansion must end
        with a mandatory register-bleed epilogue that zeroes all
        intermediate registers used in the permutation, except registers
        an INPUT explicitly documents as persistent state.

    - NAME: "Frames_In_BANK2"
      RULE: >
        All PRE and POST frame symbols must be placed in BANK2_FRAMES
        and aligned to 64-byte boundaries.

    - NAME: "Anomaly_Only_BANK4"
      RULE: >
        All anomaly log writes must target BANK4_ANOM exclusively.
        No other code path may write into BANK4_ANOM.

  PRIMITIVE VERIFY_ONEWAY:
    PURPOSE: >
      Consume an incoming frame, apply a forward-only permutation,
      compare against a constitutional invariant, then bleed registers.
      Hardened: loads frame words via explicit addressing instead of an
      unexpanded pseudo-op, and bleeds every register that touched the
      permutation, including r0/r4 which the original spec left unbled.
    INPUTS:
      - FRAME_REF: "Target frame (e.g., POST)"
      - CONST_REF: "Immutable invariant constant"
    EXPANDS_TO:
      ASM_CORE1:
        - "LDR  r0, =BANK2_FRAMES_ORIGIN"
        - "ADDS r0, r0, #64"     // POST = PRE + 64
        - "LDR  r1, [r0, #0]"    // POST.PAYLOAD[0]
        - "LDR  r2, [r0, #16]"   // POST.LINEAGE_HASH[0]
        - "LDR  r7, [r0, #36]"   // POST.MONO_COUNTER
        - "EORS r4, r1"          // mix payload
        - "EORS r4, r2"          // mix lineage hash
        - "EORS r4, r7"          // mix monotonic counter
        - "LSLS r0, r4, #13"     // rotate left 13
        - "LSRS r2, r4, #19"
        - "ORRS r0, r2"
        - "MOV  r4, r0"          // commit state
        - "CMP  r4, CONST_REF"
        - "BNE  _Vault_Violation"
        // Register bleed — every register touched above, including the
        // rotated/committed value in r0 and r4.
        - "MOVS r0, #0"
        - "MOVS r1, #0"
        - "MOVS r2, #0"
        - "MOVS r3, #0"
        - "MOVS r4, #0"
        - "MOVS r7, #0"
        - "MOV  r12, r1"

  PRIMITIVE ASSERT_LINEAGE_ONEWAY:
    PURPOSE: >
      Ensure that the monotonic counter strictly increases and that
      lineage continuity is preserved, else route to anomaly or vault.
      Hardened: the freshly-read counter is bled after the check; the
      last-known-good counter is intentionally left alone since it must
      persist across calls to do its job.
    INPUTS:
      - COUNTER_REG: "r7 (transient — bled after use)"
      - LAST_GOOD_REG: "r6 (persistent watchdog state — intentionally not bled)"
    EXPANDS_TO:
      ASM_CORE1:
        - "CMP  COUNTER_REG, LAST_GOOD_REG"
        - "BLS  _Trigger_Soft_Anomaly_Counter"
        - "MOV  LAST_GOOD_REG, COUNTER_REG"
        // COUNTER_REG is transient input state, not the persistent
        // watchdog register — bleed it once its value has been
        // committed into LAST_GOOD_REG above.
        - "MOVS COUNTER_REG, #0"

  PRIMITIVE SEAL_FRAME:
    PURPOSE: >
      Finalize a POST frame, compute its lineage hash, and push it down
      the one-way hardware path (FIFO/SPI) with immediate bleed.
      Hardened: copies all four PAYLOAD words (not just word 0), computes
      a keyed lineage hash over PAYLOAD instead of calling an undefined
      external routine, and bleeds every register touched, including the
      key register.
    INPUTS:
      - PRE_PTR:  "Pointer to PRE frame"
      - POST_PTR: "Pointer to POST frame"
    EXPANDS_TO:
      ASM_CORE0:
        - "LDR  r0, =BANK2_FRAMES_ORIGIN"
        - "ADD  r1, r0, #64"          // POST = PRE + 64
        - "LDR  r2, [r0, #0]"         // PRE.PAYLOAD[0]
        - "ADDS r2, #1"
        - "STR  r2, [r1, #0]"         // POST.PAYLOAD[0]
        - "LDR  r2, [r0, #4]"         // PRE.PAYLOAD[1]
        - "STR  r2, [r1, #4]"         // POST.PAYLOAD[1]
        - "LDR  r2, [r0, #8]"         // PRE.PAYLOAD[2]
        - "STR  r2, [r1, #8]"         // POST.PAYLOAD[2]
        - "LDR  r2, [r0, #12]"        // PRE.PAYLOAD[3]
        - "STR  r2, [r1, #12]"        // POST.PAYLOAD[3]
        - "LDR  r3, =BANK6_KEY_ORIGIN"
        - "LDR  r3, [r3, #0]"         // load 32-bit lineage key
        - "LDR  r4, [r1, #0]"         // POST.PAYLOAD[0]
        - "EORS r4, r3"
        - "LDR  r5, [r0, #36]"        // PRE.MONO_COUNTER
        - "ADDS r4, r5"
        - "RORS r4, r4, #7"
        - "STR  r4, [r1, #16]"        // POST.LINEAGE_HASH[0]
        - "LDR  r4, [r1, #4]"         // POST.PAYLOAD[1]
        - "EORS r4, r3"
        - "RORS r4, r4, #11"
        - "STR  r4, [r1, #20]"        // POST.LINEAGE_HASH[1]
        - "LDR  r4, [r1, #8]"         // POST.PAYLOAD[2]
        - "EORS r4, r3"
        - "RORS r4, r4, #17"
        - "STR  r4, [r1, #24]"        // POST.LINEAGE_HASH[2]
        - "LDR  r4, [r1, #12]"        // POST.PAYLOAD[3]
        - "EORS r4, r3"
        - "RORS r4, r4, #23"
        - "STR  r4, [r1, #28]"        // POST.LINEAGE_HASH[3]
        - "STR  r5, [r1, #36]"        // POST.MONO_COUNTER
        - "BL   spi_master_burst_push"
        // Bleed every register touched by the copy + keyed-hash steps,
        // including the key register (r3) itself.
        - "MOVS r0, #0"
        - "MOVS r1, #0"
        - "MOVS r2, #0"
        - "MOVS r3, #0"
        - "MOVS r4, #0"
        - "MOVS r5, #0"

  // Implements the _Trigger_Soft_Anomaly_Counter branch target that the
  // original spec referenced but never defined. Not called from an
  // ACTION.POST list directly — it's a fault handler reached by branch
  // from ASSERT_LINEAGE_ONEWAY, included here so Anomaly_Only_BANK4 has
  // a real BANK4 writer to validate against.
  PRIMITIVE TRIGGER_SOFT_ANOMALY:
    PURPOSE: >
      Concrete implementation of the _Trigger_Soft_Anomaly_Counter branch
      target: record a soft (non-fatal) anomaly into a 256-slot ring
      buffer at the front of BANK4_ANOM, then return without halting
      Core1. Reserves the bank's last 8 bytes for VAULT_VIOLATION.
    INPUTS:
      - CODE: "Anomaly reason code, e.g. #1 for counter regression"
    EXPANDS_TO:
      ASM_CORE1:
        - "_Trigger_Soft_Anomaly_Counter:"
        - "LDR  r0, =BANK4_ANOM_ORIGIN"
        - "LDR  r1, [r0, #0]"          // ring index lives in word 0
        - "ADDS r1, r1, #1"
        - "ANDS r1, r1, #255"          // wrap within a 256-slot ring
        - "STR  r1, [r0, #0]"
        - "LSLS r2, r1, #3"            // 8 bytes per anomaly record
        - "ADD  r2, r2, r0"
        - "ADDS r2, r2, #4"            // skip past the ring-index word
        - "MOVS r3, CODE"
        - "STR  r3, [r2, #0]"
        - "STR  r7, [r2, #4]"          // record the offending counter value
        // Bleed the scratch registers used to compute/write the record.
        - "MOVS r1, #0"
        - "MOVS r2, #0"
        - "MOVS r3, #0"
        - "BX   lr"

  // Implements the _Vault_Violation branch target. Unlike the soft
  // anomaly path, this never returns: a failed VERIFY_ONEWAY comparison
  // is treated as a hard fault, so Core1 permanently stops processing.
  PRIMITIVE VAULT_VIOLATION:
    PURPOSE: >
      Concrete implementation of the _Vault_Violation branch target: a
      hard anomaly. Records a permanent violation marker in the last 8
      bytes of BANK4_ANOM, then traps Core1 so no further frames are ever
      processed.
    INPUTS:
      - CODE: "Violation reason code, e.g. #2 for a failed VERIFY_ONEWAY comparison"
    EXPANDS_TO:
      ASM_CORE1:
        - "_Vault_Violation:"
        - "LDR  r0, =BANK4_ANOM_ORIGIN"
        - "MOVS r1, #1"
        - "STR  r1, [r0, #4088]"       // permanent lockout flag, second-to-last word
        - "MOVS r2, CODE"
        - "STR  r2, [r0, #4092]"       // violation reason code, final word
        - "MOVS r0, #0"
        - "MOVS r1, #0"
        - "MOVS r2, #0"
        - "_Vault_Halt:"
        - "B    _Vault_Halt"           // trap: never returns, never processes another frame

  ACTION SecureStateTransitionHardened:
    MAIN:
      POST.PAYLOAD[0] = PRE.PAYLOAD[0] + 1
      POST.MONO_COUNTER = PRE.MONO_COUNTER + 1

    POST:
      ASSERT_LINEAGE_ONEWAY(COUNTER_REG = POST.MONO_COUNTER,
                            LAST_GOOD_REG = SENTRY.LAST_COUNTER)
      VERIFY_ONEWAY(FRAME_REF = POST,
                    CONST_REF = SENTRY.CONST_TARGET)
      SEAL_FRAME(PRE_PTR = &PRE, POST_PTR = &POST)

  BINDING COMPILER_BACKEND:
    TARGET: "MCCSS-Lite / Δ-VM"
    RULES:
      - "Map PRIMITIVE VERIFY_ONEWAY to Core1 assembly block above."
      - "Map PRIMITIVE ASSERT_LINEAGE_ONEWAY to Core1 monotonic check."
      - "Map PRIMITIVE SEAL_FRAME to Core0 frame mutation + SPI push."
      - "Route the _Trigger_Soft_Anomaly_Counter and _Vault_Violation
         branch targets to the TRIGGER_SOFT_ANOMALY and VAULT_VIOLATION
         primitives defined above."
      - "Enforce INVARIANTS at compile-time; reject code that violates
         OneWay_Data_Flow, Register_Bleed_After_Verify, Frames_In_BANK2,
         or Anomaly_Only_BANK4."

  BINDING HARDWARE_PROFILE:
    TARGET: "RP2040_DUAL_PICO_SIMPLEX"
    DETAILS:
      CORES:
        - { NAME: "Core0", ROLE: "EXECUTOR" }
        - { NAME: "Core1", ROLE: "SENTRY" }
      LINKS:
        - { TYPE: "FIFO_SIMPLEX", FROM: "Core0", TO: "Core1" }
        - { TYPE: "SPI_SIMPLEX",  FROM: "PicoA", TO: "PicoB" }
      VECTORS:
        - { TABLE_AT: 0x20041000, FAULT_HANDLER: "_Vault_Violation" }

END WORLD
