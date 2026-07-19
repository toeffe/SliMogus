export const PROTOCOL_VERSION = 1;

export interface PlayerInfo {
  playerId: number;
  name: string;
  color: number;
  /** Quaternius roster id from `characterRoster.ts`. */
  characterId: string;
}

export interface LobbySettings {
  impostorCount: number;
  mapId: string;
  taskCount: number;
}

/**
 * Wire-level lobby events. `lobby.ts` owns the aggregate `LobbyState` and
 * the pure reducer that consumes these; this file only owns the shapes
 * that travel over the reliable channel.
 */
export type LobbyEvent =
  | { kind: 'join'; player: PlayerInfo }
  | { kind: 'leave'; playerId: number }
  | { kind: 'ready'; playerId: number; ready: boolean }
  | { kind: 'settingsChanged'; settings: Partial<LobbySettings> }
  | { kind: 'hostMigrated'; newHostId: number }
  /** Host-generated so every peer seeds its `Simulation` identically — required for the deterministic replay Phase 1 relies on. */
  | { kind: 'start'; seed: string };

/** Messages sent over PeerJS DataConnections. Binary input frames are sent as ArrayBuffers on the same connection (not JSON). */
export type NetMessage =
  | { type: 'lobbyEvent'; version: number; event: LobbyEvent }
  /** Joiner → host once the DataConnection opens: announces this browser's PeerJS id. */
  | { type: 'peerHello'; version: number; peerJsId: string }
  /** Host → joiner: assigned numeric player id + full peerId roster for mesh growth. */
  | {
      type: 'peerWelcome';
      version: number;
      playerId: number;
      roster: ReadonlyArray<{ playerId: number; peerJsId: string }>;
    }
  /** Host-only instruction: open a direct PeerJS link to `targetPeerJsId` (mapped to `targetPlayerId`). */
  | {
      type: 'meshInvite';
      version: number;
      targetPlayerId: number;
      targetPeerJsId: string;
    }
  | { type: 'ping'; version: number; seq: number; sentAt: number }
  | { type: 'pong'; version: number; seq: number; sentAt: number }
  | { type: 'stateHash'; version: number; tick: number; hash: string }
  /**
   * Reliable copy of a `PlayerInput` frame (every tick under lockstep).
   * Unreliable is the low-latency path; this covers drops. `payload` is
   * `Array.from(encodeInput(input))`. `TickBuffer.add` is idempotent per
   * `(tick, playerId)` so dual delivery is safe.
   */
  | { type: 'actionInput'; version: number; payload: number[] }
  /** Peer finished loading match assets and is ready for tick 0. */
  | { type: 'matchReady'; version: number; playerId: number }
  /** Host: all peers ready — start the shared GameLoop. */
  | { type: 'matchGo'; version: number };

export function encodeMessage(message: NetMessage): string {
  return JSON.stringify(message);
}

export function decodeMessage(raw: string): NetMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('decodeMessage: payload is not valid JSON');
  }
  if (!isNetMessageShape(parsed)) {
    throw new Error('decodeMessage: malformed message');
  }
  if (parsed.version !== PROTOCOL_VERSION) {
    throw new Error(`decodeMessage: unsupported protocol version ${parsed.version}`);
  }
  return parsed;
}

function isNetMessageShape(value: unknown): value is NetMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' && typeof record.version === 'number';
}
