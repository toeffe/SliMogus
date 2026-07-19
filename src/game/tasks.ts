import { Random } from '@sim/random';
import type { Vector2 } from '@sim/vector2';
import { getMapPois } from './mapPois';

export type TaskMinigameId = 'wires' | 'gauge' | 'download';

export interface TaskStation {
  readonly id: string;
  readonly name: string;
  readonly position: Vector2;
  /** Kept for HUD/hash compatibility; completion is binary after minigames. */
  readonly durationTicks: number;
  readonly minigame: TaskMinigameId;
}

export const TASK_INTERACT_RANGE_PX = 48;

/**
 * Default (Station Omega) stations. Prefer `getTaskStations(mapId)` when the
 * active map may not be Omega.
 */
export const TASK_STATIONS: readonly TaskStation[] = getMapPois('omega').taskStations;

export function getTaskStations(mapId = 'omega'): readonly TaskStation[] {
  return getMapPois(mapId).taskStations;
}

export function getTaskStation(stationId: string, mapId = 'omega'): TaskStation | undefined {
  return getTaskStations(mapId).find((station) => station.id === stationId);
}

export function getTaskStationIndex(stationId: string, mapId = 'omega'): number {
  return getTaskStations(mapId).findIndex((station) => station.id === stationId);
}

export function getTaskStationByIndex(index: number, mapId = 'omega'): TaskStation | undefined {
  const stations = getTaskStations(mapId);
  if (!Number.isInteger(index) || index < 0 || index >= stations.length) return undefined;
  return stations[index];
}

export interface AssignedTask {
  stationId: string;
  completed: boolean;
  progressTicks: number;
}

/**
 * Deterministic task assignment from seed + playerId. Shuffles the full
 * station list for `mapId`, truncated to `taskCount`.
 */
export function assignTasks(
  seed: string,
  playerId: number,
  taskCount: number,
  mapId = 'omega',
): AssignedTask[] {
  const random = new Random(`${seed}:tasks:${playerId}`);
  const shuffled = [...getTaskStations(mapId)];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  const count = Math.min(Math.max(0, taskCount), shuffled.length);
  return shuffled.slice(0, count).map((station) => ({
    stationId: station.id,
    completed: false,
    progressTicks: 0,
  }));
}
