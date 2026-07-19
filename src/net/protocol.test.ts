import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, decodeMessage, encodeMessage, type NetMessage } from './protocol';

describe('protocol encode/decode', () => {
  it('round-trips a lobbyEvent message', () => {
    const message: NetMessage = {
      type: 'lobbyEvent',
      version: PROTOCOL_VERSION,
      event: {
        kind: 'join',
        player: { playerId: 1, name: 'Red', color: 0xff0000, characterId: 'suit' },
      },
    };
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('round-trips peerHello / peerWelcome messages', () => {
    const hello: NetMessage = {
      type: 'peerHello',
      version: PROTOCOL_VERSION,
      peerJsId: 'ABC12',
    };
    const welcome: NetMessage = {
      type: 'peerWelcome',
      version: PROTOCOL_VERSION,
      playerId: 1,
      roster: [
        { playerId: 0, peerJsId: 'ABC12' },
        { playerId: 1, peerJsId: 'guest-xyz' },
      ],
    };
    expect(decodeMessage(encodeMessage(hello))).toEqual(hello);
    expect(decodeMessage(encodeMessage(welcome))).toEqual(welcome);
  });

  it('round-trips a meshInvite message', () => {
    const message: NetMessage = {
      type: 'meshInvite',
      version: PROTOCOL_VERSION,
      targetPlayerId: 7,
      targetPeerJsId: 'PEER7',
    };
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('round-trips ping/pong and stateHash messages', () => {
    const ping: NetMessage = { type: 'ping', version: PROTOCOL_VERSION, seq: 5, sentAt: 1000 };
    const stateHash: NetMessage = {
      type: 'stateHash',
      version: PROTOCOL_VERSION,
      tick: 42,
      hash: 'abc123',
    };
    expect(decodeMessage(encodeMessage(ping))).toEqual(ping);
    expect(decodeMessage(encodeMessage(stateHash))).toEqual(stateHash);
  });

  it('round-trips a lobbyEvent start message carrying the shared seed', () => {
    const message: NetMessage = {
      type: 'lobbyEvent',
      version: PROTOCOL_VERSION,
      event: { kind: 'start', seed: 'shared-seed-123' },
    };
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('round-trips an actionInput message', () => {
    const message: NetMessage = {
      type: 'actionInput',
      version: PROTOCOL_VERSION,
      payload: [2, 10, 1, 0.5, -0.5, 1, 4],
    };
    expect(decodeMessage(encodeMessage(message))).toEqual(message);
  });

  it('round-trips matchReady / matchGo messages', () => {
    const ready: NetMessage = {
      type: 'matchReady',
      version: PROTOCOL_VERSION,
      playerId: 2,
    };
    const go: NetMessage = { type: 'matchGo', version: PROTOCOL_VERSION };
    expect(decodeMessage(encodeMessage(ready))).toEqual(ready);
    expect(decodeMessage(encodeMessage(go))).toEqual(go);
  });

  it('rejects invalid JSON', () => {
    expect(() => decodeMessage('{not json')).toThrow(/not valid JSON/i);
  });

  it('rejects a message missing type/version', () => {
    expect(() => decodeMessage(JSON.stringify({ foo: 'bar' }))).toThrow(/malformed message/i);
  });

  it('rejects an unsupported protocol version', () => {
    const raw = JSON.stringify({ type: 'ping', version: 999, seq: 0, sentAt: 0 });
    expect(() => decodeMessage(raw)).toThrow(/unsupported protocol version/i);
  });
});
