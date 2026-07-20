import { decodeInput, encodeInput, type PlayerInput } from '@sim/input';
import { TickBuffer } from '@sim/tickBuffer';
import { PROTOCOL_VERSION, type NetMessage } from './protocol';
import type { PeerMesh } from './mesh';

const DEFAULT_STATE_HASH_INTERVAL_TICKS = 60;
/** How many trailing local hashes we keep around to compare against a same-tick remote hash arriving slightly late. */
const HASH_HISTORY_SIZE = 300;

export interface StateHashMismatch {
  fromPlayerId: number;
  tick: number;
  localHash: string;
  remoteHash: string;
}

export interface NetworkBridgeOptions {
  mesh: PeerMesh;
  tickBuffer: TickBuffer;
  /** How often (in ticks) to broadcast this peer's state hash for desync detection. Phase 2 only detects — recovery is Phase 6. */
  stateHashIntervalTicks?: number;
  onStateHashMismatch?: (mismatch: StateHashMismatch) => void;
  /** Anything that isn't a `stateHash` message (lobby events, ping/pong, ...) is passed through here instead. */
  onMessage?: (fromPlayerId: number, message: NetMessage) => void;
}

/**
 * Glues a `PeerMesh` to Phase 1's `TickBuffer`/`Simulation`: local input goes
 * out over the unreliable channel and into the local `TickBuffer` in one
 * call, remote input comes back in through the mesh's `onPeerInput` hook
 * straight into the same `TickBuffer`, and both sides periodically compare
 * `Simulation.getStateHash()` over the reliable channel.
 */
export class NetworkBridge {
  private readonly recentLocalHashes = new Map<number, string>();
  /** Last seq broadcast on the wire — lockstep hold re-calls send with the same seq. */
  private lastBroadcastSeq = Number.NaN;

  constructor(private readonly options: NetworkBridgeOptions) {
    this.options.mesh.updateOptions({
      onPeerInput: (fromPlayerId, data) => this.handlePeerInput(fromPlayerId, data),
      onPeerMessage: (fromPlayerId, message) => this.handlePeerMessage(fromPlayerId, message),
    });
  }

  /**
   * Buffers the local player's input for `input.seq` and broadcasts a binary
   * frame. Each **new** seq goes on unreliable + reliable (binary on both —
   * TURN often drops the unreliable channel even when it reports open). While
   * lockstep-holding the same seq, only unreliable is retransmitted so the
   * ordered reliable pipe is not flooded. JSON `actionInput` is reserved for
   * discrete button frames as an extra ordered backup.
   */
  sendLocalInput(input: PlayerInput): void {
    const encoded = encodeInput(input);
    const wireInput = decodeInput(encoded);
    this.options.tickBuffer.add(wireInput.seq, wireInput);

    const isNewSeq = wireInput.seq !== this.lastBroadcastSeq;
    this.lastBroadcastSeq = wireInput.seq;

    if (isNewSeq) {
      this.options.mesh.broadcastInput(encoded);
      if (wireInput.buttons !== 0) {
        this.options.mesh.broadcastReliable({
          type: 'actionInput',
          version: PROTOCOL_VERSION,
          payload: Array.from(encoded),
        });
      }
      return;
    }

    // Holding for a peer: nudge unreliable only; reliable already has this seq.
    this.options.mesh.broadcastInput(encoded, { reliable: false });
  }

  /** Looks up a previously recorded local hash for `tick`, if it's still within the trailing history window. Mainly for tests/tooling that need to compare peers at an identical logical tick rather than "whatever's current right now" (which skews across peers reading it at slightly different real times). */
  getLocalHash(tick: number): string | undefined {
    return this.recentLocalHashes.get(tick);
  }

  /** Call once per simulation tick, right after `Simulation.step`, to record and (periodically) broadcast this tick's state hash. */
  recordLocalTick(tick: number, hash: string): void {
    this.recentLocalHashes.set(tick, hash);
    for (const bufferedTick of this.recentLocalHashes.keys()) {
      if (bufferedTick <= tick - HASH_HISTORY_SIZE) this.recentLocalHashes.delete(bufferedTick);
    }

    const interval = this.options.stateHashIntervalTicks ?? DEFAULT_STATE_HASH_INTERVAL_TICKS;
    if (tick % interval !== 0) return;
    this.options.mesh.broadcastReliable({
      type: 'stateHash',
      version: PROTOCOL_VERSION,
      tick,
      hash,
    });
  }

  private handlePeerInput(fromPlayerId: number, data: ArrayBuffer): void {
    this.applyDecodedInput(fromPlayerId, new Float32Array(data));
  }

  /** Shared by both the unreliable per-tick path and the reliable `actionInput` duplicate — `TickBuffer.add` is idempotent per `(tick, playerId)`, so applying the same frame twice (once per channel) is harmless. */
  private applyDecodedInput(fromPlayerId: number, floats: Float32Array): void {
    let input: PlayerInput;
    try {
      input = decodeInput(floats);
    } catch {
      return; // malformed input frame — drop silently, no recovery in this phase
    }
    if (input.playerId !== fromPlayerId) return; // ignore a frame claiming to be from someone else
    this.options.tickBuffer.add(input.seq, input);
  }

  private handlePeerMessage(fromPlayerId: number, message: NetMessage): void {
    if (message.type === 'actionInput') {
      this.applyDecodedInput(fromPlayerId, Float32Array.from(message.payload));
      return;
    }
    if (message.type !== 'stateHash') {
      this.options.onMessage?.(fromPlayerId, message);
      return;
    }
    const localHash = this.recentLocalHashes.get(message.tick);
    if (localHash !== undefined && localHash !== message.hash) {
      this.options.onStateHashMismatch?.({
        fromPlayerId,
        tick: message.tick,
        localHash,
        remoteHash: message.hash,
      });
    }
  }
}
