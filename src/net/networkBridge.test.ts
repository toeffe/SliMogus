import { describe, expect, it, vi } from 'vitest';
import { decodeInput, encodeInput, INPUT_VERSION, type PlayerInput } from '@sim/input';
import { TickBuffer } from '@sim/tickBuffer';
import { PROTOCOL_VERSION, type NetMessage } from './protocol';
import { NetworkBridge } from './networkBridge';
import type { PeerMesh, PeerMeshOptions } from './mesh';

function input(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    version: INPUT_VERSION,
    seq: 0,
    playerId: 1,
    moveX: 0,
    moveY: 0,
    buttons: 0,
    targetId: -1,
    lookYaw: 0,
    flashlightOn: 1,
    ...overrides,
  };
}

function createStubMesh() {
  let capturedOptions: Partial<PeerMeshOptions> = {};
  const stub = {
    updateOptions: vi.fn((patch: Partial<PeerMeshOptions>) => {
      capturedOptions = { ...capturedOptions, ...patch };
    }),
    broadcastInput: vi.fn(),
    broadcastReliable: vi.fn(),
    firePeerInput: (fromPlayerId: number, data: ArrayBuffer) =>
      capturedOptions.onPeerInput?.(fromPlayerId, data),
    firePeerMessage: (fromPlayerId: number, message: NetMessage) =>
      capturedOptions.onPeerMessage?.(fromPlayerId, message),
  };
  return stub as unknown as PeerMesh & typeof stub;
}

describe('NetworkBridge construction', () => {
  it('wires onPeerInput/onPeerMessage into the mesh via updateOptions', () => {
    const mesh = createStubMesh();
    new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });
    expect(mesh.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        onPeerInput: expect.any(Function),
        onPeerMessage: expect.any(Function),
      }),
    );
  });
});

describe('NetworkBridge.sendLocalInput', () => {
  it('buffers the wire-form input locally and sends unreliable every frame', () => {
    const mesh = createStubMesh();
    const tickBuffer = new TickBuffer(0);
    const bridge = new NetworkBridge({ mesh, tickBuffer });

    const localInput = input({ playerId: 0, seq: 7, moveX: 0.5 });
    bridge.sendLocalInput(localInput);

    const encoded = encodeInput(localInput);
    expect(tickBuffer.resolve(7)).toEqual([decodeInput(encoded)]);
    expect(mesh.broadcastInput).toHaveBeenCalledTimes(1);
    expect(mesh.broadcastInput).toHaveBeenCalledWith(encoded);
  });

  it('does not reliable-duplicate ordinary movement-only frames', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });

    const localInput = input({ playerId: 0, seq: 7, buttons: 0, moveY: -1 });
    bridge.sendLocalInput(localInput);

    expect(mesh.broadcastReliable).not.toHaveBeenCalled();
  });

  it('reliable-duplicates frames with action buttons', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });

    const localInput = input({ playerId: 0, seq: 7, buttons: 0b1, moveY: -1 });
    bridge.sendLocalInput(localInput);

    expect(mesh.broadcastReliable).toHaveBeenCalledWith({
      type: 'actionInput',
      version: PROTOCOL_VERSION,
      payload: Array.from(encodeInput(localInput)),
    });
  });

  it('sends a sparse reliable backup on movement interval ticks', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });

    const localInput = input({ playerId: 0, seq: 10, buttons: 0, moveY: -1 });
    bridge.sendLocalInput(localInput);

    expect(mesh.broadcastReliable).toHaveBeenCalledWith({
      type: 'actionInput',
      version: PROTOCOL_VERSION,
      payload: Array.from(encodeInput(localInput)),
    });
  });

  it('retransmits unreliable but not reliable while lockstep-holding the same seq', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });

    const localInput = input({ playerId: 0, seq: 10, buttons: 0, moveY: -1 });
    bridge.sendLocalInput(localInput);
    bridge.sendLocalInput(localInput);

    expect(mesh.broadcastInput).toHaveBeenCalledTimes(2);
    expect(mesh.broadcastReliable).toHaveBeenCalledTimes(1);
  });
});

describe('NetworkBridge remote input handling', () => {
  it('decodes an incoming input frame into the shared TickBuffer', () => {
    const mesh = createStubMesh();
    const tickBuffer = new TickBuffer(0);
    new NetworkBridge({ mesh, tickBuffer });

    const remoteInput = input({ playerId: 3, seq: 12, moveY: -1 });
    mesh.firePeerInput(3, encodeInput(remoteInput).buffer as ArrayBuffer);

    expect(tickBuffer.resolve(12)).toEqual([remoteInput]);
  });

  it('drops a frame whose encoded playerId does not match the sender', () => {
    const mesh = createStubMesh();
    const tickBuffer = new TickBuffer(0);
    new NetworkBridge({ mesh, tickBuffer });

    const spoofed = input({ playerId: 3, seq: 1 });
    mesh.firePeerInput(99, encodeInput(spoofed).buffer as ArrayBuffer);

    expect(tickBuffer.hasTick(1)).toBe(false);
  });

  it('drops a malformed/garbage frame without throwing', () => {
    const mesh = createStubMesh();
    const tickBuffer = new TickBuffer(0);
    new NetworkBridge({ mesh, tickBuffer });

    expect(() =>
      mesh.firePeerInput(3, new Float32Array([1, 2]).buffer as ArrayBuffer),
    ).not.toThrow();
    expect(tickBuffer.hasTick(0)).toBe(false);
  });

  it('applies a reliable actionInput duplicate the same way as an unreliable frame', () => {
    const mesh = createStubMesh();
    const tickBuffer = new TickBuffer(0);
    new NetworkBridge({ mesh, tickBuffer });

    const remoteInput = input({ playerId: 3, seq: 12, buttons: 0b1, targetId: 9 });
    mesh.firePeerMessage(3, {
      type: 'actionInput',
      version: PROTOCOL_VERSION,
      payload: Array.from(encodeInput(remoteInput)),
    });

    expect(tickBuffer.resolve(12)).toEqual([remoteInput]);
  });

  it('is idempotent when the same input arrives over both channels', () => {
    const mesh = createStubMesh();
    const tickBuffer = new TickBuffer(0);
    new NetworkBridge({ mesh, tickBuffer });

    const remoteInput = input({ playerId: 3, seq: 12, buttons: 0b1, targetId: 9 });
    mesh.firePeerInput(3, encodeInput(remoteInput).buffer as ArrayBuffer);
    mesh.firePeerMessage(3, {
      type: 'actionInput',
      version: PROTOCOL_VERSION,
      payload: Array.from(encodeInput(remoteInput)),
    });

    expect(tickBuffer.resolve(12)).toEqual([remoteInput]);
  });
});

describe('NetworkBridge.recordLocalTick', () => {
  it('broadcasts a stateHash message only every stateHashIntervalTicks ticks', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({
      mesh,
      tickBuffer: new TickBuffer(0),
      stateHashIntervalTicks: 10,
    });

    for (let tick = 0; tick < 25; tick += 1) {
      bridge.recordLocalTick(tick, `hash-${tick}`);
    }

    expect(mesh.broadcastReliable).toHaveBeenCalledTimes(3); // ticks 0, 10, 20
    expect(mesh.broadcastReliable).toHaveBeenNthCalledWith(1, {
      type: 'stateHash',
      version: PROTOCOL_VERSION,
      tick: 0,
      hash: 'hash-0',
    });
  });
});

describe('NetworkBridge.getLocalHash', () => {
  it('returns a previously recorded hash for a still-in-window tick', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });

    bridge.recordLocalTick(42, 'hash-42');

    expect(bridge.getLocalHash(42)).toBe('hash-42');
  });

  it('returns undefined for a tick that was never recorded', () => {
    const mesh = createStubMesh();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0) });

    expect(bridge.getLocalHash(999)).toBeUndefined();
  });
});

describe('NetworkBridge state hash comparison', () => {
  it('reports a mismatch when the remote hash for a locally-known tick differs', () => {
    const mesh = createStubMesh();
    const onStateHashMismatch = vi.fn();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0), onStateHashMismatch });

    bridge.recordLocalTick(5, 'local-hash');
    mesh.firePeerMessage(2, {
      type: 'stateHash',
      version: PROTOCOL_VERSION,
      tick: 5,
      hash: 'different-hash',
    });

    expect(onStateHashMismatch).toHaveBeenCalledWith({
      fromPlayerId: 2,
      tick: 5,
      localHash: 'local-hash',
      remoteHash: 'different-hash',
    });
  });

  it('does not report a mismatch when hashes agree', () => {
    const mesh = createStubMesh();
    const onStateHashMismatch = vi.fn();
    const bridge = new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0), onStateHashMismatch });

    bridge.recordLocalTick(5, 'same-hash');
    mesh.firePeerMessage(2, {
      type: 'stateHash',
      version: PROTOCOL_VERSION,
      tick: 5,
      hash: 'same-hash',
    });

    expect(onStateHashMismatch).not.toHaveBeenCalled();
  });

  it('does not report a mismatch for a tick with no local record yet', () => {
    const mesh = createStubMesh();
    const onStateHashMismatch = vi.fn();
    new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0), onStateHashMismatch });

    mesh.firePeerMessage(2, {
      type: 'stateHash',
      version: PROTOCOL_VERSION,
      tick: 999,
      hash: 'whatever',
    });

    expect(onStateHashMismatch).not.toHaveBeenCalled();
  });

  it('passes non-stateHash messages through to onMessage', () => {
    const mesh = createStubMesh();
    const onMessage = vi.fn();
    new NetworkBridge({ mesh, tickBuffer: new TickBuffer(0), onMessage });

    const ping: NetMessage = { type: 'ping', version: PROTOCOL_VERSION, seq: 1, sentAt: 0 };
    mesh.firePeerMessage(2, ping);

    expect(onMessage).toHaveBeenCalledWith(2, ping);
  });
});
