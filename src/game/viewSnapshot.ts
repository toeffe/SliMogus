import type { Role } from '@game/roles';

/** Renderer-agnostic per-tick view of match state (pixel world coords). */
export interface ViewEntity {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** Horizontal look yaw (rad) for flashlight / body facing. */
  readonly facingYaw: number;
  /** Whether this player's flashlight beam/prop is on. */
  readonly flashlightOn: boolean;
  readonly color: number;
  readonly name: string;
  readonly characterId: string;
  readonly alive: boolean;
  readonly role: Role | undefined;
}

export interface ViewBody {
  readonly victimPlayerId: number;
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly characterId: string;
}

export interface ViewSnapshot {
  readonly simTick: number;
  readonly localPlayerId: number;
  readonly localIsGhost: boolean;
  readonly localX: number;
  readonly localY: number;
  readonly lightsOut: boolean;
  readonly phase: string;
  readonly entities: readonly ViewEntity[];
  readonly bodies: readonly ViewBody[];
}
