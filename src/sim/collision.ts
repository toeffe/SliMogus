import { isSolidAtTile, worldToTile, type TileMap } from './tilemap';
import { vec2, type Vector2 } from './vector2';
import type { StationObstacle } from './purposeLayout';

/**
 * Axis-separated circle-vs-tilemap collision: resolves the X move using the
 * pre-move Y, then the Y move using the already-resolved X, so an entity
 * slides along a wall instead of clipping through corners. Only checks the
 * tile(s) at the circle's *leading edge* in the perpendicular range it
 * covers — safe because per-tick displacement (`MOVE_SPEED` in `world.ts`
 * at 60Hz) is always far smaller than a tile, so a whole tile can never be
 * tunneled through in one step.
 */
export function resolveCircleVsTilemap(
  previousPosition: Vector2,
  targetPosition: Vector2,
  radius: number,
  map: TileMap,
): Vector2 {
  const resolvedX = resolveAxis(
    map,
    radius,
    previousPosition.x,
    targetPosition.x,
    previousPosition.y,
    'x',
  );
  const resolvedY = resolveAxis(map, radius, previousPosition.y, targetPosition.y, resolvedX, 'y');
  return vec2(resolvedX, resolvedY);
}

/**
 * Resolve circle against static furniture AABBs / circles (pixel space).
 * Axis-separated like the tilemap solver so players slide along table edges.
 */
export function resolveCircleVsObstacles(
  previousPosition: Vector2,
  targetPosition: Vector2,
  radius: number,
  obstacles: readonly StationObstacle[],
): Vector2 {
  if (obstacles.length === 0) return targetPosition;
  const resolvedX = resolveObstacleAxis(
    previousPosition.x,
    targetPosition.x,
    previousPosition.y,
    radius,
    obstacles,
    'x',
  );
  const resolvedY = resolveObstacleAxis(
    previousPosition.y,
    targetPosition.y,
    resolvedX,
    radius,
    obstacles,
    'y',
  );
  return vec2(resolvedX, resolvedY);
}

/** Full move: walls first, then furniture. */
export function resolveCircleMovement(
  previousPosition: Vector2,
  targetPosition: Vector2,
  radius: number,
  map: TileMap,
  obstacles: readonly StationObstacle[] = [],
): Vector2 {
  const afterWalls = resolveCircleVsTilemap(previousPosition, targetPosition, radius, map);
  return resolveCircleVsObstacles(previousPosition, afterWalls, radius, obstacles);
}

function resolveObstacleAxis(
  previousCoord: number,
  targetCoord: number,
  perpendicularCoord: number,
  radius: number,
  obstacles: readonly StationObstacle[],
  axis: 'x' | 'y',
): number {
  if (targetCoord === previousCoord) return targetCoord;
  const direction = targetCoord > previousCoord ? 1 : -1;
  let resolved = targetCoord;

  for (const ob of obstacles) {
    if (ob.kind === 'aabb') {
      const hit = hitAabbAxis(
        previousCoord,
        resolved,
        perpendicularCoord,
        radius,
        ob,
        axis,
        direction,
      );
      if (hit !== undefined) resolved = hit;
    } else {
      const hit = hitCircleAxis(
        previousCoord,
        resolved,
        perpendicularCoord,
        radius,
        ob,
        axis,
        direction,
      );
      if (hit !== undefined) resolved = hit;
    }
  }
  return resolved;
}

function hitAabbAxis(
  previousCoord: number,
  targetCoord: number,
  perp: number,
  radius: number,
  ob: Extract<StationObstacle, { kind: 'aabb' }>,
  axis: 'x' | 'y',
  direction: number,
): number | undefined {
  const minA = axis === 'x' ? ob.minX : ob.minY;
  const maxA = axis === 'x' ? ob.maxX : ob.maxY;
  const minP = axis === 'x' ? ob.minY : ob.minX;
  const maxP = axis === 'x' ? ob.maxY : ob.maxX;

  // Perpendicular overlap with padded AABB.
  if (perp + radius <= minP || perp - radius >= maxP) return undefined;

  if (direction === 1) {
    const face = minA - radius;
    if (previousCoord <= face && targetCoord > face) return face;
  } else {
    const face = maxA + radius;
    if (previousCoord >= face && targetCoord < face) return face;
  }
  // Already overlapping — push out to nearest face along travel.
  if (targetCoord + radius > minA && targetCoord - radius < maxA) {
    if (direction === 1) return minA - radius;
    return maxA + radius;
  }
  return undefined;
}

function hitCircleAxis(
  previousCoord: number,
  targetCoord: number,
  perp: number,
  radius: number,
  ob: Extract<StationObstacle, { kind: 'circle' }>,
  axis: 'x' | 'y',
  direction: number,
): number | undefined {
  const cx = axis === 'x' ? ob.x : ob.y;
  const cy = axis === 'x' ? ob.y : ob.x;
  const combined = radius + ob.r;
  const dPerp = perp - cy;
  if (Math.abs(dPerp) >= combined) return undefined;
  const maxAlong = Math.sqrt(Math.max(0, combined * combined - dPerp * dPerp));
  const nearFace = direction === 1 ? cx - maxAlong : cx + maxAlong;

  if (direction === 1) {
    if (previousCoord <= nearFace && targetCoord > nearFace) return nearFace;
  } else if (previousCoord >= nearFace && targetCoord < nearFace) {
    return nearFace;
  }
  // Stuck inside — push to surface.
  const dAlong = targetCoord - cx;
  if (dAlong * dAlong + dPerp * dPerp < combined * combined) {
    return nearFace;
  }
  return undefined;
}

function resolveAxis(
  map: TileMap,
  radius: number,
  previousCoord: number,
  targetCoord: number,
  perpendicularCoord: number,
  axis: 'x' | 'y',
): number {
  if (targetCoord === previousCoord) return targetCoord;
  const direction = targetCoord > previousCoord ? 1 : -1;
  const leadingEdge = targetCoord + direction * radius;
  const leadingTile = worldToTile(leadingEdge, map.tileSize);

  const perpMinTile = worldToTile(perpendicularCoord - radius, map.tileSize);
  // Upper bound uses ceil-minus-one rather than `worldToTile` (floor): when the
  // circle's far edge sits exactly on a tile boundary (as it does right after
  // being clamped against a wall on this same axis on a previous call), floor
  // would wrongly count the tile beyond that boundary as overlapped — merely
  // touching it, not entering it — which would falsely block sliding along a
  // wall on the other axis.
  const perpMaxTile = Math.ceil((perpendicularCoord + radius) / map.tileSize) - 1;

  for (let perpTile = perpMinTile; perpTile <= perpMaxTile; perpTile += 1) {
    const solid =
      axis === 'x'
        ? isSolidAtTile(map, leadingTile, perpTile)
        : isSolidAtTile(map, perpTile, leadingTile);
    if (solid) {
      const tileBoundary =
        direction === 1 ? leadingTile * map.tileSize : (leadingTile + 1) * map.tileSize;
      return tileBoundary - direction * radius;
    }
  }
  return targetCoord;
}
