import { describe, expect, it } from 'vitest';
import { INPUT_VERSION, type PlayerInput } from './input';
import { Simulation } from './simulation';
import { PROTOTYPE_MAP } from './tilemap';

const PLAYER_IDS = [0, 1, 2, 3];
const TICK_COUNT = 120;
const DT_MS = 1000 / 60;

/** Deterministic scripted input, purely a function of tick and playerId (no Math.random / wall-clock). */
function scriptedInputs(tick: number): PlayerInput[] {
  return PLAYER_IDS.map((playerId) => {
    const phase = tick / 30 + playerId * (Math.PI / 2);
    return {
      version: INPUT_VERSION,
      seq: tick,
      playerId,
      moveX: Math.cos(phase),
      moveY: Math.sin(phase),
      buttons: 0,
      targetId: -1,
      lookYaw: 0,
      flashlightOn: 1,
    };
  });
}

function runTo(simulation: Simulation, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.step(scriptedInputs(tick), DT_MS);
  }
}

describe('Simulation determinism', () => {
  it('produces identical spawn state for two instances built from the same seed', () => {
    const a = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });
    const b = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });

    expect(a.getStateHash()).toBe(b.getStateHash());
  });

  it('diverges for two instances built from different seeds', () => {
    const a = Simulation.create({ seed: 'seed-a', playerIds: PLAYER_IDS });
    const b = Simulation.create({ seed: 'seed-b', playerIds: PLAYER_IDS });

    expect(a.getStateHash()).not.toBe(b.getStateHash());
  });

  it('stays byte-for-byte identical across N ticks for the same seed + input log (multi-client replay)', () => {
    const clientA = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });
    const clientB = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });
    const clientC = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });

    for (let tick = 0; tick < TICK_COUNT; tick += 1) {
      const inputs = scriptedInputs(tick);
      clientA.step(inputs, DT_MS);
      clientB.step(inputs, DT_MS);
      clientC.step(inputs, DT_MS);

      expect(clientA.getStateHash()).toBe(clientB.getStateHash());
      expect(clientA.getStateHash()).toBe(clientC.getStateHash());
    }

    expect(clientA.currentTick).toBe(TICK_COUNT);
  });

  it('diverges if even one tick of input differs between clients', () => {
    const clientA = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });
    const clientB = Simulation.create({ seed: 'phase1-milestone', playerIds: PLAYER_IDS });

    runTo(clientA, 10);

    const tamperedInputs = scriptedInputs(9).map((input) =>
      input.playerId === 0 ? { ...input, moveX: -input.moveX } : input,
    );
    for (let tick = 0; tick < 9; tick += 1) {
      clientB.step(scriptedInputs(tick), DT_MS);
    }
    clientB.step(tamperedInputs, DT_MS);

    expect(clientA.getStateHash()).not.toBe(clientB.getStateHash());
  });
});

describe('Simulation determinism with wall collisions (Phase 3)', () => {
  // Long enough (5s at 60Hz) for the rotating scripted directions above to
  // sweep every player into a wall of the prototype map at least once —
  // room A/B are ~300-450px across at 120px/s, well inside this range.
  const COLLISION_TICK_COUNT = 300;

  it('stays byte-for-byte identical across 3 independently-built clients while colliding with the prototype map', () => {
    const clientA = Simulation.create({
      seed: 'phase3-collision',
      playerIds: PLAYER_IDS,
      tileMap: PROTOTYPE_MAP,
    });
    const clientB = Simulation.create({
      seed: 'phase3-collision',
      playerIds: PLAYER_IDS,
      tileMap: PROTOTYPE_MAP,
    });
    const clientC = Simulation.create({
      seed: 'phase3-collision',
      playerIds: PLAYER_IDS,
      tileMap: PROTOTYPE_MAP,
    });

    for (let tick = 0; tick < COLLISION_TICK_COUNT; tick += 1) {
      const inputs = scriptedInputs(tick);
      clientA.step(inputs, DT_MS);
      clientB.step(inputs, DT_MS);
      clientC.step(inputs, DT_MS);

      expect(clientA.getStateHash()).toBe(clientB.getStateHash());
      expect(clientA.getStateHash()).toBe(clientC.getStateHash());
    }

    // Every entity must stay within the map's own outer bounds — proves collision
    // is actually containing them, not just that (a possibly broken) collision
    // stayed consistently broken across all 3 clients.
    const mapWidthPx = PROTOTYPE_MAP.width * PROTOTYPE_MAP.tileSize;
    const mapHeightPx = PROTOTYPE_MAP.height * PROTOTYPE_MAP.tileSize;
    for (const entity of clientA.world.listEntities()) {
      expect(entity.position.x).toBeGreaterThanOrEqual(0);
      expect(entity.position.x).toBeLessThanOrEqual(mapWidthPx);
      expect(entity.position.y).toBeGreaterThanOrEqual(0);
      expect(entity.position.y).toBeLessThanOrEqual(mapHeightPx);
    }
  });
});
