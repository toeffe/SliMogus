import Peer, { type DataConnection } from 'peerjs';
import { Random } from '@sim/random';
import { PEER_CONFIG } from './peerConfig';
import { decodeMessage, encodeMessage, PROTOCOL_VERSION, type NetMessage } from './protocol';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode';

/** By convention the host that creates a fresh lobby is always assigned this id. */
export const HOST_PLAYER_ID = 0;

const HOST_CODE_ATTEMPTS = 8;

export type ChannelName = 'reliable' | 'unreliable';

export interface PeerMeshOptions {
  /** Optional PeerJS cloud / self-host overrides (defaults match the public PeerJS broker). */
  peerOptions?: ConstructorParameters<typeof Peer>[1];
  /** Test seam: inject a Peer-like constructor. `id` omitted → random PeerJS id. */
  createPeer?: (id?: string | undefined, options?: ConstructorParameters<typeof Peer>[1]) => Peer;
  onPeerMessage?: (fromPlayerId: number, message: NetMessage) => void;
  onPeerInput?: (fromPlayerId: number, data: ArrayBuffer) => void;
  onPeerConnectionStateChange?: (playerId: number, state: RTCPeerConnectionState) => void;
  /** Fires when the DataConnection to a peer is open and ready for lobby/game messages. */
  onPeerChannelOpen?: (playerId: number, channel: ChannelName) => void;
  onLinkError?: (playerId: number, error: unknown) => void;
}

interface PeerLinkSlots {
  reliable: DataConnection | null;
  unreliable: DataConnection | null;
}

/**
 * PeerJS-backed full mesh (tetris_game join UX):
 * - Host claims a 5-char peer id as the room code.
 * - Joiners `peer.connect(code)`.
 * - Host assigns numeric player ids and tells peers to PeerJS-connect to each
 *   other so inputs stay full-mesh (not host-relayed game state).
 */
export class PeerMesh {
  private _localPlayerId: number;
  readonly isHost: boolean;
  readonly roomCode: string;

  private peer: Peer | null = null;
  private readonly links = new Map<number, PeerLinkSlots>();
  private readonly peerJsByPlayerId = new Map<number, string>();
  private readonly playerIdByPeerJs = new Map<string, number>();
  private nextAssignablePlayerId = 1;
  private welcomeResolve: ((playerId: number) => void) | null = null;
  private welcomeReject: ((error: Error) => void) | null = null;

  private constructor(
    private options: PeerMeshOptions,
    roomCode: string,
    localPlayerId: number,
    isHost: boolean,
  ) {
    this.roomCode = roomCode;
    this._localPlayerId = localPlayerId;
    this.isHost = isHost;
  }

  get localPlayerId(): number {
    return this._localPlayerId;
  }

  get connectedPlayerIds(): number[] {
    return [...this.links.entries()]
      .filter(([, slots]) => slots.reliable?.open === true)
      .map(([playerId]) => playerId);
  }

  updateOptions(patch: Partial<PeerMeshOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  /**
   * HOST: claim a 5-char PeerJS id (retry on collision) and start accepting
   * inbound connections. Resolves once the peer broker reports `open`.
   */
  static async createAsHost(options: PeerMeshOptions = {}): Promise<PeerMesh> {
    let lastError: unknown;
    for (let attempt = 0; attempt < HOST_CODE_ATTEMPTS; attempt += 1) {
      const roomCode = generateRoomCode(new Random(`${crypto.randomUUID()}-${attempt}`));
      const mesh = new PeerMesh(options, roomCode, HOST_PLAYER_ID, true);
      try {
        await mesh.openLocalPeer(roomCode);
        mesh.peerJsByPlayerId.set(HOST_PLAYER_ID, roomCode);
        mesh.playerIdByPeerJs.set(roomCode, HOST_PLAYER_ID);
        mesh.wireIncoming();
        return mesh;
      } catch (error) {
        lastError = error;
        mesh.close();
        if (!isUnavailablePeerId(error)) break;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('PeerMesh.createAsHost: could not claim a room code');
  }

  /**
   * JOINER: open a random PeerJS id, connect to the host's room code, wait
   * for `peerWelcome` (assigns `localPlayerId`).
   */
  static async joinByCode(roomCode: string, options: PeerMeshOptions = {}): Promise<PeerMesh> {
    const code = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(code)) {
      throw new Error('Need a 5-character room code.');
    }
    const mesh = new PeerMesh(options, code, -1, false);
    await mesh.openLocalPeer();
    mesh.wireIncoming();
    await mesh.connectToHost(code);
    return mesh;
  }

  sendReliable(toPlayerId: number, message: NetMessage): void {
    const conn = this.links.get(toPlayerId)?.reliable;
    if (!conn?.open) return;
    conn.send(encodeMessage(message));
  }

  broadcastReliable(message: NetMessage): void {
    for (const playerId of this.links.keys()) {
      this.sendReliable(playerId, message);
    }
  }

  /**
   * Sends a binary input frame. By default goes out on **both** open channels:
   * unreliable for latency, reliable as a tiny safety net (TURN often drops
   * unordered/unreliable). Pass `reliable: false` to retransmit on unreliable
   * only (e.g. while lockstep-holding the same seq).
   */
  sendInput(toPlayerId: number, data: ArrayBufferView, options?: { reliable?: boolean }): void {
    const slots = this.links.get(toPlayerId);
    if (!slots) return;
    const payload = toArrayBuffer(data);
    const includeReliable = options?.reliable !== false;
    let sent = false;

    if (slots.unreliable?.open) {
      try {
        slots.unreliable.send(payload);
        sent = true;
      } catch {
        /* fall through to reliable */
      }
    }

    if (includeReliable && slots.reliable?.open) {
      try {
        slots.reliable.send(payload);
        sent = true;
      } catch {
        /* ignore */
      }
    } else if (!sent && slots.reliable?.open) {
      // Unreliable missing/closed — always fall back to reliable.
      try {
        slots.reliable.send(payload);
      } catch {
        /* ignore */
      }
    }
  }

  broadcastInput(data: ArrayBufferView, options?: { reliable?: boolean }): void {
    for (const playerId of this.links.keys()) {
      this.sendInput(playerId, data, options);
    }
  }

  close(): void {
    for (const slots of this.links.values()) {
      try {
        slots.reliable?.close();
      } catch {
        /* ignore */
      }
      try {
        slots.unreliable?.close();
      } catch {
        /* ignore */
      }
    }
    this.links.clear();
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
    this.welcomeReject?.(new Error('PeerMesh closed'));
    this.welcomeResolve = null;
    this.welcomeReject = null;
  }

  private openLocalPeer(fixedId?: string): Promise<void> {
    const peerOptions = this.options.peerOptions ?? PEER_CONFIG;
    const create =
      this.options.createPeer ??
      ((id?: string | undefined, options?: ConstructorParameters<typeof Peer>[1]) => {
        // PeerJS types: options-only ctor is `new Peer(options)`, not `new Peer(undefined, options)`.
        if (id === undefined) {
          return options ? new Peer(options) : new Peer();
        }
        return new Peer(id, options);
      });
    const peer =
      fixedId === undefined ? create(undefined, peerOptions) : create(fixedId, peerOptions);
    this.peer = peer;

    return new Promise((resolve, reject) => {
      let settled = false;
      const onOpen = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const cleanup = (): void => {
        peer.off('open', onOpen);
        peer.off('error', onError);
      };
      peer.on('open', onOpen);
      peer.on('error', onError);
    });
  }

  private wireIncoming(): void {
    const peer = this.peer;
    if (!peer) return;
    peer.on('connection', (conn) => {
      this.attachInboundConnection(conn);
    });
  }

  private connectToHost(hostCode: string): Promise<void> {
    const peer = this.peer;
    if (!peer) return Promise.reject(new Error('PeerMesh: peer not open'));

    const welcome = new Promise<number>((resolve, reject) => {
      this.welcomeResolve = resolve;
      this.welcomeReject = reject;
      // Avoid hanging forever if the host code is wrong / offline.
      globalThis.setTimeout(() => {
        if (this.welcomeReject) {
          this.welcomeReject(new Error('Join timed out — check the room code.'));
          this.welcomeResolve = null;
          this.welcomeReject = null;
        }
      }, 15000);
    });

    const reliable = peer.connect(hostCode, { reliable: true, label: 'reliable' });
    this.attachOutboundConnection(HOST_PLAYER_ID, hostCode, reliable, 'reliable');

    try {
      const unreliable = peer.connect(hostCode, { reliable: false, label: 'unreliable' });
      this.attachOutboundConnection(HOST_PLAYER_ID, hostCode, unreliable, 'unreliable');
    } catch {
      /* single-channel fallback */
    }

    return welcome.then((playerId) => {
      this._localPlayerId = playerId;
    });
  }

  private attachInboundConnection(conn: DataConnection): void {
    const channel: ChannelName = conn.label === 'unreliable' ? 'unreliable' : 'reliable';
    const knownId = this.playerIdByPeerJs.get(conn.peer);

    if (knownId !== undefined) {
      this.bindConnection(knownId, conn, channel);
      return;
    }

    if (channel !== 'reliable') {
      // Unreliable may arrive before hello; wait and re-check on open+data.
      conn.on('open', () => {
        const id = this.playerIdByPeerJs.get(conn.peer);
        if (id !== undefined) this.bindConnection(id, conn, 'unreliable');
      });
      return;
    }

    const onData = (data: unknown): void => {
      this.handleHostHandshake(conn, data);
    };
    conn.on('data', onData);
    conn.on('close', () => {
      const playerId = this.playerIdByPeerJs.get(conn.peer);
      if (playerId === undefined) return;
      this.dropLinkChannel(playerId, channel);
      this.options.onPeerConnectionStateChange?.(playerId, 'closed');
    });
    conn.on('error', (error) => {
      const playerId = this.playerIdByPeerJs.get(conn.peer) ?? -1;
      this.options.onLinkError?.(playerId, error);
    });
  }

  private handleHostHandshake(conn: DataConnection, data: unknown): void {
    if (!this.isHost) {
      // Mesh-growth inbound on a joiner: identity should already be registered via meshInvite.
      const playerId = this.playerIdByPeerJs.get(conn.peer);
      if (playerId === undefined) {
        this.options.onLinkError?.(-1, new Error('PeerMesh: inbound link from unknown peer'));
        return;
      }
      this.bindConnection(playerId, conn, 'reliable');
      if (typeof data === 'string' || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        this.handleRawData(playerId, 'reliable', data);
      }
      return;
    }

    if (typeof data !== 'string') return;
    let message: NetMessage;
    try {
      message = decodeMessage(data);
    } catch (error) {
      this.options.onLinkError?.(-1, error);
      return;
    }
    if (message.type !== 'peerHello') {
      this.options.onLinkError?.(-1, new Error('PeerMesh: expected peerHello from new peer'));
      return;
    }

    const peerJsId = conn.peer || message.peerJsId;
    if (this.playerIdByPeerJs.has(peerJsId)) {
      // Duplicate hello on an existing link.
      const existing = this.playerIdByPeerJs.get(peerJsId)!;
      this.bindConnection(existing, conn, 'reliable');
      return;
    }

    const playerId = this.nextAssignablePlayerId;
    this.nextAssignablePlayerId += 1;
    this.peerJsByPlayerId.set(playerId, peerJsId);
    this.playerIdByPeerJs.set(peerJsId, playerId);

    this.bindConnection(playerId, conn, 'reliable');

    const roster = [...this.peerJsByPlayerId.entries()].map(([id, idPeerJs]) => ({
      playerId: id,
      peerJsId: idPeerJs,
    }));
    this.sendReliable(playerId, {
      type: 'peerWelcome',
      version: PROTOCOL_VERSION,
      playerId,
      roster,
    });
    this.announceNewPeer(playerId);
  }

  private attachOutboundConnection(
    playerId: number,
    peerJsId: string,
    conn: DataConnection,
    channel: ChannelName,
  ): void {
    this.peerJsByPlayerId.set(playerId, peerJsId);
    this.playerIdByPeerJs.set(peerJsId, playerId);
    this.bindConnection(playerId, conn, channel);
  }

  private bindConnection(playerId: number, conn: DataConnection, channel: ChannelName): void {
    const slots = this.ensureSlots(playerId);
    if (channel === 'reliable') slots.reliable = conn;
    else slots.unreliable = conn;

    conn.removeAllListeners('data');
    conn.on('data', (data) => this.handleRawData(playerId, channel, data));
    conn.removeAllListeners('close');
    conn.on('close', () => {
      this.dropLinkChannel(playerId, channel);
      this.options.onPeerConnectionStateChange?.(playerId, 'closed');
    });
    conn.removeAllListeners('error');
    conn.on('error', (error) => this.options.onLinkError?.(playerId, error));

    const notifyOpen = (): void => {
      this.options.onPeerConnectionStateChange?.(playerId, 'connected');
      this.options.onPeerChannelOpen?.(playerId, channel);
      if (channel === 'reliable' && !this.isHost && playerId === HOST_PLAYER_ID) {
        this.sendReliable(HOST_PLAYER_ID, {
          type: 'peerHello',
          version: PROTOCOL_VERSION,
          peerJsId: this.peer?.id ?? '',
        });
      }
    };

    conn.removeAllListeners('open');
    conn.on('open', notifyOpen);
    if (conn.open) notifyOpen();
  }

  private handleRawData(fromPlayerId: number, _channel: ChannelName, data: unknown): void {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      this.options.onPeerInput?.(
        fromPlayerId,
        toArrayBuffer(data as ArrayBufferView | ArrayBuffer),
      );
      return;
    }

    // Host may still receive the first hello through bindConnection after handshake —
    // ignore duplicate peerHello.
    let raw = data;
    if (typeof raw !== 'string') {
      try {
        raw = JSON.stringify(raw);
      } catch {
        return;
      }
    }

    let message: NetMessage;
    try {
      message = decodeMessage(String(raw));
    } catch (error) {
      this.options.onLinkError?.(fromPlayerId, error);
      return;
    }
    this.routeMessage(fromPlayerId, message);
  }

  private routeMessage(fromPlayerId: number, message: NetMessage): void {
    if (message.type === 'peerWelcome' && !this.isHost) {
      for (const entry of message.roster) {
        this.peerJsByPlayerId.set(entry.playerId, entry.peerJsId);
        this.playerIdByPeerJs.set(entry.peerJsId, entry.playerId);
      }
      this._localPlayerId = message.playerId;
      this.welcomeResolve?.(message.playerId);
      this.welcomeResolve = null;
      this.welcomeReject = null;
      return;
    }

    if (message.type === 'meshInvite') {
      this.peerJsByPlayerId.set(message.targetPlayerId, message.targetPeerJsId);
      this.playerIdByPeerJs.set(message.targetPeerJsId, message.targetPlayerId);
      void this.initiateMeshLink(message.targetPlayerId, message.targetPeerJsId).catch((error) =>
        this.options.onLinkError?.(message.targetPlayerId, error),
      );
      return;
    }

    if (message.type === 'peerHello') return;

    this.options.onPeerMessage?.(fromPlayerId, message);
  }

  private announceNewPeer(newPlayerId: number): void {
    if (!this.isHost) return;
    const newPeerJsId = this.peerJsByPlayerId.get(newPlayerId);
    if (!newPeerJsId) return;

    for (const [existingId, existingPeerJsId] of this.peerJsByPlayerId) {
      if (existingId === newPlayerId || existingId === HOST_PLAYER_ID) continue;
      this.sendReliable(newPlayerId, {
        type: 'meshInvite',
        version: PROTOCOL_VERSION,
        targetPlayerId: existingId,
        targetPeerJsId: existingPeerJsId,
      });
      this.sendReliable(existingId, {
        type: 'meshInvite',
        version: PROTOCOL_VERSION,
        targetPlayerId: newPlayerId,
        targetPeerJsId: newPeerJsId,
      });
    }
  }

  private async initiateMeshLink(targetPlayerId: number, targetPeerJsId: string): Promise<void> {
    if (this.links.get(targetPlayerId)?.reliable?.open) return;
    // Only the lower numeric player id offers — the other side accepts inbound.
    if (this.localPlayerId < 0 || this.localPlayerId > targetPlayerId) return;
    const peer = this.peer;
    if (!peer) return;

    const reliable = peer.connect(targetPeerJsId, { reliable: true, label: 'reliable' });
    this.attachOutboundConnection(targetPlayerId, targetPeerJsId, reliable, 'reliable');
    try {
      const unreliable = peer.connect(targetPeerJsId, { reliable: false, label: 'unreliable' });
      this.attachOutboundConnection(targetPlayerId, targetPeerJsId, unreliable, 'unreliable');
    } catch {
      /* optional */
    }
  }

  private ensureSlots(playerId: number): PeerLinkSlots {
    let slots = this.links.get(playerId);
    if (!slots) {
      slots = { reliable: null, unreliable: null };
      this.links.set(playerId, slots);
    }
    return slots;
  }

  private dropLinkChannel(playerId: number, channel: ChannelName): void {
    const slots = this.links.get(playerId);
    if (!slots) return;
    if (channel === 'reliable') slots.reliable = null;
    else slots.unreliable = null;
    if (!slots.reliable && !slots.unreliable) this.links.delete(playerId);
  }
}

function toArrayBuffer(data: ArrayBufferView | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const view = data as ArrayBufferView;
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

function isUnavailablePeerId(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const type = (error as { type?: string }).type;
  return type === 'unavailable-id';
}
