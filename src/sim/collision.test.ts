import { describe, expect, it } from 'vitest';
import { resolveCircleVsTilemap } from './collision';
import type { TileKind, TileMap } from './tilemap';
import { vec2 } from './vector2';

const TILE_SIZE = 32;
const RADIUS = 16;

/** A small hand-built map (wall at the given tile columns, floor elsewhere) for precise collision math checks. */
function buildTestMap(wallColumns: readonly number[], width = 8, height = 5): TileMap {
  const tiles: TileKind[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push(wallColumns.includes(x) ? 'wall' : 'floor');
    }
  }
  return {
    id: 'test',
    width,
    height,
    tileSize: TILE_SIZE,
    tiles,
    spawnBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    rooms: [],
  };
}

describe('resolveCircleVsTilemap', () => {
  it('leaves an unobstructed move untouched', () => {
    const map = buildTestMap([]);
    const resolved = resolveCircleVsTilemap(vec2(80, 80), vec2(82, 80), RADIUS, map);
    expect(resolved).toEqual(vec2(82, 80));
  });

  it('clamps X movement right at a wall boundary, one tile ahead', () => {
    // Wall occupies tile column 3, i.e. world x in [96, 128).
    const map = buildTestMap([3]);
    const resolved = resolveCircleVsTilemap(vec2(94, 80), vec2(97, 80), RADIUS, map);
    // The circle's right edge (resolved.x + RADIUS) must land exactly on the wall boundary (96).
    expect(resolved.x).toBeCloseTo(80);
    expect(resolved.x + RADIUS).toBeCloseTo(96);
    expect(resolved.y).toBe(80);
  });

  it('clamps movement in the negative direction symmetrically', () => {
    // Wall occupies tile column 2, i.e. world x in [64, 96).
    const map = buildTestMap([2]);
    const resolved = resolveCircleVsTilemap(vec2(112, 80), vec2(109, 80), RADIUS, map);
    expect(resolved.x - RADIUS).toBeCloseTo(96);
  });

  it('slides along a wall: blocks X but still allows Y to move freely', () => {
    const map = buildTestMap([3]);
    const resolved = resolveCircleVsTilemap(vec2(94, 80), vec2(97, 83), RADIUS, map);
    expect(resolved.x).toBeCloseTo(80);
    expect(resolved.y).toBeCloseTo(83);
  });

  it('is idempotent: resolving an already-resolved position changes nothing further', () => {
    const map = buildTestMap([3]);
    const once = resolveCircleVsTilemap(vec2(94, 80), vec2(97, 80), RADIUS, map);
    const twice = resolveCircleVsTilemap(once, once, RADIUS, map);
    expect(twice).toEqual(once);
  });

  it('treats the map border as solid, containing movement within bounds', () => {
    const map = buildTestMap([]);
    const resolved = resolveCircleVsTilemap(vec2(10, 80), vec2(5, 80), RADIUS, map);
    expect(resolved.x).toBeGreaterThanOrEqual(RADIUS);
  });
});
