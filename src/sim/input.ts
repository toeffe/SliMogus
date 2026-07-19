export const INPUT_VERSION = 5;

/**
 * Discrete action bits for `PlayerInput.buttons`. Bits are level-triggered
 * (1 for every tick a key is physically held) — callers that need "only once"
 * semantics (kill, report, task complete, casting a vote, ...) get that from
 * their own state-machine guards / `queueAction`, not from edge-detection here.
 */
export const PlayerInputButton = {
  KILL: 1 << 0,
  USE: 1 << 1,
  REPORT: 1 << 2,
  CALL_MEETING: 1 << 3,
  VOTE_SKIP: 1 << 4,
  VOTE_CAST: 1 << 5,
  SABOTAGE_LIGHTS: 1 << 6,
  SABOTAGE_REACTOR: 1 << 7,
  /** Discrete: finish a task minigame. `targetId` = index into `TASK_STATIONS`. */
  TASK_COMPLETE: 1 << 8,
} as const;

/** No target selected — the sentinel stored in `PlayerInput.targetId` when the current buttons don't need one. */
export const NO_TARGET = -1;

/** Flat, versioned per-tick input from a single player. */
export interface PlayerInput {
  version: number;
  seq: number;
  playerId: number;
  /** Movement axes, each expected in [-1, 1]. */
  moveX: number;
  moveY: number;
  /** Bitmask of held/pressed action buttons — see `PlayerInputButton`. */
  buttons: number;
  /**
   * Meaning depends on which button bit is set: victim id for `KILL`,
   * vote target for `VOTE_CAST`, station index in `TASK_STATIONS` for
   * `TASK_COMPLETE`, `NO_TARGET` otherwise. Never used for `USE`
   * (vent/panel) — resolved from synced position.
   */
  targetId: number;
  /** FPS look yaw in radians (horizontal aim for flashlight / body facing). */
  lookYaw: number;
  /** 1 when the player's flashlight is on, 0 when off (toggled locally, synced). */
  flashlightOn: number;
}

const FLOATS_PER_INPUT = 9;

/** Encodes a `PlayerInput` into a flat, fixed-layout buffer suitable for wire transport (Phase 2). */
export function encodeInput(input: PlayerInput): Float32Array {
  return new Float32Array([
    input.version,
    input.seq,
    input.playerId,
    input.moveX,
    input.moveY,
    input.buttons,
    input.targetId,
    input.lookYaw,
    input.flashlightOn,
  ]);
}

export function decodeInput(buffer: Float32Array): PlayerInput {
  if (buffer.length !== FLOATS_PER_INPUT) {
    throw new Error(`decodeInput: expected ${FLOATS_PER_INPUT} floats, got ${buffer.length}`);
  }
  const [version, seq, playerId, moveX, moveY, buttons, targetId, lookYaw, flashlightOn] = buffer;
  if (version !== INPUT_VERSION) {
    throw new Error(`decodeInput: unsupported input version ${version}`);
  }
  return {
    version,
    seq,
    playerId,
    moveX,
    moveY,
    buttons,
    targetId,
    lookYaw,
    flashlightOn,
  };
}
