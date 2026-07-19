import { describe, expect, it } from 'vitest';
import { evaluateWinCondition } from './winCondition';

describe('evaluateWinCondition', () => {
  const roles = new Map([
    [0, 'impostor' as const],
    [1, 'crewmate' as const],
    [2, 'crewmate' as const],
  ]);

  it('detects impostor majority', () => {
    const result = evaluateWinCondition({
      roles,
      alive: new Map([
        [0, true],
        [1, true],
        [2, false],
      ]),
      tasks: new Map(),
      reactorTimedOut: false,
    });
    expect(result).toEqual({ winner: 'impostor', reason: 'impostor_majority' });
  });

  it('detects all impostors eliminated', () => {
    const result = evaluateWinCondition({
      roles,
      alive: new Map([
        [0, false],
        [1, true],
        [2, true],
      ]),
      tasks: new Map(),
      reactorTimedOut: false,
    });
    expect(result).toEqual({ winner: 'crewmate', reason: 'impostors_eliminated' });
  });

  it('detects reactor timeout', () => {
    const result = evaluateWinCondition({
      roles,
      alive: new Map([
        [0, true],
        [1, true],
        [2, true],
      ]),
      tasks: new Map(),
      reactorTimedOut: true,
    });
    expect(result).toEqual({ winner: 'impostor', reason: 'reactor_timeout' });
  });

  it('detects all crewmate tasks complete (ignoring impostor fakes)', () => {
    const result = evaluateWinCondition({
      roles,
      alive: new Map([
        [0, true],
        [1, true],
        [2, true],
      ]),
      tasks: new Map([
        [0, [{ stationId: 'a', completed: false, progressTicks: 0 }]],
        [1, [{ stationId: 'b', completed: true, progressTicks: 10 }]],
        [2, [{ stationId: 'c', completed: true, progressTicks: 10 }]],
      ]),
      reactorTimedOut: false,
    });
    expect(result).toEqual({ winner: 'crewmate', reason: 'tasks' });
  });
});
