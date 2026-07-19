import type { Vector2 } from './vector2';
import { vec2 } from './vector2';

/** Plain, mutable simulation entity. Kept as flat data (not a class) so it's trivial to clone, hash, and (de)serialize. */
export interface Entity {
  id: number;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  /** Horizontal look yaw (rad); updated from `PlayerInput.lookYaw` each tick. */
  facingYaw: number;
  /** 1 when flashlight is on; updated from `PlayerInput.flashlightOn` each tick. */
  flashlightOn: number;
  /** When true, `World.step` skips wall collision entirely for this entity (Phase 4: ghosts fly through walls). Absent/false for every pre-Phase-4 entity, so existing behavior is unchanged. */
  ignoresCollision?: boolean;
}

export function createEntity(id: number, position: Vector2, radius = 16): Entity {
  return { id, position, velocity: vec2(0, 0), radius, facingYaw: 0, flashlightOn: 1 };
}
