import { SIGNAL_VERSION, type SignalEnvelope } from './signaling';
import type {
  DataChannelLike,
  PeerConnectionFactory,
  PeerConnectionLike,
} from './peerConnectionTypes';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 4000;

export type ChannelName = 'reliable' | 'unreliable';

export interface PeerLinkCallbacks {
  onMessage?: (channel: ChannelName, data: unknown) => void;
  onChannelOpen?: (channel: ChannelName) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export interface PeerLinkOptions {
  localPlayerId: number;
  remotePlayerId: number;
  iceServers?: RTCIceServer[];
  iceGatheringTimeoutMs?: number;
  createPeerConnection?: PeerConnectionFactory;
  callbacks?: PeerLinkCallbacks;
}

/** Thrown when an incoming offer is intentionally dropped per the Perfect Negotiation "impolite defers to its own pending offer" rule. */
export class PeerLinkGlareIgnoredError extends Error {
  constructor(readonly remotePlayerId: number) {
    super(
      `PeerLink: ignored a colliding offer from player ${remotePlayerId} (impolite side keeps its own pending offer)`,
    );
    this.name = 'PeerLinkGlareIgnoredError';
  }
}

function defaultFactory(config: RTCConfiguration): PeerConnectionLike {
  return new RTCPeerConnection(config) as unknown as PeerConnectionLike;
}

function toCandidateInit(candidate: RTCIceCandidate | RTCIceCandidateInit): RTCIceCandidateInit {
  const maybeReal = candidate as Partial<RTCIceCandidate>;
  return typeof maybeReal.toJSON === 'function'
    ? maybeReal.toJSON()
    : (candidate as RTCIceCandidateInit);
}

/**
 * One `RTCPeerConnection` plus its reliable/unreliable `RTCDataChannel` pair
 * to a single remote player, implementing the Perfect Negotiation pattern
 * so simultaneous offers (glare) resolve deterministically. Signaling data
 * (offer/answer + gathered ICE candidates) is exchanged in batched
 * `SignalEnvelope`s rather than trickled — required for manual copy/paste,
 * and kept identical for host-relayed mesh-growth connections so `PeerLink`
 * doesn't need to know how its envelopes reach the other side.
 */
export class PeerLink {
  readonly localPlayerId: number;
  readonly remotePlayerId: number;
  /** Deterministic, symmetric role: exactly one side of any pair is polite. */
  readonly polite: boolean;

  private readonly pc: PeerConnectionLike;
  private readonly callbacks: PeerLinkCallbacks;
  private readonly iceGatheringTimeoutMs: number;
  private reliableChannel: DataChannelLike | null = null;
  private unreliableChannel: DataChannelLike | null = null;
  private pendingLocalCandidates: RTCIceCandidateInit[] = [];
  private makingOffer = false;
  private ignoreOffer = false;

  constructor(options: PeerLinkOptions) {
    this.localPlayerId = options.localPlayerId;
    this.remotePlayerId = options.remotePlayerId;
    this.polite = options.localPlayerId > options.remotePlayerId;
    this.callbacks = options.callbacks ?? {};
    this.iceGatheringTimeoutMs = options.iceGatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;

    const factory = options.createPeerConnection ?? defaultFactory;
    this.pc = factory(
      { iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS },
      { localPlayerId: this.localPlayerId, remotePlayerId: this.remotePlayerId },
    );
    this.wireConnectionEvents();
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  get isReliableChannelOpen(): boolean {
    return this.reliableChannel?.readyState === 'open';
  }

  /** Initiator side: creates both data channels, makes an offer, and returns it (with gathered candidates) once ICE gathering settles. */
  async createOffer(roomCode: string): Promise<SignalEnvelope> {
    this.attachChannel(this.pc.createDataChannel('reliable', { ordered: true }));
    this.attachChannel(
      this.pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0 }),
    );

    this.makingOffer = true;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
    } finally {
      this.makingOffer = false;
    }

    await this.waitForIceGatheringComplete();
    return this.buildEnvelope('offer', roomCode);
  }

  /**
   * Responder side: applies a remote offer per Perfect Negotiation (rolling
   * back a colliding local offer when polite, or throwing
   * {@link PeerLinkGlareIgnoredError} when impolite) and returns the answer.
   */
  async acceptRemoteOffer(envelope: SignalEnvelope): Promise<SignalEnvelope> {
    const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) {
      throw new PeerLinkGlareIgnoredError(this.remotePlayerId);
    }

    if (offerCollision) {
      await this.pc.setLocalDescription({ type: 'rollback' });
    }
    await this.pc.setRemoteDescription(envelope.description);
    await this.applyRemoteCandidates(envelope.candidates);

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitForIceGatheringComplete();
    return this.buildEnvelope('answer', envelope.roomCode);
  }

  /** Initiator side: applies the remote answer once it comes back. */
  async acceptRemoteAnswer(envelope: SignalEnvelope): Promise<void> {
    await this.pc.setRemoteDescription(envelope.description);
    await this.applyRemoteCandidates(envelope.candidates);
  }

  sendReliable(data: string): void {
    if (this.reliableChannel?.readyState === 'open') {
      this.reliableChannel.send(data);
    }
  }

  sendUnreliable(data: ArrayBufferView): void {
    if (this.unreliableChannel?.readyState === 'open') {
      this.unreliableChannel.send(data);
    }
  }

  close(): void {
    this.reliableChannel?.close();
    this.unreliableChannel?.close();
    this.pc.close();
  }

  private wireConnectionEvents(): void {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.pendingLocalCandidates.push(toCandidateInit(event.candidate));
      }
    };
    this.pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
    };
    this.pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionStateChange?.(this.pc.connectionState);
    };
  }

  private attachChannel(channel: DataChannelLike): void {
    const name: ChannelName = channel.label === 'reliable' ? 'reliable' : 'unreliable';
    if (name === 'reliable') this.reliableChannel = channel;
    else this.unreliableChannel = channel;

    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.callbacks.onChannelOpen?.(name);
    channel.onmessage = (event) => this.callbacks.onMessage?.(name, event.data);
  }

  private async applyRemoteCandidates(candidates: readonly RTCIceCandidateInit[]): Promise<void> {
    for (const candidate of candidates) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (error) {
        if (!this.ignoreOffer) throw error;
      }
    }
  }

  private waitForIceGatheringComplete(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.pc.onicegatheringstatechange = null;
        resolve();
      };
      this.pc.onicegatheringstatechange = () => {
        if (this.pc.iceGatheringState === 'complete') finish();
      };
      setTimeout(finish, this.iceGatheringTimeoutMs);
    });
  }

  private buildEnvelope(kind: 'offer' | 'answer', roomCode: string): SignalEnvelope {
    const description = this.pc.localDescription;
    if (!description) {
      throw new Error('PeerLink: missing local description when building a signal envelope');
    }
    const candidates = this.pendingLocalCandidates;
    this.pendingLocalCandidates = [];
    return {
      version: SIGNAL_VERSION,
      kind,
      roomCode,
      fromPlayerId: this.localPlayerId,
      toPlayerId: this.remotePlayerId,
      description: { type: description.type, sdp: description.sdp },
      candidates,
    };
  }
}
