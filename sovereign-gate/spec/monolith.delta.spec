// ======================================================================
// MONOLITH.DELTA
// Sovereign One-Way Gate Substrate — Canonical Δ Spec
// ======================================================================

WORLD SovereignGate:
  NAME: "MCCSS-Lite / One-Way Cryptographic Gate v1"
  VERSION: "1.0.0"
  PURPOSE: >
    Define the sovereign execution physics for a one-way, cryptographic,
    hardware-enforced gate between Executor and Sentry domains.

  // --------------------------------------------------------------------
  // 1. PHYSICAL TOPOLOGY (ABSTRACTED)
  // --------------------------------------------------------------------
  TOPOLOGY:
    EXECUTOR_CORE: "Core0"
    SENTRY_CORE:   "Core1"

    BOARD_A: "Pico A / Sovereign Engine"
    BOARD_B: "Pico B / Sentinel Replica"

    LINK_INTERCORE: "HARDWARE_FIFO_SIMPLEX"
    LINK_INTERBOARD: "SPI_SIMPLEX_MOSI_ONLY"

  MEMORY_BANKS:
    BANK0_CORE0:  { ORIGIN: 0x20000000, SIZE: 65536, ROLE: "CORE0_VM_STACK" }
    BANK1_CORE1:  { ORIGIN: 0x20010000, SIZE: 65536, ROLE: "CORE1_SENTRY_STACK" }
    BANK2_FRAMES: { ORIGIN: 0x20020000, SIZE: 65536, ROLE: "FRAMES_PRE_MAIN_POST" }
    BANK3_SPIBUF: { ORIGIN: 0x20030000, SIZE: 65536, ROLE: "SPI_INGRESS_BUFFERS" }
    BANK4_ANOM:   { ORIGIN: 0x20040000, SIZE: 4096,  ROLE: "ANOMALY_RING_BUFFER" }
    BANK5_VECT:   { ORIGIN: 0x20041000, SIZE: 4096,  ROLE: "EXCEPTION_VECTORS" }

  // --------------------------------------------------------------------
  // 2. FRAME LAYOUT (64-BYTE ALIGNED)
  // --------------------------------------------------------------------
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

  // --------------------------------------------------------------------
  // 3. SOVEREIGN INVARIANTS
  // --------------------------------------------------------------------
  INVARIANTS:
    - NAME: "OneWay_Data_Flow"
      RULE: >
        No ACTION, INSTRUCTION, or BINDING may define a reverse channel
        from SENTRY_CORE to EXECUTOR_CORE, nor from BOARD_B to BOARD_A.

    - NAME: "Register_Bleed_After_Verify"
      RULE: >
        Every VERIFY_ONEWAY or ASSERT_LINEAGE_ONEWAY expansion must end
        with a mandatory register-bleed epilogue that zeroes all
        intermediate registers used in the permutation.

    - NAME: "Frames_In_BANK2"
      RULE: >
        All PRE and POST frame symbols must be placed in BANK2_FRAMES
        and aligned to 64-byte boundaries.

    - NAME: "Anomaly_Only_BANK4"
      RULE: >
        All anomaly log writes must target BANK4_ANOM exclusively.
        No other code path may write into BANK4_ANOM.

  // --------------------------------------------------------------------
  // 4. LANGUAGE PRIMITIVES
  // --------------------------------------------------------------------
  PRIMITIVE VERIFY_ONEWAY:
    PURPOSE: >
      Consume an incoming frame, apply a forward-only permutation,
      compare against a constitutional invariant, then bleed registers.
    INPUTS:
      - FRAME_REF: "Target frame (e.g., POST)"
      - CONST_REF: "Immutable invariant constant"
    EXPANDS_TO:
      ASM_CORE1:
        - "LOAD frame payload/hash/counter into r1,r2,r7"
        - "EORS r4, r1"          // mix payload
        - "EORS r4, r2"          // mix lineage hash
        - "EORS r4, r7"          // mix monotonic counter
        - "LSLS r0, r4, #13"     // rotate left 13
        - "LSRS r2, r4, #19"
        - "ORRS r0, r2"
        - "MOV  r4, r0"          // commit state
        - "CMP  r4, CONST_REF"
        - "BNE  _Vault_Violation"
        // Register bleed
        - "MOVS r1, #0"
        - "MOVS r2, #0"
        - "MOVS r3, #0"
        - "MOVS r7, #0"
        - "MOV  r12, r1"

  PRIMITIVE ASSERT_LINEAGE_ONEWAY:
    PURPOSE: >
      Ensure that the monotonic counter strictly increases and that
      lineage continuity is preserved, else route to anomaly or vault.
    INPUTS:
      - COUNTER_REG: "r7"
      - LAST_GOOD_REG: "r6"
    EXPANDS_TO:
      ASM_CORE1:
        - "CMP  COUNTER_REG, LAST_GOOD_REG"
        - "BLS  _Trigger_Soft_Anomaly_Counter"
        - "MOV  LAST_GOOD_REG, COUNTER_REG"

  PRIMITIVE SEAL_FRAME:
    PURPOSE: >
      Finalize a POST frame, compute its lineage hash, and push it
      down the one-way hardware path (FIFO/SPI) with immediate bleed.
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
        - "BL   _Compute_Lineage_Hash"
        - "BL   spi_master_burst_push"
        // Bleed
        - "MOVS r2, #0"
        - "MOVS r3, #0"
        - "MOVS r4, #0"
        - "MOVS r5, #0"
        - "MOVS r6, #0"

  // --------------------------------------------------------------------
  // 5. HIGH-LEVEL ACTION (HELLO WORLD OF THE GATE)
  // --------------------------------------------------------------------
  ACTION SecureStateTransition:
    MAIN:
      POST.PAYLOAD[0] = PRE.PAYLOAD[0] + 1
      POST.MONO_COUNTER = PRE.MONO_COUNTER + 1

    POST:
      ASSERT_LINEAGE_ONEWAY(COUNTER_REG = POST.MONO_COUNTER,
                            LAST_GOOD_REG = SENTRY.LAST_COUNTER)
      VERIFY_ONEWAY(FRAME_REF = POST,
                    CONST_REF = SENTRY.CONST_TARGET)
      SEAL_FRAME(PRE_PTR = &PRE, POST_PTR = &POST)

  // --------------------------------------------------------------------
  // 6. BINDINGS TO RUNTIME / TOOLCHAIN
  // --------------------------------------------------------------------
  BINDING COMPILER_BACKEND:
    TARGET: "MCCSS-Lite / Δ-VM"
    RULES:
      - "Map PRIMITIVE VERIFY_ONEWAY to Core1 assembly block above."
      - "Map PRIMITIVE ASSERT_LINEAGE_ONEWAY to Core1 monotonic check."
      - "Map PRIMITIVE SEAL_FRAME to Core0 frame mutation + SPI push."
      - "Enforce INVARIANTS at compile-time; reject code that violates
         OneWay_Data_Flow, Frames_In_BANK2, or Anomaly_Only_BANK4."

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
