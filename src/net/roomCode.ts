import type { Random } from '@sim/random';

const ROOM_CODE_LENGTH = 5;
/** Unambiguous alphabet: no 0/O, 1/I/L confusion when read aloud or handwritten. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Short human-friendly room code. With PeerJS this is also the host's peer
 * id — joiners type it and `peer.connect(code)` (same model as tetris_game).
 */
export function generateRoomCode(random: Random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = random.nextInt(0, ROOM_CODE_ALPHABET.length - 1);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

export function normalizeRoomCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  const upper = normalizeRoomCode(code);
  if (upper.length !== ROOM_CODE_LENGTH) return false;
  return [...upper].every((char) => ROOM_CODE_ALPHABET.includes(char));
}

export { ROOM_CODE_LENGTH };
