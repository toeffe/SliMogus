import { length, sub, type Vector2 } from '@sim/vector2';
import { getMapPois } from './mapPois';

export const VENT_RANGE_PX = 40;
export const VENT_COOLDOWN_TICKS = 60;

export interface Vent {
  readonly id: string;
  readonly position: Vector2;
  readonly linkedId: string;
}

/** Default (Station Omega) vents. Prefer `getVents(mapId)` when map-aware. */
export const VENTS: readonly Vent[] = getMapPois('omega').vents;

export function getVents(mapId = 'omega'): readonly Vent[] {
  return getMapPois(mapId).vents;
}

export function getVent(ventId: string, mapId = 'omega'): Vent | undefined {
  return getVents(mapId).find((vent) => vent.id === ventId);
}

/** Nearest vent within `VENT_RANGE_PX`, ties broken by ascending id. */
export function findNearestVent(
  position: Vector2,
  vents: readonly Vent[] = VENTS,
): Vent | undefined {
  let best: Vent | undefined;
  let bestDistance = Infinity;
  for (const vent of vents) {
    const distance = length(sub(position, vent.position));
    if (distance > VENT_RANGE_PX) continue;
    if (
      distance < bestDistance ||
      (distance === bestDistance && (best === undefined || vent.id < best.id))
    ) {
      best = vent;
      bestDistance = distance;
    }
  }
  return best;
}
