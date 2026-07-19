import { describe, expect, it } from 'vitest';
import { INPUT_VERSION, type PlayerInput } from './input';
import { resyncFromSnapshot } from './resync';
import { Simulation } from './simulation';

const PLAYER_IDS = [0, 1, 2];
const SEED = 'phase1-resync';
const DT_MS = 1000 / 60;
const SPLIT_TICK = 15;
const TOTAL_TICKS = 30;

function scriptedInputs(tick: number): PlayerInput[] {
  return PLAYER_IDS.map((playerId) => {
    const phase = tick / 20 + playerId;
    return {
      version: INPUT_VERSION,
      seq: tick,
      playerId,
      moveX: Math.sin(phase),
      moveY: Math.cos(phase),
      buttons: 0,
      targetId: -1,
      lookYaw: 0,
      flashlightOn: 1,
    };
  });
}

describe('resyncFromSnapshot (late join)', () => {
  it('matches an uninterrupted client after replaying the missed ticks', () => {
    const uninterrupted = Simulation.create({ seed: SEED, playerIds: PLAYER_IDS });
    for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
      uninterrupted.step(scriptedInputs(tick), DT_MS);
    }

    const early = Simulation.create({ seed: SEED, playerIds: PLAYER_IDS });
    for (let tick = 0; tick < SPLIT_TICK; tick += 1) {
      early.step(scriptedInputs(tick), DT_MS);
    }
    const snapshot = early.getSnapshot();

    const pendingInputsByTick = new Map<number, readonly PlayerInput[]>();
    for (let tick = SPLIT_TICK; tick < TOTAL_TICKS; tick += 1) {
      pendingInputsByTick.set(tick, scriptedInputs(tick));
    }

    const lateJoiner = resyncFromSnapshot(snapshot, SEED, pendingInputsByTick, DT_MS);

    expect(lateJoiner.currentTick).toBe(TOTAL_TICKS);
    expect(lateJoiner.getStateHash()).toBe(uninterrupted.getStateHash());
  });

  it('replays zero ticks when there is no pending input, leaving the snapshot state as-is', () => {
    const simulation = Simulation.create({ seed: SEED, playerIds: PLAYER_IDS });
    for (let tick = 0; tick < SPLIT_TICK; tick += 1) {
      simulation.step(scriptedInputs(tick), DT_MS);
    }
    const snapshot = simulation.getSnapshot();

    const resynced = resyncFromSnapshot(snapshot, SEED, new Map(), DT_MS);

    expect(resynced.currentTick).toBe(SPLIT_TICK);
    expect(resynced.getStateHash()).toBe(simulation.getStateHash());
  });
});
