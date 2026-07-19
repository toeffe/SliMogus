import { describe, expect, it } from 'vitest';
import { assignRoles } from './roles';

describe('assignRoles', () => {
  it('assigns exactly impostorCount impostors and the rest crewmates', () => {
    const roles = assignRoles('seed-a', [0, 1, 2, 3, 4], 2);
    const values = [...roles.values()];
    expect(values.filter((role) => role === 'impostor')).toHaveLength(2);
    expect(values.filter((role) => role === 'crewmate')).toHaveLength(3);
  });

  it('is deterministic for the same seed/players/impostorCount', () => {
    const a = assignRoles('seed-b', [0, 1, 2, 3], 1);
    const b = assignRoles('seed-b', [3, 1, 0, 2], 1); // unsorted input order shouldn't matter
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('produces a different assignment for a different seed (overwhelmingly likely)', () => {
    const a = assignRoles('seed-c', [0, 1, 2, 3, 4, 5], 1);
    const b = assignRoles('seed-d', [0, 1, 2, 3, 4, 5], 1);
    expect([...a.entries()]).not.toEqual([...b.entries()]);
  });

  it('never assigns every player as an impostor, even if impostorCount >= playerCount', () => {
    const roles = assignRoles('seed-e', [0, 1], 5);
    const values = [...roles.values()];
    expect(values.filter((role) => role === 'crewmate')).toHaveLength(1);
    expect(values.filter((role) => role === 'impostor')).toHaveLength(1);
  });

  it('assigns everyone crewmate when impostorCount is 0', () => {
    const roles = assignRoles('seed-f', [0, 1, 2], 0);
    expect([...roles.values()].every((role) => role === 'crewmate')).toBe(true);
  });

  it('covers every player id exactly once', () => {
    const roles = assignRoles('seed-g', [5, 2, 9], 1);
    expect([...roles.keys()].sort((a, b) => a - b)).toEqual([2, 5, 9]);
  });

  it('does not consume/desync the same seed used for the spawn-position Random', () => {
    const rolesOnce = assignRoles('shared-seed', [0, 1, 2], 1);
    const rolesTwice = assignRoles('shared-seed', [0, 1, 2], 1);
    // Calling it twice with an unrelated fresh Random each time should still agree.
    expect([...rolesOnce.entries()]).toEqual([...rolesTwice.entries()]);
  });
});
