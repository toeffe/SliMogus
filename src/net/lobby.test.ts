import { describe, expect, it } from 'vitest';
import type { LobbyEvent } from './protocol';
import {
  allPlayersReady,
  applyLobbyEvent,
  canStartMatch,
  createLobbyState,
  DEFAULT_LOBBY_SETTINGS,
  isLocalPlayerHost,
  MIN_PLAYERS_TO_START,
  type LobbyState,
} from './lobby';

function baseState(): LobbyState {
  return createLobbyState({
    roomCode: 'ABC234',
    hostPlayerId: 0,
    localPlayerId: 0,
    hostPlayer: { playerId: 0, name: 'Host', color: 0xff0000, characterId: 'suit' },
  });
}

describe('createLobbyState', () => {
  it('starts with just the host, unready, default settings, not started', () => {
    const state = baseState();
    expect(state.players).toEqual([
      { playerId: 0, name: 'Host', color: 0xff0000, characterId: 'suit', ready: false },
    ]);
    expect(state.settings).toEqual(DEFAULT_LOBBY_SETTINGS);
    expect(state.started).toBe(false);
    expect(isLocalPlayerHost(state)).toBe(true);
  });

  it('merges partial settings over the defaults', () => {
    const state = createLobbyState({
      roomCode: 'ABC234',
      hostPlayerId: 0,
      localPlayerId: 0,
      hostPlayer: { playerId: 0, name: 'Host', color: 0, characterId: 'suit' },
      settings: { impostorCount: 2 },
    });
    expect(state.settings).toEqual({ ...DEFAULT_LOBBY_SETTINGS, impostorCount: 2 });
  });
});

describe('applyLobbyEvent', () => {
  it('never mutates the input state (pure reducer)', () => {
    const state = baseState();
    const frozen = JSON.parse(JSON.stringify(state));
    applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    expect(state).toEqual(frozen);
  });

  it('join adds a new player, keeping players sorted by id', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 2, name: 'Green', color: 0x00ff00, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    expect(state.players.map((p) => p.playerId)).toEqual([0, 1, 2]);
  });

  it('duplicate join with the same identity is a no-op', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    const again = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    expect(again).toBe(state);
  });

  it('duplicate join upserts name/color/character while preserving ready', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, { kind: 'ready', playerId: 1, ready: true });
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Cyan', color: 0x00ffff, characterId: 'ninja' },
    });
    const player = state.players.find((entry) => entry.playerId === 1);
    expect(player).toMatchObject({
      name: 'Cyan',
      color: 0x00ffff,
      characterId: 'ninja',
      ready: true,
    });
  });

  it('leave removes a player', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, { kind: 'leave', playerId: 1 });
    expect(state.players.map((p) => p.playerId)).toEqual([0]);
  });

  it('leave is a no-op for an unknown player id', () => {
    const state = baseState();
    expect(applyLobbyEvent(state, { kind: 'leave', playerId: 99 })).toEqual(state);
  });

  it('ready toggles a specific player without touching others', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, { kind: 'ready', playerId: 1, ready: true });
    expect(state.players.find((p) => p.playerId === 1)?.ready).toBe(true);
    expect(state.players.find((p) => p.playerId === 0)?.ready).toBe(false);
  });

  it('settingsChanged merges only the provided keys', () => {
    let state = baseState();
    state = applyLobbyEvent(state, { kind: 'settingsChanged', settings: { taskCount: 8 } });
    expect(state.settings).toEqual({ ...DEFAULT_LOBBY_SETTINGS, taskCount: 8 });
  });

  it('hostMigrated updates hostPlayerId', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, { kind: 'hostMigrated', newHostId: 1 });
    expect(state.hostPlayerId).toBe(1);
  });

  it('start flips started to true and records the shared seed, only once', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 2, name: 'Green', color: 0x00ff00, characterId: 'suit' },
    });
    const started = applyLobbyEvent(state, { kind: 'start', seed: 'shared-seed' });
    expect(started.started).toBe(true);
    expect(started.seed).toBe('shared-seed');
    expect(applyLobbyEvent(started, { kind: 'start', seed: 'other-seed' })).toBe(started);
  });

  it('start is a no-op below the minimum player count', () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    expect(state.players).toHaveLength(2);
    expect(applyLobbyEvent(state, { kind: 'start', seed: 'shared-seed' })).toBe(state);
  });

  it('handles a realistic sequence of events deterministically', () => {
    const events: LobbyEvent[] = [
      { kind: 'join', player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' } },
      {
        kind: 'join',
        player: { playerId: 2, name: 'Green', color: 0x00ff00, characterId: 'suit' },
      },
      { kind: 'ready', playerId: 1, ready: true },
      { kind: 'ready', playerId: 2, ready: true },
      { kind: 'ready', playerId: 0, ready: true },
    ];
    const finalState = events.reduce(applyLobbyEvent, baseState());
    expect(allPlayersReady(finalState)).toBe(true);
  });
});

describe('allPlayersReady', () => {
  it('is false for an empty lobby', () => {
    expect(allPlayersReady({ ...baseState(), players: [] })).toBe(false);
  });
});

describe('canStartMatch', () => {
  it(`requires at least ${MIN_PLAYERS_TO_START} ready players`, () => {
    let state = baseState();
    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 1, name: 'Blue', color: 0x0000ff, characterId: 'suit' },
    });
    state = applyLobbyEvent(state, { kind: 'ready', playerId: 0, ready: true });
    state = applyLobbyEvent(state, { kind: 'ready', playerId: 1, ready: true });
    expect(allPlayersReady(state)).toBe(true);
    expect(canStartMatch(state)).toBe(false);

    state = applyLobbyEvent(state, {
      kind: 'join',
      player: { playerId: 2, name: 'Green', color: 0x00ff00, characterId: 'suit' },
    });
    expect(canStartMatch(state)).toBe(false);
    state = applyLobbyEvent(state, { kind: 'ready', playerId: 2, ready: true });
    expect(canStartMatch(state)).toBe(true);
  });
});
