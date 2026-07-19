import { Random } from '@sim/random';

export type Role = 'crewmate' | 'impostor';

/**
 * Deterministic role assignment: every peer with the same seed/player-set/
 * `impostorCount` computes an identical `Map`. Draws from its own `Random`
 * sub-seed (suffixed, not the raw seed) so it never shares state with — or
 * desyncs — `Simulation.create`'s spawn-position draw from the same seed.
 */
export function assignRoles(
  seed: string,
  playerIds: readonly number[],
  impostorCount: number,
): Map<number, Role> {
  const sortedIds = [...playerIds].sort((a, b) => a - b);
  // At least one crewmate must remain, however `impostorCount` was configured.
  const clampedImpostorCount = Math.max(0, Math.min(impostorCount, sortedIds.length - 1));

  const random = new Random(`${seed}:roles`);
  const shuffled = [...sortedIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = random.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const impostorIds = new Set(shuffled.slice(0, clampedImpostorCount));

  const roles = new Map<number, Role>();
  for (const playerId of sortedIds) {
    roles.set(playerId, impostorIds.has(playerId) ? 'impostor' : 'crewmate');
  }
  return roles;
}
