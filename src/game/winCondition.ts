import type { Role } from './roles';
import type { AssignedTask } from './tasks';

export type Winner = 'crewmate' | 'impostor';

export type WinReason = 'tasks' | 'impostor_majority' | 'reactor_timeout' | 'impostors_eliminated';

export interface WinResult {
  winner: Winner;
  reason: WinReason;
}

/**
 * Evaluates the four Phase 4 win conditions. Returns the first match in a
 * fixed priority order so every peer agrees even if multiple conditions
 * would be true on the same tick (e.g. last impostor ejected on the same
 * tick Reactor would have timed out — ejection/elimination wins).
 */
export function evaluateWinCondition(options: {
  roles: ReadonlyMap<number, Role>;
  alive: ReadonlyMap<number, boolean>;
  tasks: ReadonlyMap<number, readonly AssignedTask[]>;
  reactorTimedOut: boolean;
}): WinResult | null {
  if (options.reactorTimedOut) {
    return { winner: 'impostor', reason: 'reactor_timeout' };
  }

  let livingCrew = 0;
  let livingImpostors = 0;
  for (const [playerId, role] of options.roles) {
    if (!options.alive.get(playerId)) continue;
    if (role === 'impostor') livingImpostors += 1;
    else livingCrew += 1;
  }

  if (livingImpostors === 0 && [...options.roles.values()].some((role) => role === 'impostor')) {
    return { winner: 'crewmate', reason: 'impostors_eliminated' };
  }
  if (livingImpostors > 0 && livingImpostors >= livingCrew) {
    return { winner: 'impostor', reason: 'impostor_majority' };
  }

  // Only *crewmate* completions count — impostor "tasks" are visually identical fakes.
  let totalCrewTasks = 0;
  let completedCrewTasks = 0;
  for (const [playerId, role] of options.roles) {
    if (role !== 'crewmate') continue;
    const playerTasks = options.tasks.get(playerId) ?? [];
    totalCrewTasks += playerTasks.length;
    completedCrewTasks += playerTasks.filter((task) => task.completed).length;
  }
  if (totalCrewTasks > 0 && completedCrewTasks >= totalCrewTasks) {
    return { winner: 'crewmate', reason: 'tasks' };
  }

  return null;
}
