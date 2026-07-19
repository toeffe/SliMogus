import { describe, expect, it } from 'vitest';
import { resolveCircleVsObstacles, resolveCircleMovement } from './collision';
import { buildPurposeLayout, buildStationObstacles } from './purposeLayout';
import { PROTOTYPE_MAP, STATION_HELIX_MAP, tileIndexAt, worldToTile } from './tilemap';
import { vec2 } from './vector2';

describe('resolveCircleVsObstacles', () => {
  const table = {
    kind: 'aabb' as const,
    minX: 100,
    maxX: 140,
    minY: 100,
    maxY: 120,
  };

  it('blocks walking into an AABB from the west', () => {
    const resolved = resolveCircleVsObstacles(vec2(70, 110), vec2(95, 110), 16, [table]);
    expect(resolved.x).toBeLessThanOrEqual(100 - 16);
    expect(resolved.y).toBe(110);
  });

  it('allows sliding along an AABB face', () => {
    const atFace = resolveCircleVsObstacles(vec2(70, 110), vec2(95, 110), 16, [table]);
    const slid = resolveCircleVsObstacles(atFace, vec2(atFace.x, 130), 16, [table]);
    expect(slid.y).toBeGreaterThan(atFace.y);
  });

  it('blocks a circle obstacle', () => {
    const core = { kind: 'circle' as const, x: 200, y: 200, r: 20 };
    const resolved = resolveCircleVsObstacles(vec2(150, 200), vec2(190, 200), 16, [core]);
    expect(resolved.x).toBeLessThanOrEqual(200 - 20 - 16 + 0.01);
  });
});

describe('Station Omega furniture obstacles', () => {
  it('places cafeteria tables outside the spawn plaza', () => {
    const { props } = buildPurposeLayout(PROTOTYPE_MAP, []);
    const tables = props.filter((p) => p.kind === 'table');
    expect(tables.length).toBeGreaterThanOrEqual(6);
    expect(tables.length).toBeLessThanOrEqual(10);
    const { spawnBounds, tileSize } = PROTOTYPE_MAP;
    for (const table of tables) {
      const px = table.x * tileSize;
      const py = table.z * tileSize;
      const inside =
        px >= spawnBounds.minX &&
        px <= spawnBounds.maxX &&
        py >= spawnBounds.minY &&
        py <= spawnBounds.maxY;
      expect(inside).toBe(false);
      const tx = worldToTile(px, tileSize);
      const ty = worldToTile(py, tileSize);
      expect(tileIndexAt(PROTOTYPE_MAP, tx, ty)).not.toBe('doorFrame');
    }
  });

  it('places a dense ring of storage crates on the perimeter', () => {
    const { props } = buildPurposeLayout(PROTOTYPE_MAP, []);
    const crates = props.filter((p) => p.kind === 'crate');
    expect(crates.length).toBeGreaterThanOrEqual(8);
    expect(crates.length).toBeLessThanOrEqual(16);
  });

  it('places blockers and keeps spawn plaza free of table AABBs', () => {
    const obstacles = buildStationObstacles(PROTOTYPE_MAP, []);
    expect(obstacles.length).toBeGreaterThan(10);
    const { spawnBounds } = PROTOTYPE_MAP;
    const cx = (spawnBounds.minX + spawnBounds.maxX) / 2;
    const cy = (spawnBounds.minY + spawnBounds.maxY) / 2;
    // A point at spawn center should not be deeply inside a furniture AABB.
    const after = resolveCircleVsObstacles(vec2(cx, cy), vec2(cx, cy), 16, obstacles);
    expect(Math.hypot(after.x - cx, after.y - cy)).toBeLessThan(40);
  });

  it('stops movement into a cafeteria table via full resolver', () => {
    const obstacles = buildStationObstacles(PROTOTYPE_MAP, []);
    const tables = obstacles.filter((o) => o.kind === 'aabb');
    expect(tables.length).toBeGreaterThan(0);
    const table = tables[0]!;
    if (table.kind !== 'aabb') throw new Error('expected aabb');
    const from = vec2(table.minX - 40, (table.minY + table.maxY) / 2);
    const toward = vec2(table.minX + 10, from.y);
    const resolved = resolveCircleMovement(from, toward, 16, PROTOTYPE_MAP, obstacles);
    expect(resolved.x).toBeLessThanOrEqual(table.minX - 16 + 0.5);
  });

  it('emits cafeteria tables and storage crates on Station Helix', () => {
    const { props } = buildPurposeLayout(STATION_HELIX_MAP, []);
    expect(props.filter((p) => p.kind === 'table').length).toBeGreaterThanOrEqual(6);
    expect(props.filter((p) => p.kind === 'crate').length).toBeGreaterThanOrEqual(8);
  });
});
