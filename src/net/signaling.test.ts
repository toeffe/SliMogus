import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import {
  decodeSignalBlob,
  encodeSignalBlob,
  SIGNAL_VERSION,
  type SignalEnvelope,
} from './signaling';

function sampleEnvelope(overrides: Partial<SignalEnvelope> = {}): SignalEnvelope {
  return {
    version: SIGNAL_VERSION,
    kind: 'offer',
    roomCode: 'ABC234',
    fromPlayerId: 0,
    toPlayerId: 1,
    description: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' },
    candidates: [
      { candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 12345 typ host', sdpMid: '0' },
    ],
    ...overrides,
  };
}

describe('signal blob encode/decode', () => {
  it('round-trips an offer envelope', () => {
    const envelope = sampleEnvelope();
    const blob = encodeSignalBlob(envelope);
    expect(typeof blob).toBe('string');
    expect(decodeSignalBlob(blob)).toEqual(envelope);
  });

  it('round-trips an answer envelope with multiple candidates', () => {
    const envelope = sampleEnvelope({
      kind: 'answer',
      fromPlayerId: 2,
      candidates: [
        { candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 12345 typ host', sdpMid: '0' },
        { candidate: 'candidate:2 1 UDP 1694498815 203.0.113.1 23456 typ srflx', sdpMid: '0' },
      ],
    });
    expect(decodeSignalBlob(encodeSignalBlob(envelope))).toEqual(envelope);
  });

  it('produces a compressed blob meaningfully shorter than the raw JSON for larger payloads', () => {
    const envelope = sampleEnvelope({
      candidates: Array.from({ length: 20 }, (_, i) => ({
        candidate: `candidate:${i} 1 UDP 2130706431 10.0.0.${i} ${10000 + i} typ host`,
        sdpMid: '0',
      })),
    });
    const raw = JSON.stringify(envelope);
    const blob = encodeSignalBlob(envelope);
    expect(blob.length).toBeLessThan(raw.length);
  });

  it('rejects empty input', () => {
    expect(() => decodeSignalBlob('   ')).toThrow(/empty/i);
  });

  it('rejects garbage/corrupted input', () => {
    expect(() => decodeSignalBlob('not-a-real-blob-###')).toThrow(/corrupted or incomplete/i);
  });

  it('rejects a blob that decompresses to non-JSON', () => {
    const bogus = LZString.compressToEncodedURIComponent('not json at all');
    expect(() => decodeSignalBlob(bogus)).toThrow(/not valid JSON/i);
  });

  it('rejects an unsupported signal version', () => {
    const blob = encodeSignalBlob(sampleEnvelope({ version: 99 }));
    expect(() => decodeSignalBlob(blob)).toThrow(/unsupported signal version/i);
  });
});
