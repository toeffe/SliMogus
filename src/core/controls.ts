import { PlayerInputButton } from '@sim/input';

/** Movement axes normalized to [-1, 1] (diagonals are *not* length-normalized here — `Simulation`'s own movement math handles speed clamping). */
export interface MovementAxes {
  moveX: number;
  moveY: number;
}

/** A UI-driven discrete action (e.g. clicking a "vote for Red" button in the meeting screen) queued for the next tick's outgoing input. */
export interface QueuedAction {
  button: number;
  targetId: number;
}

const KEY_TO_AXIS: Readonly<Record<string, readonly ['moveX' | 'moveY', 1 | -1]>> = {
  KeyW: ['moveY', -1],
  ArrowUp: ['moveY', -1],
  KeyS: ['moveY', 1],
  ArrowDown: ['moveY', 1],
  KeyA: ['moveX', -1],
  ArrowLeft: ['moveX', -1],
  KeyD: ['moveX', 1],
  ArrowRight: ['moveX', 1],
};

/** Held-key action bits, sampled level-triggered (see `PlayerInputButton`'s doc comment for why one-shot semantics live in `@game` instead). */
const KEY_TO_BUTTON: Readonly<Record<string, number>> = {
  KeyE: PlayerInputButton.USE,
  KeyQ: PlayerInputButton.KILL,
  KeyR: PlayerInputButton.REPORT,
  KeyM: PlayerInputButton.CALL_MEETING,
  Digit1: PlayerInputButton.SABOTAGE_LIGHTS,
  Digit2: PlayerInputButton.SABOTAGE_REACTOR,
};

/**
 * Real keyboard input capture, replacing Phase 1-3's scripted demo
 * movement. Tracks which movement/action keys are currently held via
 * `window` key listeners, and offers a one-shot `queueAction` escape hatch
 * for actions triggered from HTML UI instead of a key (e.g. a meeting
 * screen's vote button) — `takeQueuedAction` consumes (clears) it so it's
 * only ever applied to a single outgoing tick's input.
 */
export class KeyboardController {
  private readonly heldKeys = new Set<string>();
  private queuedAction: QueuedAction | null = null;
  private useEdgePending = false;
  private movementLocked = false;
  /** Camera yaw (rad); rotates local WASD into world moveX/moveY for FPS. */
  private facingYaw = 0;
  /** Local flashlight toggle (synced via `PlayerInput.flashlightOn`). Starts on. */
  private flashlightOn = true;

  constructor(private readonly target: Window = window) {
    this.target.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('keyup', this.handleKeyUp);
  }

  /** When true, movement axes always report zero (task minigame open). */
  setMovementLocked(locked: boolean): void {
    this.movementLocked = locked;
  }

  isMovementLocked(): boolean {
    return this.movementLocked;
  }

  /** FPS camera yaw — W becomes camera-forward in world axes. */
  setFacingYaw(yaw: number): void {
    this.facingYaw = yaw;
  }

  getFacingYaw(): number {
    return this.facingYaw;
  }

  /** Whether the local flashlight is currently on (F toggles). */
  isFlashlightOn(): boolean {
    return this.flashlightOn;
  }

  getMovement(): MovementAxes {
    if (this.movementLocked) return { moveX: 0, moveY: 0 };
    let localX = 0;
    let localY = 0;
    for (const code of this.heldKeys) {
      const axis = KEY_TO_AXIS[code];
      if (!axis) continue;
      const [key, sign] = axis;
      if (key === 'moveX') localX += sign;
      else localY += sign;
    }
    localX = clamp(localX, -1, 1);
    localY = clamp(localY, -1, 1);
    // Local: +X right, −Y forward (W). Camera yaw 0 looks −Z (= sim −Y).
    const localForward = -localY;
    const localRight = localX;
    const cos = Math.cos(this.facingYaw);
    const sin = Math.sin(this.facingYaw);
    const worldX = localRight * cos + localForward * -sin;
    const worldZ = localRight * -sin + localForward * -cos;
    return {
      moveX: clamp(worldX, -1, 1),
      moveY: clamp(worldZ, -1, 1),
    };
  }

  /** Bitmask of every action key currently held down. */
  getHeldButtons(): number {
    let buttons = 0;
    for (const code of this.heldKeys) {
      buttons |= KEY_TO_BUTTON[code] ?? 0;
    }
    return buttons;
  }

  /**
   * Consumes a rising edge on KeyE (ignores key-repeat). Used to open a
   * task minigame once per press without holding USE into the sim.
   */
  consumeUseEdge(): boolean {
    if (!this.useEdgePending) return false;
    this.useEdgePending = false;
    return true;
  }

  /** Queues a UI-driven action to be merged into the next input this controller produces. Overwrites any not-yet-consumed queued action. */
  queueAction(button: number, targetId: number): void {
    this.queuedAction = { button, targetId };
  }

  /** Consumes (clears) the queued UI action, if any. */
  takeQueuedAction(): QueuedAction | null {
    const action = this.queuedAction;
    this.queuedAction = null;
    return action;
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.heldKeys.clear();
    this.useEdgePending = false;
    this.movementLocked = false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      KEY_TO_AXIS[event.code] ||
      KEY_TO_BUTTON[event.code] !== undefined ||
      event.code === 'KeyF'
    ) {
      event.preventDefault();
    }
    if (event.code === 'KeyE' && !event.repeat && !this.heldKeys.has('KeyE')) {
      this.useEdgePending = true;
    }
    if (event.code === 'KeyF' && !event.repeat && !this.heldKeys.has('KeyF')) {
      this.flashlightOn = !this.flashlightOn;
    }
    this.heldKeys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
