import { describe, expect, it } from 'vitest';
import { createLobbyState, type LobbyState } from './lobby';
import { applyHostMigration, selectNextHost } from './hostMigration';

function stateWithPlayers(playerIds: number[], hostPlayerId: number): LobbyState {
  const state = createLobbyState({
    roomCode: 'ABC234',
    hostPlayerId,
    localPlayerId: hostPlayerId,
    hostPlayer: {
      playerId: playerIds[0] ?? hostPlayerId,
      name: 'P0',
      color: 0,
      characterId: 'suit',
    },
  });
  return {
    ...state,
    hostPlayerId,
    players: playerIds.map((playerId) => ({
      playerId,
      name: `P${playerId}`,
      color: 0,
      characterId: 'suit',
      ready: false,
    })),
  };
}

describe('selectNextHost', () => {
  it('picks the lowest player id', () => {
    expect(selectNextHost([3, 1, 2])).toBe(1);
  });

  it('returns null when there are no players', () => {
    expect(selectNextHost([])).toBeNull();
  });
});

describe('applyHostMigration', () => {
  it('is a no-op when the current host is still present', () => {
    const state = stateWithPlayers([0, 1, 2], 0);
    expect(applyHostMigration(state)).toBe(state);
  });

  it('migrates to the lowest remaining player id when the host has left', () => {
    const state = stateWithPlayers([1, 2, 3], 1); // host id 0 already removed from players
    // Simulate the actual host (0) having departed by setting hostPlayerId to a departed id.
    const withDepartedHost = { ...state, hostPlayerId: 0 };
    const migrated = applyHostMigration(withDepartedHost);
    expect(migrated.hostPlayerId).toBe(1);
  });

  it('is a no-op when no players remain at all', () => {
    const state = { ...stateWithPlayers([], 0) };
    expect(applyHostMigration(state)).toBe(state);
  });

  it('two peers computing migration independently converge on the same new host', () => {
    const stateOnPeerA = { ...stateWithPlayers([2, 5, 7], 5), hostPlayerId: 0 };
    const stateOnPeerB = { ...stateWithPlayers([2, 5, 7], 5), hostPlayerId: 0 };
    expect(applyHostMigration(stateOnPeerA).hostPlayerId).toBe(
      applyHostMigration(stateOnPeerB).hostPlayerId,
    );
    expect(applyHostMigration(stateOnPeerA).hostPlayerId).toBe(2);
  });
});
