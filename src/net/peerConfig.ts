import type Peer from 'peerjs';

/** PeerJS options: custom STUN/TURN replaces PeerJS default iceServers. */
export const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:92.5.51.80:3478' },
      {
        urls: 'turn:92.5.51.80:3478',
        username: 'tetris',
        credential: "'3IwrF5?%'t3'",
      },
      {
        urls: 'turn:92.5.51.80:3478?transport=tcp',
        username: 'tetris',
        credential: "'3IwrF5?%'t3'",
      },
    ],
  },
} satisfies NonNullable<ConstructorParameters<typeof Peer>[1]>;
