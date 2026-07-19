import { describe, expect, it, vi } from 'vitest';
import { PeerLink, PeerLinkGlareIgnoredError } from './peerConnection';
import { FakePeerConnection } from './testUtils/fakePeerConnection';

function makeLinks() {
  const pcHost = new FakePeerConnection();
  const pcJoiner = new FakePeerConnection();
  const host = new PeerLink({
    localPlayerId: 0,
    remotePlayerId: 1,
    createPeerConnection: () => pcHost,
  });
  const joiner = new PeerLink({
    localPlayerId: 1,
    remotePlayerId: 0,
    createPeerConnection: () => pcJoiner,
  });
  return { pcHost, pcJoiner, host, joiner };
}

describe('PeerLink politeness', () => {
  it('assigns exactly one polite side per pair, based on player id', () => {
    const { host, joiner } = makeLinks();
    expect(host.polite).toBe(false); // localPlayerId 0 < remotePlayerId 1
    expect(joiner.polite).toBe(true); // localPlayerId 1 > remotePlayerId 0
  });
});

describe('PeerLink offer/answer handshake', () => {
  it('completes a full offer -> answer exchange and reaches stable signaling state on both sides', async () => {
    const { pcHost, pcJoiner, host, joiner } = makeLinks();

    const offerEnvelope = await host.createOffer('ABC234');
    expect(offerEnvelope.kind).toBe('offer');
    expect(offerEnvelope.candidates.length).toBeGreaterThan(0);
    expect(pcHost.signalingState).toBe('have-local-offer');

    const answerEnvelope = await joiner.acceptRemoteOffer(offerEnvelope);
    expect(answerEnvelope.kind).toBe('answer');
    expect(pcJoiner.signalingState).toBe('stable');
    expect(pcJoiner.addedCandidates).toHaveLength(offerEnvelope.candidates.length);

    await host.acceptRemoteAnswer(answerEnvelope);
    expect(pcHost.signalingState).toBe('stable');
    expect(pcHost.addedCandidates).toHaveLength(answerEnvelope.candidates.length);
  });

  it('delivers messages once channels are wired and opened', async () => {
    const { pcHost, pcJoiner, host, joiner } = makeLinks();
    const onHostMessage = vi.fn();
    const onJoinerMessage = vi.fn();

    const hostWithCallbacks = new PeerLink({
      localPlayerId: 0,
      remotePlayerId: 1,
      createPeerConnection: () => pcHost,
      callbacks: { onMessage: onHostMessage },
    });
    const joinerWithCallbacks = new PeerLink({
      localPlayerId: 1,
      remotePlayerId: 0,
      createPeerConnection: () => pcJoiner,
      callbacks: { onMessage: onJoinerMessage },
    });

    const offerEnvelope = await hostWithCallbacks.createOffer('ABC234');
    // Simulate the joiner's browser receiving the two channels the host created.
    for (const channel of pcHost.dataChannels) {
      pcJoiner.simulateIncomingDataChannel(channel);
    }
    const answerEnvelope = await joinerWithCallbacks.acceptRemoteOffer(offerEnvelope);
    void answerEnvelope;

    const [reliable] = pcHost.dataChannels;
    reliable?.simulateOpen();
    reliable?.simulateMessage('hello');

    expect(onHostMessage).not.toHaveBeenCalled(); // host owns the sending side's channel object, not a separate mock
    expect(onJoinerMessage).toHaveBeenCalledWith('reliable', 'hello');
    void host;
    void joiner;
  });
});

describe('PeerLink glare (Perfect Negotiation)', () => {
  it('the impolite side ignores a colliding incoming offer and throws PeerLinkGlareIgnoredError', async () => {
    const pcHostImpolite = new FakePeerConnection();
    // host (id 0) vs remote (id 1) -> polite = 0 > 1 = false => impolite
    const impolite = new PeerLink({
      localPlayerId: 0,
      remotePlayerId: 1,
      createPeerConnection: () => pcHostImpolite,
    });

    await impolite.createOffer('ABC234'); // now has a local offer pending (have-local-offer)

    const collidingOffer = {
      version: 1,
      kind: 'offer' as const,
      roomCode: 'ABC234',
      fromPlayerId: 1,
      toPlayerId: 0,
      description: { type: 'offer' as const, sdp: 'remote-offer-sdp' },
      candidates: [],
    };

    await expect(impolite.acceptRemoteOffer(collidingOffer)).rejects.toBeInstanceOf(
      PeerLinkGlareIgnoredError,
    );
    // Local offer must be left untouched — glare must not be silently applied.
    expect(pcHostImpolite.signalingState).toBe('have-local-offer');
    expect(pcHostImpolite.remoteDescription).toBeNull();
  });

  it('the polite side rolls back its own offer and accepts the incoming one', async () => {
    const pcJoinerPolite = new FakePeerConnection();
    // joiner (id 1) vs remote (id 0) -> polite = 1 > 0 = true => polite
    const polite = new PeerLink({
      localPlayerId: 1,
      remotePlayerId: 0,
      createPeerConnection: () => pcJoinerPolite,
    });

    await polite.createOffer('ABC234'); // now has a local offer pending

    const collidingOffer = {
      version: 1,
      kind: 'offer' as const,
      roomCode: 'ABC234',
      fromPlayerId: 0,
      toPlayerId: 1,
      description: { type: 'offer' as const, sdp: 'remote-offer-sdp' },
      candidates: [],
    };

    const answer = await polite.acceptRemoteOffer(collidingOffer);
    expect(answer.kind).toBe('answer');
    expect(pcJoinerPolite.remoteDescription).toEqual(collidingOffer.description);
    expect(pcJoinerPolite.signalingState).toBe('stable');
  });
});
