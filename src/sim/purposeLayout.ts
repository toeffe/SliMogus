import { isSolidAtTile, tileIndexAt, type MapRoom, type TileMap } from './tilemap';

/** Axis-aligned blocker in sim pixel space (same as entity positions). */
export interface AabbObstacle {
  readonly kind: 'aabb';
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Circular blocker in sim pixel space. */
export interface CircleObstacle {
  readonly kind: 'circle';
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export type StationObstacle = AabbObstacle | CircleObstacle;

/** World-unit (1 = 1 tile) pose used by the 3D kitbash. */
export interface PurposeProp {
  readonly kind:
    | 'table'
    | 'bench'
    | 'counter'
    | 'biobed'
    | 'turbine'
    | 'breaker'
    | 'crate'
    | 'pallet'
    | 'reactorCore'
    | 'reactorPillar'
    | 'exhaust';
  readonly x: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly ry?: number;
  /** Extra crate stack height / jitter seed. */
  readonly seed?: number;
}

export interface PurposeLayout {
  readonly props: readonly PurposeProp[];
  readonly obstacles: readonly StationObstacle[];
}

type RoomRole =
  'corridor' | 'cafeteria' | 'medbay' | 'upper-engine' | 'electrical' | 'storage' | 'reactor';

const DETAIL_SEED = 0x5a71011;
const POI_CLEAR_R2 = 0.85 * 0.85;

function detailHash(tx: number, ty: number, salt: number): number {
  let h = (DETAIL_SEED ^ (tx * 73856093) ^ (ty * 19349663) ^ (salt * 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) % 1000;
}

function chance(tx: number, ty: number, salt: number, threshold: number): boolean {
  return detailHash(tx, ty, salt) < threshold;
}

function roleOf(room: MapRoom): RoomRole {
  if (room.id === 'cafeteria') return 'cafeteria';
  if (room.id === 'medbay') return 'medbay';
  if (room.id === 'upper-engine') return 'upper-engine';
  if (room.id === 'electrical') return 'electrical';
  if (room.id === 'storage') return 'storage';
  if (room.id === 'reactor') return 'reactor';
  return 'corridor';
}

function isWalkable(tileMap: TileMap, tx: number, ty: number): boolean {
  const t = tileIndexAt(tileMap, tx, ty);
  return t === 'floor' || t === 'floorAlt' || t === 'doorFrame';
}

function nearClear(x: number, z: number, clear: readonly { x: number; z: number }[]): boolean {
  for (const p of clear) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < POI_CLEAR_R2) return true;
  }
  return false;
}

function tileOk(
  tileMap: TileMap,
  tx: number,
  ty: number,
  clear: readonly { x: number; z: number }[],
): boolean {
  if (!isWalkable(tileMap, tx, ty)) return false;
  if (tileIndexAt(tileMap, tx, ty) === 'doorFrame') return false;
  const x = tx + 0.5;
  const z = ty + 0.5;
  return !nearClear(x, z, clear);
}

/** True when a furniture footprint would choke a doorway (doorFrame within `radius` tiles). */
function nearDoorway(tileMap: TileMap, tx: number, ty: number, radius = 1): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (tileIndexAt(tileMap, tx + dx, ty + dy) === 'doorFrame') return true;
    }
  }
  return false;
}

/** Inclusive spawn plaza in tile coords (from world spawnBounds). */
function spawnTileRect(tileMap: TileMap): { x0: number; y0: number; x1: number; y1: number } {
  const ts = tileMap.tileSize;
  return {
    x0: Math.floor(tileMap.spawnBounds.minX / ts),
    y0: Math.floor(tileMap.spawnBounds.minY / ts),
    x1: Math.ceil(tileMap.spawnBounds.maxX / ts) - 1,
    y1: Math.ceil(tileMap.spawnBounds.maxY / ts) - 1,
  };
}

function overlapsSpawn(
  tileMap: TileMap,
  x: number,
  z: number,
  halfW: number,
  halfD: number,
): boolean {
  const { spawnBounds, tileSize } = tileMap;
  const minX = (x - halfW) * tileSize;
  const maxX = (x + halfW) * tileSize;
  const minY = (z - halfD) * tileSize;
  const maxY = (z + halfD) * tileSize;
  return !(
    maxX < spawnBounds.minX ||
    minX > spawnBounds.maxX ||
    maxY < spawnBounds.minY ||
    minY > spawnBounds.maxY
  );
}

function pushAabb(
  obstacles: StationObstacle[],
  tileSize: number,
  x: number,
  z: number,
  halfW: number,
  halfD: number,
): void {
  obstacles.push({
    kind: 'aabb',
    minX: (x - halfW) * tileSize,
    maxX: (x + halfW) * tileSize,
    minY: (z - halfD) * tileSize,
    maxY: (z + halfD) * tileSize,
  });
}

function pushCircle(
  obstacles: StationObstacle[],
  tileSize: number,
  x: number,
  z: number,
  rTiles: number,
): void {
  obstacles.push({
    kind: 'circle',
    x: x * tileSize,
    y: z * tileSize,
    r: rTiles * tileSize,
  });
}

/**
 * Deterministic room furniture + collision volumes shared by sim and view.
 * `clearWorld` are walkable tile centers (x,z in tile units) to keep clear (POIs / vents).
 */
export function buildPurposeLayout(
  tileMap: TileMap,
  clearWorld: readonly { x: number; z: number }[] = [],
): PurposeLayout {
  const props: PurposeProp[] = [];
  const obstacles: StationObstacle[] = [];
  const ts = tileMap.tileSize;

  // Doorway tiles are always clear of furniture.
  const clear = [...clearWorld];
  for (let ty = 0; ty < tileMap.height; ty += 1) {
    for (let tx = 0; tx < tileMap.width; tx += 1) {
      if (tileIndexAt(tileMap, tx, ty) === 'doorFrame') {
        clear.push({ x: tx + 0.5, z: ty + 0.5 });
      }
    }
  }

  for (const room of tileMap.rooms) {
    const role = roleOf(room);
    const cx = (room.x0 + room.x1 + 1) / 2;
    const cz = (room.y0 + room.y1 + 1) / 2;

    if (role === 'cafeteria') {
      // Ring of tables around the spawn plaza (N/E/S/W), not a sparse lattice.
      const spawn = spawnTileRect(tileMap);
      const ring: Array<{ tx: number; ty: number }> = [];
      for (let tx = spawn.x0; tx <= spawn.x1; tx += 2) {
        ring.push({ tx, ty: spawn.y0 - 2 });
        ring.push({ tx, ty: spawn.y1 + 2 });
      }
      for (let ty = spawn.y0; ty <= spawn.y1; ty += 2) {
        ring.push({ tx: spawn.x0 - 2, ty });
        ring.push({ tx: spawn.x1 + 2, ty });
      }
      // Extra seats toward open room corners when the plaza sits off-center.
      ring.push(
        { tx: room.x0 + 3, ty: room.y0 + 2 },
        { tx: room.x1 - 3, ty: room.y0 + 2 },
        { tx: room.x0 + 3, ty: room.y1 - 2 },
        { tx: room.x1 - 3, ty: room.y1 - 2 },
      );
      const placed = new Set<string>();
      for (const { tx, ty } of ring) {
        const key = `${tx},${ty}`;
        if (placed.has(key)) continue;
        if (tx < room.x0 + 1 || tx > room.x1 - 1 || ty < room.y0 + 1 || ty > room.y1 - 1) continue;
        if (!tileOk(tileMap, tx, ty, clear)) continue;
        if (nearDoorway(tileMap, tx, ty, 1)) continue;
        if (tileIndexAt(tileMap, tx, ty) === 'doorFrame') continue;
        const x = tx + 0.5;
        const z = ty + 0.5;
        if (overlapsSpawn(tileMap, x, z, 0.9, 0.55)) continue;
        placed.add(key);
        props.push({ kind: 'table', x, z, sx: 1.7, sy: 0.08, sz: 0.95 });
        pushAabb(obstacles, ts, x, z, 0.82, 0.42);
        if (
          tileOk(tileMap, tx, ty - 1, clear) &&
          !nearDoorway(tileMap, tx, ty - 1, 1) &&
          !overlapsSpawn(tileMap, x, z - 0.85, 0.75, 0.22)
        ) {
          props.push({ kind: 'bench', x, z: z - 0.85, sx: 1.5, sy: 0.12, sz: 0.35 });
          pushAabb(obstacles, ts, x, z - 0.85, 0.72, 0.18);
        }
        if (
          tileOk(tileMap, tx, ty + 1, clear) &&
          !nearDoorway(tileMap, tx, ty + 1, 1) &&
          !overlapsSpawn(tileMap, x, z + 0.85, 0.75, 0.22)
        ) {
          props.push({ kind: 'bench', x, z: z + 0.85, sx: 1.5, sy: 0.12, sz: 0.35 });
          pushAabb(obstacles, ts, x, z + 0.85, 0.72, 0.18);
        }
      }
      for (let tx = room.x0 + 2; tx <= room.x1 - 2; tx += 1) {
        if (!isSolidAtTile(tileMap, tx, room.y1 + 1)) continue;
        if (!tileOk(tileMap, tx, room.y1, clear)) continue;
        if (nearDoorway(tileMap, tx, room.y1, 1)) continue;
        const x = tx + 0.5;
        const z = room.y1 + 0.5 - 0.05;
        props.push({ kind: 'counter', x, z, sx: 0.9, sy: 1.05, sz: 0.55 });
        pushAabb(obstacles, ts, x, z, 0.42, 0.28);
      }
    } else if (role === 'medbay') {
      // Flush biobeds into the four corners against the room walls.
      const bedSx = 0.85;
      const bedSz = 1.55;
      const gap = 0.04;
      const westX = room.x0 + bedSx / 2 + gap;
      const eastX = room.x1 + 1 - bedSx / 2 - gap;
      const northZ = room.y0 + bedSz / 2 + gap;
      const southZ = room.y1 + 1 - bedSz / 2 - gap;
      const beds: Array<{ x: number; z: number; ry: number }> = [
        { x: westX, z: northZ, ry: 0 },
        { x: westX, z: southZ, ry: Math.PI },
        { x: eastX, z: northZ, ry: 0 },
        { x: eastX, z: southZ, ry: Math.PI },
      ];
      for (const bed of beds) {
        const tx = Math.floor(bed.x);
        const ty = Math.floor(bed.z);
        if (!tileOk(tileMap, tx, ty, clear)) continue;
        props.push({
          kind: 'biobed',
          x: bed.x,
          z: bed.z,
          sx: bedSx,
          sy: 0.35,
          sz: bedSz,
          ry: bed.ry,
        });
        pushAabb(obstacles, ts, bed.x, bed.z, bedSx * 0.48, bedSz * 0.48);
      }
    } else if (role === 'upper-engine') {
      const midX = Math.floor(cx);
      for (const oz of [-2, 0, 2]) {
        const ty = Math.round(cz + oz - 0.5);
        if (!tileOk(tileMap, midX, ty, clear)) continue;
        const x = midX + 0.5;
        const z = ty + 0.5;
        props.push({ kind: 'turbine', x, z, sx: 1, sy: 2.2, sz: 1 });
        pushCircle(obstacles, ts, x, z, 0.55);
      }
      for (let ty = room.y0 + 1; ty <= room.y1 - 1; ty += 2) {
        if (!isSolidAtTile(tileMap, room.x1 + 1, ty)) continue;
        if (!tileOk(tileMap, room.x1, ty, clear)) continue;
        const x = room.x1 + 0.5 - 0.1;
        const z = ty + 0.5;
        props.push({ kind: 'exhaust', x, z, sx: 0.9, sy: 1.2, sz: 0.9 });
        pushAabb(obstacles, ts, x, z, 0.35, 0.35);
      }
    } else if (role === 'electrical') {
      for (let ty = room.y0; ty <= room.y1; ty += 1) {
        for (const face of ['n', 's'] as const) {
          const wallTy = face === 'n' ? room.y0 - 1 : room.y1 + 1;
          const floorTy = face === 'n' ? room.y0 : room.y1;
          if (ty !== floorTy) continue;
          for (let tx = room.x0; tx <= room.x1; tx += 1) {
            if (!isSolidAtTile(tileMap, tx, wallTy)) continue;
            if (!tileOk(tileMap, tx, floorTy, clear)) continue;
            if ((tx + floorTy) % 2 !== 0) continue;
            const x = tx + 0.5;
            // Sit flush on the wall; shallow depth is wall-normal.
            const z = floorTy + 0.5 + (face === 'n' ? 0.18 : -0.18);
            // North wall: ry 0 faces +Z into room; south wall: ry PI faces −Z into room.
            const ry = face === 'n' ? 0 : Math.PI;
            props.push({ kind: 'breaker', x, z, sx: 0.85, sy: 1.7, sz: 0.32, ry });
            pushAabb(obstacles, ts, x, z, 0.4, 0.22);
          }
        }
      }
    } else if (role === 'storage') {
      // Dense perimeter / corner piles — leave the center aisle open.
      for (let ty = room.y0; ty <= room.y1; ty += 1) {
        for (let tx = room.x0; tx <= room.x1; tx += 1) {
          if (!tileOk(tileMap, tx, ty, clear)) continue;
          if (nearDoorway(tileMap, tx, ty, 1)) continue;
          let wallEdges = 0;
          if (isSolidAtTile(tileMap, tx, ty - 1)) wallEdges += 1;
          if (isSolidAtTile(tileMap, tx, ty + 1)) wallEdges += 1;
          if (isSolidAtTile(tileMap, tx - 1, ty)) wallEdges += 1;
          if (isSolidAtTile(tileMap, tx + 1, ty)) wallEdges += 1;
          if (wallEdges < 1) continue;
          if (!chance(tx, ty, 80, wallEdges >= 2 ? 700 : 400)) continue;
          const x = tx + 0.5;
          const z = ty + 0.5;
          const stack = 2 + (detailHash(tx, ty, 82) % 2); // 2–3 boxes
          props.push({ kind: 'pallet', x, z, sx: 0.9, sy: 0.08, sz: 0.9, seed: tx + ty * 64 });
          props.push({
            kind: 'crate',
            x,
            z,
            sx: 0.7 + (detailHash(tx, ty, 85) % 3) * 0.08,
            sy: 0.38,
            sz: 0.65 + (detailHash(tx, ty, 86) % 3) * 0.08,
            seed: stack,
          });
          pushAabb(obstacles, ts, x, z, 0.38, 0.36);
        }
      }
    } else if (role === 'reactor') {
      const coreTx = Math.floor(cx);
      const coreTy = Math.floor(cz);
      const coreX = tileOk(tileMap, coreTx, coreTy, clear) ? coreTx + 0.5 : cx;
      const coreZ = tileOk(tileMap, coreTx, coreTy, clear) ? coreTy + 0.5 : cz;
      props.push({ kind: 'reactorCore', x: coreX, z: coreZ, sx: 1.35, sy: 2.9, sz: 1.35 });
      pushCircle(obstacles, ts, coreX, coreZ, 0.78);
      for (const [dx, dz] of [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
        [0, -3],
        [0, 3],
      ] as const) {
        const tx = Math.floor(coreX + dx);
        const ty = Math.floor(coreZ + dz);
        if (!tileOk(tileMap, tx, ty, clear)) continue;
        const x = tx + 0.5;
        const z = ty + 0.5;
        props.push({ kind: 'reactorPillar', x, z, sx: 0.35, sy: 2.6, sz: 0.35 });
        pushAabb(obstacles, ts, x, z, 0.22, 0.22);
      }
    }
  }

  return { props, obstacles };
}

/** Convenience: obstacles only (sim collision). */
export function buildStationObstacles(
  tileMap: TileMap,
  clearWorld: readonly { x: number; z: number }[] = [],
): readonly StationObstacle[] {
  return buildPurposeLayout(tileMap, clearWorld).obstacles;
}
