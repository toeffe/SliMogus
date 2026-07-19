import type { World } from './world';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Decimal places kept when hashing floats, so imperceptible float noise never causes a false desync. */
const HASH_DECIMAL_PRECISION = 4;

function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function roundForHash(value: number): string {
  return value.toFixed(HASH_DECIMAL_PRECISION);
}

/**
 * Produces a short, deterministic fingerprint of the world at a given tick.
 * Two peers with the same hash for the same tick have (with overwhelming
 * probability) identical simulation state — the basis of desync detection.
 */
export function hashWorldState(world: World, tick: number): string {
  const parts = [`t:${tick}`];
  for (const entity of world.listEntities()) {
    parts.push(
      [
        entity.id,
        roundForHash(entity.position.x),
        roundForHash(entity.position.y),
        roundForHash(entity.velocity.x),
        roundForHash(entity.velocity.y),
        roundForHash(entity.facingYaw),
        entity.flashlightOn ? 1 : 0,
      ].join(':'),
    );
  }
  return fnv1a(parts.join('|'));
}
