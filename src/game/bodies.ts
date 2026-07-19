import { length, sub, type Vector2 } from '@sim/vector2';

/** World-px distance within which a living player can report a body. */
export const REPORT_RANGE_PX = 80;

export interface Body {
  id: number;
  victimPlayerId: number;
  position: Vector2;
  /** Set when this body has been the subject of a report (meeting started from it); leftover bodies are cleared on meeting start anyway. */
  reported: boolean;
}

/** Nearest unreported body within `REPORT_RANGE_PX` of `reporterPosition`, or `undefined` if none. Ties broken by ascending body id. */
export function findReportableBody(
  reporterPosition: Vector2,
  bodies: readonly Body[],
): Body | undefined {
  let best: Body | undefined;
  let bestDistance = Infinity;
  for (const body of bodies) {
    if (body.reported) continue;
    const distance = length(sub(reporterPosition, body.position));
    if (distance > REPORT_RANGE_PX) continue;
    if (
      distance < bestDistance ||
      (distance === bestDistance && (best === undefined || body.id < best.id))
    ) {
      best = body;
      bestDistance = distance;
    }
  }
  return best;
}
