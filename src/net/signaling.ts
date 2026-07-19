import LZString from 'lz-string';

export const SIGNAL_VERSION = 1;

/**
 * A complete, non-trickle signaling envelope: one SDP description plus every
 * ICE candidate gathered before the blob was generated. Manual copy/paste
 * signaling can't practically trickle candidates one at a time, so callers
 * wait for ICE gathering to finish before building this envelope.
 */
export interface SignalEnvelope {
  version: number;
  kind: 'offer' | 'answer';
  roomCode: string;
  fromPlayerId: number;
  /** The player this envelope is addressed to — lets the recipient learn its own assigned id from a host invite, and lets relays route without extra bookkeeping. */
  toPlayerId: number;
  description: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
}

export function encodeSignalBlob(envelope: SignalEnvelope): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(envelope));
}

export function decodeSignalBlob(blob: string): SignalEnvelope {
  const trimmed = blob.trim();
  if (!trimmed) {
    throw new Error('decodeSignalBlob: pasted text is empty');
  }

  const json = LZString.decompressFromEncodedURIComponent(trimmed);
  if (json === null || json === '') {
    throw new Error('decodeSignalBlob: pasted text looks corrupted or incomplete');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('decodeSignalBlob: decompressed data is not valid JSON');
  }

  if (!isSignalEnvelopeShape(parsed)) {
    throw new Error('decodeSignalBlob: malformed signal envelope');
  }
  if (parsed.version !== SIGNAL_VERSION) {
    throw new Error(`decodeSignalBlob: unsupported signal version ${parsed.version}`);
  }
  return parsed;
}

function isSignalEnvelopeShape(value: unknown): value is SignalEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === 'number' &&
    (record.kind === 'offer' || record.kind === 'answer') &&
    typeof record.roomCode === 'string' &&
    typeof record.fromPlayerId === 'number' &&
    typeof record.toPlayerId === 'number' &&
    typeof record.description === 'object' &&
    record.description !== null &&
    Array.isArray(record.candidates)
  );
}
