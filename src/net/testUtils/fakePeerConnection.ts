import type { DataChannelLike, PeerConnectionLike } from '../peerConnectionTypes';

/**
 * Minimal, deterministic stand-in for `RTCPeerConnection`/`RTCDataChannel`
 * used to unit test `PeerLink`'s Perfect Negotiation state machine without
 * a real browser or a native WebRTC binding. Implements just enough of the
 * signaling-state transitions to exercise offer/answer/glare/rollback.
 */
export class FakeDataChannel implements DataChannelLike {
  readyState: RTCDataChannelState = 'connecting';
  binaryType: BinaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly sent: unknown[] = [];

  constructor(readonly label: string) {}

  send(data: string | ArrayBufferView): void {
    if (this.readyState !== 'open') {
      throw new Error(`FakeDataChannel: cannot send while readyState is "${this.readyState}"`);
    }
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 'closed';
  }

  simulateOpen(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data });
  }
}

export class FakePeerConnection implements PeerConnectionLike {
  signalingState: RTCSignalingState = 'stable';
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  onicecandidate:
    ((event: { candidate: RTCIceCandidate | RTCIceCandidateInit | null }) => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  readonly dataChannels: FakeDataChannel[] = [];
  readonly addedCandidates: RTCIceCandidateInit[] = [];
  /** Test hook: fired whenever this side creates a channel (i.e. it's the offering side), so a harness can bridge it to the remote fake. */
  onLocalDataChannelCreated: ((channel: FakeDataChannel) => void) | null = null;
  private offerCount = 0;
  private _ondatachannel: ((event: { channel: DataChannelLike }) => void) | null = null;
  /**
   * A channel handed to `simulateIncomingDataChannel` before `ondatachannel`
   * is wired (e.g. the offering side creates channels synchronously, before
   * the answering side's `PeerLink` has even been constructed) is buffered
   * here and flushed the moment a handler is attached — mirroring how a
   * real remote `ondatachannel` only fires once negotiation reaches that
   * peer, by which point its `RTCPeerConnection` already exists.
   */
  private readonly pendingIncomingChannels: DataChannelLike[] = [];

  get ondatachannel(): ((event: { channel: DataChannelLike }) => void) | null {
    return this._ondatachannel;
  }

  set ondatachannel(handler: ((event: { channel: DataChannelLike }) => void) | null) {
    this._ondatachannel = handler;
    if (!handler || this.pendingIncomingChannels.length === 0) return;
    const pending = this.pendingIncomingChannels.splice(0, this.pendingIncomingChannels.length);
    for (const channel of pending) handler({ channel });
  }

  createDataChannel(label: string): DataChannelLike {
    const channel = new FakeDataChannel(label);
    this.dataChannels.push(channel);
    this.onLocalDataChannelCreated?.(channel);
    return channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.offerCount += 1;
    return { type: 'offer', sdp: `fake-offer-sdp-${this.offerCount}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'fake-answer-sdp' };
  }

  async setLocalDescription(description?: RTCSessionDescriptionInit): Promise<void> {
    if (description?.type === 'rollback') {
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    if (!description) {
      throw new Error('FakePeerConnection: setLocalDescription() requires a description');
    }
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    this.beginIceGathering();
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  close(): void {
    this.connectionState = 'closed';
  }

  /** Test hook: simulate a remote peer opening a data channel toward us. */
  simulateIncomingDataChannel(channel: DataChannelLike): void {
    if (this._ondatachannel) {
      this._ondatachannel({ channel });
    } else {
      this.pendingIncomingChannels.push(channel);
    }
  }

  /** Test hook: simulate the browser reporting a connection state transition. */
  simulateConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  private beginIceGathering(): void {
    this.iceGatheringState = 'gathering';
    queueMicrotask(() => {
      this.onicecandidate?.({
        candidate: { candidate: `candidate:fake-${this.offerCount}`, sdpMid: '0' },
      });
      this.iceGatheringState = 'complete';
      this.onicegatheringstatechange?.();
    });
  }
}
