import { createEntity, type Entity } from './entity';
import type { TileMap } from './tilemap';
import { vec2 } from './vector2';
import { World } from './world';

export interface EntitySnapshot {
  id: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  radius: number;
  facingYaw: number;
  flashlightOn: number;
  ignoresCollision?: boolean;
}

/**
 * Plain-object serialization of the full simulation state at a tick. Random
 * state is intentionally excluded: in Phase 1, randomness is only consumed
 * once at spawn (already baked into `entities`), and `World.step` is purely
 * a function of input, so nothing further depends on PRNG continuity. If a
 * later phase adds per-tick randomness, this snapshot format will need a
 * `randomState` field alongside a `Random.getState()`/`Random.fromState()` pair.
 */
export interface Snapshot {
  tick: number;
  entities: EntitySnapshot[];
}

function cloneEntity(entity: Entity): EntitySnapshot {
  return {
    id: entity.id,
    position: { x: entity.position.x, y: entity.position.y },
    velocity: { x: entity.velocity.x, y: entity.velocity.y },
    radius: entity.radius,
    facingYaw: entity.facingYaw,
    flashlightOn: entity.flashlightOn,
    ignoresCollision: entity.ignoresCollision,
  };
}

export function createSnapshot(world: World, tick: number): Snapshot {
  return {
    tick,
    entities: world.listEntities().map(cloneEntity),
  };
}

export function restoreWorldFromSnapshot(
  snapshot: Snapshot,
  tileMap?: TileMap,
  clearWorld: readonly { x: number; z: number }[] = [],
): World {
  const world = new World(tileMap, undefined, clearWorld);
  for (const entitySnapshot of snapshot.entities) {
    const entity = createEntity(
      entitySnapshot.id,
      vec2(entitySnapshot.position.x, entitySnapshot.position.y),
      entitySnapshot.radius,
    );
    entity.velocity = vec2(entitySnapshot.velocity.x, entitySnapshot.velocity.y);
    entity.facingYaw = entitySnapshot.facingYaw ?? 0;
    entity.flashlightOn = entitySnapshot.flashlightOn ?? 1;
    entity.ignoresCollision = entitySnapshot.ignoresCollision;
    world.addEntity(entity);
  }
  return world;
}
