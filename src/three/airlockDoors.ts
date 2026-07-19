import type { Group, Object3D } from 'three';
import type { ViewSnapshot } from '@game/viewSnapshot';
import { WORLD_SCALE } from './worldScale';

/** Considered shut for vision once open amount drops below this. */
const CLOSED_OPEN_THRESHOLD = 0.35;

interface AirlockState {
  axis: 'x' | 'z';
  centerX: number;
  centerZ: number;
  closedA: number;
  closedB: number;
  openA: number;
  openB: number;
  /** Span of the sealed aperture along the opening axis (world units). */
  blockMin: number;
  blockMax: number;
  leafA: Object3D;
  leafB: Object3D;
  open: number;
}

export interface AirlockRegistry {
  update: (snapshot: ViewSnapshot, dtSec: number) => void;
  /**
   * True if a world-XZ segment is blocked by a mostly-closed airlock leaf.
   * Complements tilemap wall LOS (doorFrame tiles stay walkable/open in the grid).
   */
  blocksSight: (wx0: number, wz0: number, wx1: number, wz1: number) => boolean;
}

const OPEN_RANGE_TILES = 2.5;
const LERP_SPEED = 6;

function segmentHitsClosedDoor(
  wx0: number,
  wz0: number,
  wx1: number,
  wz1: number,
  door: AirlockState,
): boolean {
  if (door.open > CLOSED_OPEN_THRESHOLD) return false;
  if (door.axis === 'x') {
    const d0 = wx0 - door.centerX;
    const d1 = wx1 - door.centerX;
    if (d0 * d1 > 0) return false;
    const denom = d0 - d1;
    if (Math.abs(denom) < 1e-8) return false;
    const t = d0 / denom;
    if (t < 0 || t > 1) return false;
    const z = wz0 + (wz1 - wz0) * t;
    return z >= door.blockMin && z <= door.blockMax;
  }
  const d0 = wz0 - door.centerZ;
  const d1 = wz1 - door.centerZ;
  if (d0 * d1 > 0) return false;
  const denom = d0 - d1;
  if (Math.abs(denom) < 1e-8) return false;
  const t = d0 / denom;
  if (t < 0 || t > 1) return false;
  const x = wx0 + (wx1 - wx0) * t;
  return x >= door.blockMin && x <= door.blockMax;
}

/** Collect bulkhead airlocks and drive cosmetic sliding leaves from proximity. */
export function createAirlockRegistry(stationRoot: Group): AirlockRegistry {
  const doors: AirlockState[] = [];
  stationRoot.traverse((obj) => {
    if (obj.name !== 'bulkhead') return;
    const data = obj.userData.airlock as AirlockState | undefined;
    if (data?.leafA && data?.leafB && Number.isFinite(data.blockMin)) doors.push(data);
  });

  return {
    update(snapshot, dtSec) {
      const range2 = OPEN_RANGE_TILES * OPEN_RANGE_TILES;
      for (const door of doors) {
        let wantOpen = false;
        for (const entity of snapshot.entities) {
          if (!entity.alive && entity.id !== snapshot.localPlayerId) continue;
          const ex = entity.x * WORLD_SCALE;
          const ez = entity.y * WORLD_SCALE;
          const dx = ex - door.centerX;
          const dz = ez - door.centerZ;
          if (dx * dx + dz * dz <= range2) {
            wantOpen = true;
            break;
          }
        }
        const target = wantOpen ? 1 : 0;
        const t = 1 - Math.exp(-LERP_SPEED * Math.max(0.001, dtSec));
        door.open += (target - door.open) * t;
        if (door.axis === 'x') {
          door.leafA.position.z = door.closedA + (door.openA - door.closedA) * door.open;
          door.leafB.position.z = door.closedB + (door.openB - door.closedB) * door.open;
        } else {
          door.leafA.position.x = door.closedA + (door.openA - door.closedA) * door.open;
          door.leafB.position.x = door.closedB + (door.openB - door.closedB) * door.open;
        }
      }
    },

    blocksSight(wx0, wz0, wx1, wz1) {
      for (const door of doors) {
        if (segmentHitsClosedDoor(wx0, wz0, wx1, wz1, door)) return true;
      }
      return false;
    },
  };
}
