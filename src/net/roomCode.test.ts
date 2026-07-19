import { describe, expect, it } from 'vitest';
import { Random } from '@sim/random';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode';

describe('generateRoomCode', () => {
  it('produces a 5-character code from the unambiguous alphabet', () => {
    const code = generateRoomCode(new Random('room-seed'));
    expect(code).toHaveLength(5);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });

  it('is deterministic for a given Random instance seed', () => {
    expect(generateRoomCode(new Random('same-seed'))).toBe(
      generateRoomCode(new Random('same-seed')),
    );
  });

  it('round-trips through isValidRoomCode', () => {
    const code = generateRoomCode(new Random('valid-seed'));
    expect(isValidRoomCode(code)).toBe(true);
    expect(isValidRoomCode(code.toLowerCase())).toBe(true);
  });
});

describe('isValidRoomCode', () => {
  it('rejects the wrong length', () => {
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDEF')).toBe(false);
  });

  it('rejects ambiguous characters not in the alphabet', () => {
    expect(isValidRoomCode('ABCD0')).toBe(false);
    expect(isValidRoomCode('ABC1I')).toBe(false);
  });

  it('normalizes whitespace and case', () => {
    expect(normalizeRoomCode(' ab12c ')).toBe('AB12C');
  });
});
