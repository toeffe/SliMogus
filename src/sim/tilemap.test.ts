import { describe, expect, it } from 'vitest';
import {
  getRoomAtWorld,
  getTileMapById,
  hasLineOfSight,
  isSolidAtTile,
  PROTOTYPE_MAP,
  STATION_HELIX_MAP,
  tileIndexAt,
  worldToTile,
} from './tilemap';

describe('worldToTile', () => {
  it('floors world coordinates into tile indices', () => {
    expect(worldToTile(0, 32)).toBe(0);
    expect(worldToTile(31, 32)).toBe(0);
    expect(worldToTile(32, 32)).toBe(1);
    expect(worldToTile(-1, 32)).toBe(-1);
  });
});

describe('tileIndexAt / isSolidAtTile', () => {
  it('returns undefined and solid=true for out-of-bounds coordinates', () => {
    expect(tileIndexAt(PROTOTYPE_MAP, -1, 0)).toBeUndefined();
    expect(tileIndexAt(PROTOTYPE_MAP, PROTOTYPE_MAP.width, 0)).toBeUndefined();
    expect(isSolidAtTile(PROTOTYPE_MAP, -1, 0)).toBe(true);
  });

  it('reports the border as solid and cafeteria interior as walkable', () => {
    expect(isSolidAtTile(PROTOTYPE_MAP, 0, 0)).toBe(true);
    expect(isSolidAtTile(PROTOTYPE_MAP, 8, 6)).toBe(false);
  });

  it('connects cafeteria to medbay through a corridor', () => {
    expect(isSolidAtTile(PROTOTYPE_MAP, 19, 5)).toBe(false);
  });

  it('stamps doorFrame across corridor-end openings, not the whole hall', () => {
    // Cafe↔Med horizontal corridor ends at x=17 and x=21.
    expect(tileIndexAt(PROTOTYPE_MAP, 17, 4)).toBe('doorFrame');
    expect(tileIndexAt(PROTOTYPE_MAP, 17, 5)).toBe('doorFrame');
    expect(tileIndexAt(PROTOTYPE_MAP, 17, 6)).toBe('doorFrame');
    expect(tileIndexAt(PROTOTYPE_MAP, 21, 5)).toBe('doorFrame');
    expect(tileIndexAt(PROTOTYPE_MAP, 19, 5)).toBe('floor');
  });

  it('keeps asymmetric rooms distinct (compact medbay vs tall engine)', () => {
    expect(isSolidAtTile(PROTOTYPE_MAP, 24, 5)).toBe(false); // medbay
    expect(isSolidAtTile(PROTOTYPE_MAP, 24, 1)).toBe(true); // above compact medbay
    expect(isSolidAtTile(PROTOTYPE_MAP, 34, 12)).toBe(false); // engine tall
    expect(isSolidAtTile(PROTOTYPE_MAP, 8, 17)).toBe(false); // electrical bay
    expect(isSolidAtTile(PROTOTYPE_MAP, 20, 5)).toBe(false); // cafe–med corridor
  });
});

describe('PROTOTYPE_MAP.spawnBounds', () => {
  it('is inset from cafeteria walls', () => {
    const { spawnBounds, tileSize } = PROTOTYPE_MAP;
    expect(spawnBounds.minX).toBeGreaterThan(3 * tileSize);
    expect(spawnBounds.maxX).toBeLessThan((17 + 1) * tileSize);
  });

  it('is entirely floor, not overlapping any wall tile', () => {
    const { spawnBounds, tileSize } = PROTOTYPE_MAP;
    for (let x = spawnBounds.minX; x < spawnBounds.maxX; x += tileSize) {
      for (let y = spawnBounds.minY; y < spawnBounds.maxY; y += tileSize) {
        expect(
          isSolidAtTile(PROTOTYPE_MAP, worldToTile(x, tileSize), worldToTile(y, tileSize)),
        ).toBe(false);
      }
    }
  });
});

describe('getRoomAtWorld', () => {
  it('names the cafeteria spawn area', () => {
    expect(getRoomAtWorld(PROTOTYPE_MAP, 320, 192)?.name).toBe('Cafeteria');
  });
});

describe('hasLineOfSight', () => {
  const ts = PROTOTYPE_MAP.tileSize;

  it('is clear within an open room', () => {
    expect(hasLineOfSight(PROTOTYPE_MAP, 8.5 * ts, 6.5 * ts, 10.5 * ts, 8.5 * ts)).toBe(true);
  });

  it('is blocked by a wall between rooms', () => {
    expect(hasLineOfSight(PROTOTYPE_MAP, 8.5 * ts, 6.5 * ts, 8.5 * ts, 0.5 * ts)).toBe(false);
  });

  it('is clear through a doorFrame corridor opening', () => {
    expect(hasLineOfSight(PROTOTYPE_MAP, 16.5 * ts, 5.5 * ts, 21.5 * ts, 5.5 * ts)).toBe(true);
  });
});

describe('getTileMapById', () => {
  it('resolves Station Omega by id', () => {
    expect(getTileMapById('omega')).toBe(PROTOTYPE_MAP);
  });

  it('resolves Station Helix by id', () => {
    expect(getTileMapById('helix')).toBe(STATION_HELIX_MAP);
    expect(STATION_HELIX_MAP.id).toBe('helix');
  });

  it('falls back to Station Omega for an unknown id', () => {
    expect(getTileMapById('does-not-exist')).toBe(PROTOTYPE_MAP);
  });

  it('still resolves legacy skeld id to the same map', () => {
    expect(getTileMapById('skeld')).toBe(PROTOTYPE_MAP);
  });
});

describe('map POI tiles', () => {
  function assertWalkableWallMount(map: typeof PROTOTYPE_MAP, px: number, py: number): void {
    const tx = worldToTile(px, map.tileSize);
    const ty = worldToTile(py, map.tileSize);
    expect(isSolidAtTile(map, tx, ty)).toBe(false);
    const hasWall =
      isSolidAtTile(map, tx, ty - 1) ||
      isSolidAtTile(map, tx, ty + 1) ||
      isSolidAtTile(map, tx - 1, ty) ||
      isSolidAtTile(map, tx + 1, ty);
    expect(hasWall).toBe(true);
  }

  it('keeps Omega tasks and sabotage panels on walkable wall tiles', async () => {
    const { getMapPois } = await import('@game/mapPois');
    const pois = getMapPois('omega');
    for (const station of pois.taskStations) {
      assertWalkableWallMount(PROTOTYPE_MAP, station.position.x, station.position.y);
    }
    assertWalkableWallMount(
      PROTOTYPE_MAP,
      pois.lightsPanel.position.x,
      pois.lightsPanel.position.y,
    );
    assertWalkableWallMount(
      PROTOTYPE_MAP,
      pois.reactorPanelA.position.x,
      pois.reactorPanelA.position.y,
    );
    assertWalkableWallMount(
      PROTOTYPE_MAP,
      pois.reactorPanelB.position.x,
      pois.reactorPanelB.position.y,
    );
  });

  it('keeps Helix tasks and sabotage panels on walkable wall tiles', async () => {
    const { getMapPois } = await import('@game/mapPois');
    const pois = getMapPois('helix');
    for (const station of pois.taskStations) {
      assertWalkableWallMount(STATION_HELIX_MAP, station.position.x, station.position.y);
    }
    assertWalkableWallMount(
      STATION_HELIX_MAP,
      pois.lightsPanel.position.x,
      pois.lightsPanel.position.y,
    );
    assertWalkableWallMount(
      STATION_HELIX_MAP,
      pois.reactorPanelA.position.x,
      pois.reactorPanelA.position.y,
    );
    assertWalkableWallMount(
      STATION_HELIX_MAP,
      pois.reactorPanelB.position.x,
      pois.reactorPanelB.position.y,
    );
  });

  it('keeps vents on walkable tiles for both maps', async () => {
    const { getMapPois } = await import('@game/mapPois');
    for (const [mapId, map] of [
      ['omega', PROTOTYPE_MAP],
      ['helix', STATION_HELIX_MAP],
    ] as const) {
      for (const vent of getMapPois(mapId).vents) {
        const tx = worldToTile(vent.position.x, map.tileSize);
        const ty = worldToTile(vent.position.y, map.tileSize);
        expect(isSolidAtTile(map, tx, ty)).toBe(false);
      }
    }
  });
});
