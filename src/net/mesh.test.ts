import { afterEach, describe, expect, it } from 'vitest';
import type Peer from 'peerjs';
import { PROTOCOL_VERSION, type NetMessage } from './protocol';
import { PeerMesh } from './mesh';
import { PEER_CONFIG } from './peerConfig';
import { createFakePeerFactory, resetFakePeerBroker } from './testUtils/fakePeerJs';

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PeerMesh PeerJS bootstrap', () => {
  afterEach(() => {
    resetFakePeerBroker();
  });

  it('passes default STUN and TURN iceServers to createPeer', async () => {
    const createPeer = createFakePeerFactory();
    const captured: Array<{
      id?: string;
      options?: ConstructorParameters<typeof Peer>[1];
    }> = [];

    const wrappingCreatePeer: typeof createPeer = (id, options) => {
      captured.push({ id, options });
      return createPeer(id, options);
    };

    const host = await PeerMesh.createAsHost({ createPeer: wrappingCreatePeer });
    expect(captured.length).toBeGreaterThanOrEqual(1);
    expect(captured[0]?.options).toEqual(PEER_CONFIG);

    const iceUrls = PEER_CONFIG.config.iceServers.map((s) =>
      Array.isArray(s.urls) ? s.urls[0] : s.urls,
    );
    expect(iceUrls).toEqual([
      'stun:92.5.51.80:3478',
      'turn:92.5.51.80:3478',
      'turn:92.5.51.80:3478?transport=tcp',
    ]);

    host.close();
  });

  it('connects a host and a single joiner via room code', async () => {
    const createPeer = createFakePeerFactory();
    const hostMessages: Array<{ from: number; message: NetMessage }> = [];
    const joinerMessages: Array<{ from: number; message: NetMessage }> = [];

    const host = await PeerMesh.createAsHost({
      createPeer,
      onPeerMessage: (from, message) => hostMessages.push({ from, message }),
    });

    const joiner = await PeerMesh.joinByCode(host.roomCode, {
      createPeer,
      onPeerMessage: (from, message) => joinerMessages.push({ from, message }),
    });
    await flushAsync();

    expect(joiner.localPlayerId).toBe(1);
    expect(joiner.isHost).toBe(false);
    expect(host.connectedPlayerIds).toEqual([1]);
    expect(joiner.connectedPlayerIds).toEqual([0]);

    const ping: NetMessage = { type: 'ping', version: PROTOCOL_VERSION, seq: 1, sentAt: 123 };
    host.sendReliable(1, ping);
    await flushAsync();
    expect(joinerMessages).toEqual([{ from: 0, message: ping }]);

    const pong: NetMessage = { type: 'pong', version: PROTOCOL_VERSION, seq: 1, sentAt: 456 };
    joiner.sendReliable(0, pong);
    await flushAsync();
    expect(hostMessages).toEqual([{ from: 1, message: pong }]);

    host.close();
    joiner.close();
  });

  it('grows a full mesh between two joiners', async () => {
    const createPeer = createFakePeerFactory();
    const host = await PeerMesh.createAsHost({ createPeer });
    const joinerA = await PeerMesh.joinByCode(host.roomCode, { createPeer });
    await flushAsync();
    const joinerB = await PeerMesh.joinByCode(host.roomCode, { createPeer });
    await flushAsync();
    await flushAsync();

    expect(joinerA.localPlayerId).toBe(1);
    expect(joinerB.localPlayerId).toBe(2);
    expect(host.connectedPlayerIds.sort()).toEqual([1, 2]);
    expect(joinerA.connectedPlayerIds.sort()).toEqual([0, 2]);
    expect(joinerB.connectedPlayerIds.sort()).toEqual([0, 1]);

    const messages: NetMessage[] = [];
    joinerB.updateOptions({
      onPeerMessage: (_from, message) => messages.push(message),
    });
    const ping: NetMessage = { type: 'ping', version: PROTOCOL_VERSION, seq: 9, sentAt: 1 };
    joinerA.sendReliable(2, ping);
    await flushAsync();
    expect(messages).toEqual([ping]);

    host.close();
    joinerA.close();
    joinerB.close();
  });
});
