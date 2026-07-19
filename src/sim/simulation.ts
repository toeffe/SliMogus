import { resolveCircleVsObstacles } from './collision';
import { createEntity } from './entity';
import { hashWorldState } from './hash';
import type { PlayerInput } from './input';
import { buildStationObstacles, type StationObstacle } from './purposeLayout';
import { Random } from './random';
import { createSnapshot, restoreWorldFromSnapshot, type Snapshot } from './snapshot';
import type { TileMap } from './tilemap';
import { vec2 } from './vector2';
import { World } from './world';

export interface SimulationConfig {
  seed: string;
  playerIds: readonly number[];
  /** When omitted, entities spawn/move on the original open-plane (unaffected pre-Phase-3 tests); when present, spawn is scattered within the map's `spawnBounds` and movement collides with its walls. */
  tileMap?: TileMap;
  /** Furniture blockers (pixels). Built from the map when omitted. */
  obstacles?: readonly StationObstacle[];
  /** Tile-unit POI centers to keep clear when auto-building obstacles. */
  clearWorld?: readonly { x: number; z: number }[];
}

const SPAWN_RANGE = 150;

/**
 * Top-level deterministic simulation: composes a seeded `Random` and a
 * `World`, and tracks the current tick. Given the same seed/player set and
 * the same ordered input log, `step` produces byte-for-byte identical state
 * (verified via `getStateHash`) regardless of which peer runs it.
 */
export class Simulation {
  readonly random: Random;
  readonly world: World;
  private tick: number;

  private constructor(random: Random, world: World, tick: number) {
    this.random = random;
    this.world = world;
    this.tick = tick;
  }

  static create(config: SimulationConfig): Simulation {
    const random = new Random(config.seed);
    const obstacles =
      config.obstacles ??
      (config.tileMap ? buildStationObstacles(config.tileMap, config.clearWorld ?? []) : undefined);
    const world = new World(config.tileMap, obstacles, config.clearWorld ?? []);
    const spawnBounds = config.tileMap?.spawnBounds;
    const blockerList = obstacles ?? [];
    for (const playerId of [...config.playerIds].sort((a, b) => a - b)) {
      let spawnPosition = spawnBounds
        ? vec2(
            random.nextFloat(spawnBounds.minX, spawnBounds.maxX),
            random.nextFloat(spawnBounds.minY, spawnBounds.maxY),
          )
        : vec2(
            random.nextFloat(-SPAWN_RANGE, SPAWN_RANGE),
            random.nextFloat(-SPAWN_RANGE, SPAWN_RANGE),
          );
      // Nudge out of furniture if the random point landed inside a table/crate.
      if (blockerList.length > 0) {
        spawnPosition = resolveCircleVsObstacles(spawnPosition, spawnPosition, 16, blockerList);
      }
      world.addEntity(createEntity(playerId, spawnPosition));
    }
    return new Simulation(random, world, 0);
  }

  /**
   * Rebuilds a simulation from a snapshot for a late-joining or resyncing
   * peer. `seed` only seeds the `Random` instance going forward — see the
   * note on {@link Snapshot} for why RNG state itself doesn't need restoring
   * in Phase 1. `tileMap` must match whatever the rest of the session is
   * using, so collision behaves the same for the rejoining peer.
   */
  static fromSnapshot(
    snapshot: Snapshot,
    seed: string,
    tileMap?: TileMap,
    clearWorld: readonly { x: number; z: number }[] = [],
  ): Simulation {
    const world = restoreWorldFromSnapshot(snapshot, tileMap, clearWorld);
    return new Simulation(new Random(seed), world, snapshot.tick);
  }

  get currentTick(): number {
    return this.tick;
  }

  step(inputs: readonly PlayerInput[], dtMs: number): void {
    this.world.step(inputs, dtMs);
    this.tick += 1;
  }

  getStateHash(): string {
    return hashWorldState(this.world, this.tick);
  }

  getSnapshot(): Snapshot {
    return createSnapshot(this.world, this.tick);
  }
}
