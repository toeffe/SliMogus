import { length, sub, type Vector2 } from '@sim/vector2';

/** World-px distance (center-to-center) within which an impostor can kill. */
export const KILL_RANGE_PX = 72;
/** Ticks an impostor must wait between kills (~10s at 60Hz). */
export const KILL_COOLDOWN_TICKS = 600;

export interface KillCandidate {
  readonly playerId: number;
  readonly position: Vector2;
  readonly alive: boolean;
  readonly isImpostor: boolean;
}

/**
 * Pure validation for a kill attempt. Returns the victim id when every
 * rule passes, otherwise `undefined`. Does not mutate anything — the
 * caller (`GameState`) applies the transition when this returns a victim.
 */
export function validateKill(options: {
  killerId: number;
  killerAlive: boolean;
  killerIsImpostor: boolean;
  killerPosition: Vector2;
  killCooldownTicks: number;
  /** Client-suggested victim (`PlayerInput.targetId`); ignored when `NO_TARGET` / invalid — the nearest eligible living crewmate in range is used instead so a stale client pick can't desync peers. */
  suggestedTargetId: number;
  candidates: readonly KillCandidate[];
}): number | undefined {
  if (!options.killerAlive || !options.killerIsImpostor) return undefined;
  if (options.killCooldownTicks > 0) return undefined;

  const eligible = options.candidates.filter(
    (candidate) =>
      candidate.playerId !== options.killerId &&
      candidate.alive &&
      !candidate.isImpostor &&
      length(sub(options.killerPosition, candidate.position)) <= KILL_RANGE_PX,
  );
  if (eligible.length === 0) return undefined;

  const suggested = eligible.find((candidate) => candidate.playerId === options.suggestedTargetId);
  if (suggested) return suggested.playerId;

  eligible.sort((a, b) => {
    const da = length(sub(options.killerPosition, a.position));
    const db = length(sub(options.killerPosition, b.position));
    if (da !== db) return da - db;
    return a.playerId - b.playerId;
  });
  return eligible[0]?.playerId;
}
