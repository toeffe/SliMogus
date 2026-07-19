import type { LobbyState } from './lobby';

/**
 * Deterministic next-host choice: the lowest remaining player id. Every
 * peer computes this independently from the same (already-synced) player
 * list, so no election protocol or extra messages are needed — everyone
 * converges on the same answer without coordination.
 */
export function selectNextHost(playerIds: readonly number[]): number | null {
  if (playerIds.length === 0) return null;
  return Math.min(...playerIds);
}

/** Re-derives `hostPlayerId` if the current host is no longer among `players`. A no-op (returns the same state) otherwise, including when no players remain. */
export function applyHostMigration(state: LobbyState): LobbyState {
  const hostStillPresent = state.players.some((player) => player.playerId === state.hostPlayerId);
  if (hostStillPresent) return state;

  const nextHost = selectNextHost(state.players.map((player) => player.playerId));
  if (nextHost === null || nextHost === state.hostPlayerId) return state;
  return { ...state, hostPlayerId: nextHost };
}
