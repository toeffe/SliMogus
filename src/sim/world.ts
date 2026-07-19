import { resolveCircleMovement } from './collision';
import type { Entity } from './entity';
import type { PlayerInput } from './input';
import { buildStationObstacles, type StationObstacle } from './purposeLayout';
import type { TileMap } from './tilemap';
import { add, scale, vec2 } from './vector2';

/** Movement speed applied to a full-magnitude input axis, in pixels/second. */
const MOVE_SPEED = 120;

/**
 * Holds all simulation entities and advances them one fixed step at a time.
 * Entities are always iterated in ascending-id order (never Map insertion
 * order) so the update sequence is identical regardless of when/how an
 * entity was added — required for cross-client determinism. An optional
 * `tileMap` is checked for wall collision after each entity moves; omitting
 * it (as every pre-Phase-3 test still does) keeps the original open-plane
 * behavior.
 */
export class World {
  private readonly entities = new Map<number, Entity>();
  private readonly obstacles: readonly StationObstacle[];

  constructor(
    private readonly tileMap?: TileMap,
    obstacles?: readonly StationObstacle[],
    clearWorld: readonly { x: number; z: number }[] = [],
  ) {
    this.obstacles = obstacles ?? (tileMap ? buildStationObstacles(tileMap, clearWorld) : []);
  }

  addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  getEntity(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  listEntities(): Entity[] {
    return [...this.entities.values()].sort((a, b) => a.id - b.id);
  }

  step(inputs: readonly PlayerInput[], dtMs: number): void {
    const dt = dtMs / 1000;
    const inputByPlayerId = new Map(inputs.map((input) => [input.playerId, input]));

    for (const entity of this.listEntities()) {
      const input = inputByPlayerId.get(entity.id);
      // Missing input → stop (do not coast). Lockstep should supply every player;
      // coasting on gaps permanently forks peer worlds.
      entity.velocity = input ? scale(vec2(input.moveX, input.moveY), MOVE_SPEED) : vec2(0, 0);
      if (input) {
        entity.facingYaw = input.lookYaw;
        entity.flashlightOn = input.flashlightOn ? 1 : 0;
      }
      const previousPosition = entity.position;
      const targetPosition = add(entity.position, scale(entity.velocity, dt));
      entity.position =
        this.tileMap && !entity.ignoresCollision
          ? resolveCircleMovement(
              previousPosition,
              targetPosition,
              entity.radius,
              this.tileMap,
              this.obstacles,
            )
          : targetPosition;
    }
  }
}
