export const APP_NAME = 'SliMogus';
export const APP_VERSION = __APP_VERSION__;

/** Debug overlay keeps at most this many recent log lines in memory. */
export const DEBUG_LOG_LIMIT = 50;

export const TARGET_FPS = 60;

/** Fixed simulation timestep, in milliseconds, derived from the target tick rate. */
export const FIXED_TIMESTEP_MS = 1000 / TARGET_FPS;

/**
 * Networked lockstep input delay, in ticks: local input for tick `T` is
 * broadcast immediately, but every peer only *simulates* `T` once real time
 * `T + INPUT_DELAY_TICKS` is reached, giving each peer's input a window to
 * arrive over the network before it's needed. Without this, tick 0 would
 * always simulate with only the local player's input already present (no
 * network round-trip can complete within a single synchronous frame),
 * guaranteeing an immediate desync. ~200ms (12 ticks at 60Hz) covers typical
 * WebRTC/TURN jitter; real recovery from a peer that's still too slow is
 * Phase 6 (this phase only detects, via `NetworkBridge`'s state-hash
 * exchange, the desync that an insufficient delay would cause).
 */
export const INPUT_DELAY_TICKS = 12;
