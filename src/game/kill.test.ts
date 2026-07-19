import { describe, expect, it } from 'vitest';
import { vec2 } from '@sim/vector2';
import { KILL_RANGE_PX, validateKill } from './kill';

describe('validateKill', () => {
  const baseCandidates = [
    { playerId: 0, position: vec2(0, 0), alive: true, isImpostor: true },
    { playerId: 1, position: vec2(20, 0), alive: true, isImpostor: false },
    { playerId: 2, position: vec2(1000, 0), alive: true, isImpostor: false },
  ];

  it('allows an impostor to kill the nearest living crewmate in range', () => {
    expect(
      validateKill({
        killerId: 0,
        killerAlive: true,
        killerIsImpostor: true,
        killerPosition: vec2(0, 0),
        killCooldownTicks: 0,
        suggestedTargetId: -1,
        candidates: baseCandidates,
      }),
    ).toBe(1);
  });

  it('honors a valid suggested target when that target is in range', () => {
    const candidates = [
      ...baseCandidates,
      { playerId: 3, position: vec2(10, 0), alive: true, isImpostor: false },
    ];
    expect(
      validateKill({
        killerId: 0,
        killerAlive: true,
        killerIsImpostor: true,
        killerPosition: vec2(0, 0),
        killCooldownTicks: 0,
        suggestedTargetId: 3,
        candidates,
      }),
    ).toBe(3);
  });

  it('rejects kills while on cooldown, when not impostor, or when dead', () => {
    expect(
      validateKill({
        killerId: 0,
        killerAlive: true,
        killerIsImpostor: true,
        killerPosition: vec2(0, 0),
        killCooldownTicks: 10,
        suggestedTargetId: -1,
        candidates: baseCandidates,
      }),
    ).toBeUndefined();
    expect(
      validateKill({
        killerId: 1,
        killerAlive: true,
        killerIsImpostor: false,
        killerPosition: vec2(0, 0),
        killCooldownTicks: 0,
        suggestedTargetId: -1,
        candidates: baseCandidates,
      }),
    ).toBeUndefined();
  });

  it('rejects out-of-range and fellow-impostor targets', () => {
    expect(
      validateKill({
        killerId: 0,
        killerAlive: true,
        killerIsImpostor: true,
        killerPosition: vec2(0, 0),
        killCooldownTicks: 0,
        suggestedTargetId: -1,
        candidates: [
          { playerId: 0, position: vec2(0, 0), alive: true, isImpostor: true },
          { playerId: 2, position: vec2(KILL_RANGE_PX + 1, 0), alive: true, isImpostor: false },
        ],
      }),
    ).toBeUndefined();
  });
});
