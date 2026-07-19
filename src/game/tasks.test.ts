import { describe, expect, it } from 'vitest';
import {
  assignTasks,
  getTaskStation,
  getTaskStationByIndex,
  getTaskStationIndex,
  TASK_STATIONS,
} from './tasks';

describe('assignTasks', () => {
  it('assigns exactly taskCount fresh, incomplete tasks', () => {
    const tasks = assignTasks('seed-a', 0, 3);
    expect(tasks).toHaveLength(3);
    for (const task of tasks) {
      expect(task.completed).toBe(false);
      expect(task.progressTicks).toBe(0);
      expect(getTaskStation(task.stationId)).toBeDefined();
    }
  });

  it('never assigns the same station twice to one player', () => {
    const tasks = assignTasks('seed-b', 2, TASK_STATIONS.length);
    const uniqueIds = new Set(tasks.map((task) => task.stationId));
    expect(uniqueIds.size).toBe(tasks.length);
  });

  it('clamps taskCount to the number of stations available', () => {
    const tasks = assignTasks('seed-c', 0, 999);
    expect(tasks).toHaveLength(TASK_STATIONS.length);
  });

  it('clamps a negative taskCount to zero tasks', () => {
    expect(assignTasks('seed-d', 0, -5)).toHaveLength(0);
  });

  it('is deterministic for the same seed/playerId/taskCount', () => {
    const a = assignTasks('seed-e', 1, 4);
    const b = assignTasks('seed-e', 1, 4);
    expect(a).toEqual(b);
  });

  it('gives different players different lists (overwhelmingly likely)', () => {
    const a = assignTasks('seed-f', 0, 3);
    const b = assignTasks('seed-f', 1, 3);
    expect(a).not.toEqual(b);
  });
});

describe('getTaskStation', () => {
  it('returns undefined for an unknown station id', () => {
    expect(getTaskStation('does-not-exist')).toBeUndefined();
  });

  it('looks up a real station by id', () => {
    const station = getTaskStation(TASK_STATIONS[0].id);
    expect(station).toBe(TASK_STATIONS[0]);
  });

  it('maps every station to a minigame type', () => {
    for (const station of TASK_STATIONS) {
      expect(['wires', 'gauge', 'download']).toContain(station.minigame);
    }
  });

  it('round-trips station index helpers', () => {
    expect(getTaskStationIndex(TASK_STATIONS[2].id)).toBe(2);
    expect(getTaskStationByIndex(2)).toBe(TASK_STATIONS[2]);
    expect(getTaskStationIndex('missing')).toBe(-1);
    expect(getTaskStationByIndex(-1)).toBeUndefined();
  });
});
