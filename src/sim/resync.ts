import type { PlayerInput } from './input';
import { Simulation } from './simulation';
import type { Snapshot } from './snapshot';
import type { TileMap } from './tilemap';

/**
 * Rebuilds a simulation for a late-joining or resyncing peer: restore the
 * snapshot, then deterministically replay every tick of input the peer
 * missed while the snapshot was in transit.
 */
export function resyncFromSnapshot(
  snapshot: Snapshot,
  seed: string,
  pendingInputsByTick: ReadonlyMap<number, readonly PlayerInput[]>,
  dtMs: number,
  tileMap?: TileMap,
  clearWorld: readonly { x: number; z: number }[] = [],
): Simulation {
  const simulation = Simulation.fromSnapshot(snapshot, seed, tileMap, clearWorld);
  const ticksToReplay = [...pendingInputsByTick.keys()].sort((a, b) => a - b);

  for (const tick of ticksToReplay) {
    simulation.step(pendingInputsByTick.get(tick) ?? [], dtMs);
  }

  return simulation;
}
