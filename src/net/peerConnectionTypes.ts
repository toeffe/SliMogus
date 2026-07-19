/**
 * Narrow structural contracts covering only the `RTCPeerConnection`/
 * `RTCDataChannel` members `PeerLink` actually uses. Real browser instances
 * satisfy these structurally with no cast needed; tests inject a small fake
 * that implements exactly this surface instead of the full DOM API.
 */
export interface DataChannelLike {
  readonly label: string;
  readyState: RTCDataChannelState;
  /** Forced to `'arraybuffer'` on attach — the spec defaults to `'blob'`, which would break the binary `PlayerInput` frames sent over the unreliable channel. */
  binaryType: BinaryType;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string | ArrayBufferView): void;
  close(): void;
}

export interface PeerConnectionLike {
  signalingState: RTCSignalingState;
  iceGatheringState: RTCIceGatheringState;
  connectionState: RTCPeerConnectionState;
  localDescription: RTCSessionDescriptionInit | null;
  remoteDescription: RTCSessionDescriptionInit | null;
  onicecandidate:
    ((event: { candidate: RTCIceCandidate | RTCIceCandidateInit | null }) => void) | null;
  onicegatheringstatechange: (() => void) | null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  createDataChannel(label: string, options?: RTCDataChannelInit): DataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description?: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export interface PeerConnectionFactoryContext {
  localPlayerId: number;
  remotePlayerId: number;
}

export type PeerConnectionFactory = (
  config: RTCConfiguration,
  context: PeerConnectionFactoryContext,
) => PeerConnectionLike;
