import type { LobbyEvent, LobbySettings, PlayerInfo } from './protocol';

/** Soft social-deduction floor: 1 impostor + at least 2 crew. */
export const MIN_PLAYERS_TO_START = 3;

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  impostorCount: 1,
  mapId: 'omega',
  taskCount: 5,
};

export interface LobbyPlayer extends PlayerInfo {
  ready: boolean;
}

export interface LobbyState {
  roomCode: string;
  hostPlayerId: number;
  localPlayerId: number;
  /** Always kept sorted by `playerId` so every peer's UI/logic iterates in the same deterministic order. */
  players: LobbyPlayer[];
  settings: LobbySettings;
  started: boolean;
  /** Set from the `start` event's payload — the shared seed every peer's `Simulation` is created with. */
  seed: string | null;
}

export interface CreateLobbyStateOptions {
  roomCode: string;
  hostPlayerId: number;
  localPlayerId: number;
  hostPlayer: PlayerInfo;
  settings?: Partial<LobbySettings>;
}

export function createLobbyState(options: CreateLobbyStateOptions): LobbyState {
  return {
    roomCode: options.roomCode,
    hostPlayerId: options.hostPlayerId,
    localPlayerId: options.localPlayerId,
    players: [{ ...options.hostPlayer, ready: false }],
    settings: { ...DEFAULT_LOBBY_SETTINGS, ...options.settings },
    started: false,
    seed: null,
  };
}

function sortedByPlayerId(players: readonly LobbyPlayer[]): LobbyPlayer[] {
  return [...players].sort((a, b) => a.playerId - b.playerId);
}

/**
 * Pure reducer: `LobbyState` in, `LobbyState` out, no side effects. Every
 * peer applies the same sequence of `LobbyEvent`s (received over the
 * reliable channel, or applied locally before broadcasting) to stay in
 * sync. Unknown/redundant events are no-ops rather than errors, since the
 * network can legitimately deliver a duplicate or late `join`/`leave`.
 */
export function applyLobbyEvent(state: LobbyState, event: LobbyEvent): LobbyState {
  switch (event.kind) {
    case 'join': {
      const existing = state.players.find((player) => player.playerId === event.player.playerId);
      if (existing) {
        // Upsert identity so a peer can announce their display name after the
        // host's deterministic fallback join (Phase 5 settings). Ready stays.
        if (
          existing.name === event.player.name &&
          existing.color === event.player.color &&
          existing.characterId === event.player.characterId
        ) {
          return state;
        }
        return {
          ...state,
          players: sortedByPlayerId(
            state.players.map((player) =>
              player.playerId === event.player.playerId
                ? {
                    ...player,
                    name: event.player.name,
                    color: event.player.color,
                    characterId: event.player.characterId,
                  }
                : player,
            ),
          ),
        };
      }
      return {
        ...state,
        players: sortedByPlayerId([...state.players, { ...event.player, ready: false }]),
      };
    }
    case 'leave': {
      const players = state.players.filter((player) => player.playerId !== event.playerId);
      if (players.length === state.players.length) return state;
      return { ...state, players };
    }
    case 'ready': {
      let changed = false;
      const players = state.players.map((player) => {
        if (player.playerId !== event.playerId || player.ready === event.ready) return player;
        changed = true;
        return { ...player, ready: event.ready };
      });
      return changed ? { ...state, players } : state;
    }
    case 'settingsChanged': {
      return { ...state, settings: { ...state.settings, ...event.settings } };
    }
    case 'hostMigrated': {
      if (state.hostPlayerId === event.newHostId) return state;
      return { ...state, hostPlayerId: event.newHostId };
    }
    case 'start': {
      if (state.started || state.players.length < MIN_PLAYERS_TO_START) return state;
      return { ...state, started: true, seed: event.seed };
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function allPlayersReady(state: LobbyState): boolean {
  return state.players.length > 0 && state.players.every((player) => player.ready);
}

/** Host may start only when everyone is ready and the lobby meets the player floor. */
export function canStartMatch(state: LobbyState): boolean {
  return state.players.length >= MIN_PLAYERS_TO_START && allPlayersReady(state);
}

export function isLocalPlayerHost(state: LobbyState): boolean {
  return state.hostPlayerId === state.localPlayerId;
}
