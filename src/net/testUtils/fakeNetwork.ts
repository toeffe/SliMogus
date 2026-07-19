import type { PeerConnectionFactory } from '../peerConnectionTypes';
import { FakeDataChannel, FakePeerConnection } from './fakePeerConnection';

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function forwardChannel(from: FakeDataChannel, to: FakeDataChannel): void {
  const originalSend = from.send.bind(from);
  from.send = (data: string | ArrayBufferView) => {
    originalSend(data);
    to.simulateMessage(data);
  };
}

/**
 * Wires a freshly created channel on one side to a same-labeled mirror
 * delivered to the other side, forwarding `send()` both ways. Deliberately
 * does NOT open either channel yet — that only happens once the harness's
 * `markConnected` is called, mirroring how a real DataChannel stays
 * "connecting" until the underlying ICE connection actually completes.
 * Without this, mesh-growth signaling (which must route through the host
 * precisely because the direct link isn't up yet) would short-circuit
 * straight to a "direct link", never exercising the relay path.
 */
function bridgeNewChannel(
  channel: FakeDataChannel,
  remotePc: FakePeerConnection,
  registry: FakeDataChannel[],
): void {
  const mirror = new FakeDataChannel(channel.label);
  forwardChannel(channel, mirror);
  forwardChannel(mirror, channel);
  registry.push(channel, mirror);
  remotePc.simulateIncomingDataChannel(mirror);
}

/**
 * In-memory stand-in for the browser's WebRTC transport, used to exercise
 * `PeerMesh`/`PeerLink` orchestration end to end across several simulated
 * players. Each unordered player-id pair gets one lazily-created pair of
 * `FakePeerConnection`s (one per side), bridged so that a channel created
 * by either side's `PeerLink` is delivered to the other side and any
 * `send()` call is forwarded, just like a real DataChannel pair.
 */
interface BridgedPair {
  pcLow: FakePeerConnection;
  pcHigh: FakePeerConnection;
  channels: FakeDataChannel[];
}

export class FakeNetwork {
  private readonly pairs = new Map<string, BridgedPair>();

  readonly factory: PeerConnectionFactory = (_config, context) => {
    const pair = this.getOrCreatePair(context.localPlayerId, context.remotePlayerId);
    return context.localPlayerId < context.remotePlayerId ? pair.pcLow : pair.pcHigh;
  };

  /** Simulates the underlying ICE connection completing for a pair: opens every channel created for it so far, and fires `connectionState` = 'connected' on both sides. */
  markConnected(playerIdA: number, playerIdB: number): void {
    const pair = this.getOrCreatePair(playerIdA, playerIdB);
    for (const channel of pair.channels) channel.simulateOpen();
    pair.pcLow.simulateConnectionState('connected');
    pair.pcHigh.simulateConnectionState('connected');
  }

  private getOrCreatePair(a: number, b: number): BridgedPair {
    const key = pairKey(a, b);
    let pair = this.pairs.get(key);
    if (!pair) {
      const pcLow = new FakePeerConnection();
      const pcHigh = new FakePeerConnection();
      const channels: FakeDataChannel[] = [];
      pcLow.onLocalDataChannelCreated = (channel) => bridgeNewChannel(channel, pcHigh, channels);
      pcHigh.onLocalDataChannelCreated = (channel) => bridgeNewChannel(channel, pcLow, channels);
      pair = { pcLow, pcHigh, channels };
      this.pairs.set(key, pair);
    }
    return pair;
  }
}
