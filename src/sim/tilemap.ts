export type TileKind = 'floor' | 'wall' | 'floorAlt' | 'doorFrame';

export interface SpawnBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface MapRoom {
  readonly id: string;
  readonly name: string;
  /** Inclusive tile rectangle. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Minimap tint (RGB). */
  readonly color: number;
}

/** Flat, row-major tile grid plus everything derived from it that spawn/collision logic needs. Immutable and identical across all peers — never part of per-tick state. */
export interface TileMap {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly tiles: readonly TileKind[];
  /** World-space rectangle new players are scattered within at spawn — always a floor area, inset from its room's walls. */
  readonly spawnBounds: SpawnBounds;
  readonly rooms: readonly MapRoom[];
}

/** Inclusive tile-coordinate rectangle, used only while authoring a map's fixed layout. */
interface TileRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function tileIndexAt(map: TileMap, tileX: number, tileY: number): TileKind | undefined {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return undefined;
  return map.tiles[tileY * map.width + tileX];
}

/** Walkable tiles for collision (walls + OOB are solid). */
export function isSolidAtTile(map: TileMap, tileX: number, tileY: number): boolean {
  const tile = tileIndexAt(map, tileX, tileY);
  return tile === undefined || tile === 'wall';
}

/**
 * True if the segment between two world-pixel points does not cross a solid tile.
 * Used for nametag occlusion (and similar view checks) — doorFrame counts as open.
 */
export function hasLineOfSight(
  map: TileMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const ts = map.tileSize;
  let tx0 = worldToTile(x0, ts);
  let ty0 = worldToTile(y0, ts);
  const tx1 = worldToTile(x1, ts);
  const ty1 = worldToTile(y1, ts);

  const dx = Math.abs(tx1 - tx0);
  const dy = Math.abs(ty1 - ty0);
  const sx = tx0 < tx1 ? 1 : -1;
  const sy = ty0 < ty1 ? 1 : -1;
  let err = dx - dy;

  // Skip the starting tile; block if any intermediate/end tile is solid.
  for (;;) {
    if (tx0 === tx1 && ty0 === ty1) return true;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      tx0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      ty0 += sy;
    }
    if (isSolidAtTile(map, tx0, ty0)) return false;
  }
}

export function worldToTile(coord: number, tileSize: number): number {
  return Math.floor(coord / tileSize);
}

/** Room containing a world position, or `undefined` if in a corridor / void. */
export function getRoomAtWorld(map: TileMap, worldX: number, worldY: number): MapRoom | undefined {
  const tx = worldToTile(worldX, map.tileSize);
  const ty = worldToTile(worldY, map.tileSize);
  for (const room of map.rooms) {
    if (tx >= room.x0 && tx <= room.x1 && ty >= room.y0 && ty <= room.y1) return room;
  }
  return undefined;
}

function carve(
  tiles: TileKind[],
  width: number,
  rect: TileRect,
  kind: Exclude<TileKind, 'wall'> = 'floor',
): void {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) {
      tiles[y * width + x] = kind;
    }
  }
}

/** Sparse floorAlt accents (avoid loud checkerboard under PBR sheets). */
function accentFloor(tiles: TileKind[], width: number, rect: TileRect): void {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) {
      if (x % 3 === 0 && y % 3 === 0) tiles[y * width + x] = 'floorAlt';
    }
  }
}

function spawnBoundsFromRect(rect: TileRect, tileSize: number, insetTiles = 1): SpawnBounds {
  return {
    minX: (rect.x0 + insetTiles) * tileSize,
    maxX: (rect.x1 - insetTiles + 1) * tileSize,
    minY: (rect.y0 + insetTiles) * tileSize,
    maxY: (rect.y1 - insetTiles + 1) * tileSize,
  };
}

// Station Omega — asymmetric rooms + dogleg corridors (not a tidy 3×2 grid).
const CAFETERIA: TileRect = { x0: 3, y0: 2, x1: 17, y1: 11 }; // large wide room
/** Walkable spawn plaza — smaller than the full cafeteria so furniture can sit around it. */
const CAFETERIA_SPAWN: TileRect = { x0: 5, y0: 4, x1: 10, y1: 7 };
const MEDBAY: TileRect = { x0: 21, y0: 2, x1: 27, y1: 8 }; // compact
const UPPER_ENGINE: TileRect = { x0: 31, y0: 2, x1: 38, y1: 13 }; // tall / narrow
const ELECTRICAL: TileRect = { x0: 2, y0: 15, x1: 15, y1: 19 }; // long E–W bay
const STORAGE: TileRect = { x0: 17, y0: 14, x1: 26, y1: 22 }; // hub
const REACTOR: TileRect = { x0: 29, y0: 16, x1: 39, y1: 25 }; // large, offset

const CORRIDOR_CAFE_MED: TileRect = { x0: 17, y0: 4, x1: 21, y1: 6 };
const CORRIDOR_MED_ENG: TileRect = { x0: 27, y0: 4, x1: 31, y1: 6 };
const CORRIDOR_CAFE_ELEC: TileRect = { x0: 7, y0: 11, x1: 10, y1: 15 };
const CORRIDOR_ELEC_STOR: TileRect = { x0: 15, y0: 16, x1: 17, y1: 18 };
const CORRIDOR_STOR_REACT: TileRect = { x0: 26, y0: 18, x1: 29, y1: 20 };
const CORRIDOR_ENG_REACT: TileRect = { x0: 33, y0: 13, x1: 36, y1: 16 };
const CORRIDOR_MED_STOR: TileRect = { x0: 23, y0: 8, x1: 25, y1: 14 };

const STATION_ROOMS: readonly MapRoom[] = [
  { id: 'cafeteria', name: 'Cafeteria', ...CAFETERIA, color: 0x6b5a3d },
  { id: 'medbay', name: 'Medbay', ...MEDBAY, color: 0x3d5a52 },
  { id: 'upper-engine', name: 'Upper Engine', ...UPPER_ENGINE, color: 0x6b4a2f },
  { id: 'electrical', name: 'Electrical', ...ELECTRICAL, color: 0x5a5a32 },
  { id: 'storage', name: 'Storage', ...STORAGE, color: 0x4a3d2f },
  { id: 'reactor', name: 'Reactor', ...REACTOR, color: 0x5a2a24 },
];

/**
 * Stamp doorFrame across the full opening at each corridor end
 * (entire end column/row), not a single mid cell and not the whole hall.
 */
function stampCorridorDoorways(tiles: TileKind[], width: number, corridor: TileRect): void {
  const spanX = corridor.x1 - corridor.x0;
  const spanY = corridor.y1 - corridor.y0;
  if (spanX >= spanY) {
    for (let y = corridor.y0; y <= corridor.y1; y += 1) {
      tiles[y * width + corridor.x0] = 'doorFrame';
      tiles[y * width + corridor.x1] = 'doorFrame';
    }
  } else {
    for (let x = corridor.x0; x <= corridor.x1; x += 1) {
      tiles[corridor.y0 * width + x] = 'doorFrame';
      tiles[corridor.y1 * width + x] = 'doorFrame';
    }
  }
}

function buildMapFromRooms(
  id: string,
  rooms: readonly MapRoom[],
  roomRects: readonly TileRect[],
  corridors: readonly TileRect[],
  spawnRect: TileRect,
): TileMap {
  const width = 42;
  const height = 28;
  const tileSize = 32;
  const tiles: TileKind[] = new Array(width * height).fill('wall');

  for (const room of roomRects) {
    carve(tiles, width, room, 'floor');
    accentFloor(tiles, width, room);
  }
  for (const corridor of corridors) {
    carve(tiles, width, corridor, 'floor');
  }
  for (const corridor of corridors) {
    stampCorridorDoorways(tiles, width, corridor);
  }

  return {
    id,
    width,
    height,
    tileSize,
    tiles,
    spawnBounds: spawnBoundsFromRect(spawnRect, tileSize, 0),
    rooms,
  };
}

function buildStationOmegaMap(): TileMap {
  return buildMapFromRooms(
    'omega',
    STATION_ROOMS,
    [CAFETERIA, MEDBAY, UPPER_ENGINE, ELECTRICAL, STORAGE, REACTOR],
    [
      CORRIDOR_CAFE_MED,
      CORRIDOR_MED_ENG,
      CORRIDOR_CAFE_ELEC,
      CORRIDOR_ELEC_STOR,
      CORRIDOR_STOR_REACT,
      CORRIDOR_ENG_REACT,
      CORRIDOR_MED_STOR,
    ],
    CAFETERIA_SPAWN,
  );
}

// Station Helix — looped corridor graph, cafeteria farther south of the NW electrical bay.
const HELIX_ELECTRICAL: TileRect = { x0: 2, y0: 3, x1: 10, y1: 10 };
const HELIX_CAFETERIA: TileRect = { x0: 12, y0: 3, x1: 24, y1: 12 };
const HELIX_CAFETERIA_SPAWN: TileRect = { x0: 15, y0: 5, x1: 19, y1: 8 };
const HELIX_MEDBAY: TileRect = { x0: 26, y0: 2, x1: 34, y1: 8 };
const HELIX_UPPER_ENGINE: TileRect = { x0: 34, y0: 10, x1: 40, y1: 17 };
const HELIX_STORAGE: TileRect = { x0: 14, y0: 14, x1: 26, y1: 22 };
const HELIX_REACTOR: TileRect = { x0: 28, y0: 19, x1: 39, y1: 26 };

const HELIX_CORRIDOR_ELEC_CAFE: TileRect = { x0: 10, y0: 5, x1: 12, y1: 7 };
const HELIX_CORRIDOR_CAFE_MED: TileRect = { x0: 24, y0: 4, x1: 26, y1: 6 };
const HELIX_CORRIDOR_MED_ENG: TileRect = { x0: 34, y0: 8, x1: 36, y1: 10 };
const HELIX_CORRIDOR_CAFE_STOR: TileRect = { x0: 16, y0: 12, x1: 19, y1: 14 };
const HELIX_CORRIDOR_STOR_REACT: TileRect = { x0: 26, y0: 19, x1: 28, y1: 21 };
const HELIX_CORRIDOR_ENG_REACT: TileRect = { x0: 36, y0: 17, x1: 38, y1: 19 };
const HELIX_CORRIDOR_ELEC_STOR_A: TileRect = { x0: 5, y0: 10, x1: 7, y1: 16 };
const HELIX_CORRIDOR_ELEC_STOR_B: TileRect = { x0: 7, y0: 16, x1: 14, y1: 17 };

const HELIX_ROOMS: readonly MapRoom[] = [
  { id: 'cafeteria', name: 'Cafeteria', ...HELIX_CAFETERIA, color: 0x6b5a3d },
  { id: 'medbay', name: 'Medbay', ...HELIX_MEDBAY, color: 0x3d5a52 },
  { id: 'upper-engine', name: 'Upper Engine', ...HELIX_UPPER_ENGINE, color: 0x6b4a2f },
  { id: 'electrical', name: 'Electrical', ...HELIX_ELECTRICAL, color: 0x5a5a32 },
  { id: 'storage', name: 'Storage', ...HELIX_STORAGE, color: 0x4a3d2f },
  { id: 'reactor', name: 'Reactor', ...HELIX_REACTOR, color: 0x5a2a24 },
];

function buildStationHelixMap(): TileMap {
  return buildMapFromRooms(
    'helix',
    HELIX_ROOMS,
    [
      HELIX_ELECTRICAL,
      HELIX_CAFETERIA,
      HELIX_MEDBAY,
      HELIX_UPPER_ENGINE,
      HELIX_STORAGE,
      HELIX_REACTOR,
    ],
    [
      HELIX_CORRIDOR_ELEC_CAFE,
      HELIX_CORRIDOR_CAFE_MED,
      HELIX_CORRIDOR_MED_ENG,
      HELIX_CORRIDOR_CAFE_STOR,
      HELIX_CORRIDOR_STOR_REACT,
      HELIX_CORRIDOR_ENG_REACT,
      HELIX_CORRIDOR_ELEC_STOR_A,
      HELIX_CORRIDOR_ELEC_STOR_B,
    ],
    HELIX_CAFETERIA_SPAWN,
  );
}

/** Primary playable map — Station Omega. */
export const PROTOTYPE_MAP: TileMap = buildStationOmegaMap();

/** Second playable map — Station Helix (looped corridors, shifted footprints). */
export const STATION_HELIX_MAP: TileMap = buildStationHelixMap();

/** @deprecated Alias kept so older references/tests still resolve; same as PROTOTYPE_MAP. */
export const STATION_OMEGA_MAP: TileMap = PROTOTYPE_MAP;

const MAP_REGISTRY: Record<string, TileMap> = {
  omega: PROTOTYPE_MAP,
  helix: STATION_HELIX_MAP,
  // Legacy lobby/settings id still resolves to the same layout.
  skeld: PROTOTYPE_MAP,
};

/** Falls back to Station Omega for an unknown id rather than throwing — every peer must resolve *some* map to stay in the same simulation. */
export function getTileMapById(mapId: string): TileMap {
  return MAP_REGISTRY[mapId] ?? PROTOTYPE_MAP;
}
