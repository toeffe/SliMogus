import { describe, expect, it } from 'vitest';
import { INPUT_VERSION, PlayerInputButton, type PlayerInput } from '@sim/input';
import { PROTOTYPE_MAP } from '@sim/tilemap';
import { GameState } from './gameState';
import { LIGHTS_FIX_DURATION_TICKS, LIGHTS_PANEL } from './sabotage';
import { TASK_STATIONS } from './tasks';
import { VENTS } from './vents';

const PLAYER_IDS = [0, 1, 2, 3];
const DT_MS = 1000 / 60;
const TICK_COUNT = 120;

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

function createGame(seed: string, impostorCount = 1, taskCount = 3): GameState {
  return GameState.create({
    seed,
    playerIds: PLAYER_IDS,
    tileMap: PROTOTYPE_MAP,
    impostorCount,
    taskCount,
  });
}

describe('GameState.create', () => {
  it('starts in the playing phase', () => {
    expect(createGame('seed-a').phase).toBe('playing');
  });

  it('assigns roles consistent with assignRoles for the same seed/impostorCount', () => {
    const game = createGame('seed-a', 1);
    const roleValues = PLAYER_IDS.map((id) => game.getRole(id));
    expect(roleValues.filter((role) => role === 'impostor')).toHaveLength(1);
    expect(roleValues.filter((role) => role === 'crewmate')).toHaveLength(3);
  });
});

describe('GameState tasks', () => {
  it('assigns each player taskCount tasks, matching assignTasks', () => {
    const game = createGame('seed-tasks', 1, 2);
    for (const playerId of PLAYER_IDS) {
      expect(game.getTasks(playerId)).toHaveLength(2);
    }
  });

  it('returns an empty list for an unknown player id', () => {
    const game = createGame('seed-tasks');
    expect(game.getTasks(999)).toEqual([]);
  });

  function inputFor(playerId: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
    return {
      version: INPUT_VERSION,
      seq: 0,
      playerId,
      moveX: 0,
      moveY: 0,
      buttons: 0,
      targetId: -1,
      lookYaw: 0,
      flashlightOn: 1,
      ...overrides,
    };
  }

  it('completes a task on TASK_COMPLETE while in range of an assigned station', () => {
    const game = createGame('seed-progress', 0, TASK_STATIONS.length);
    const playerId = PLAYER_IDS[0];
    const station = TASK_STATIONS.find(
      (candidate) => candidate.id === game.getTasks(playerId)[0].stationId,
    )!;
    const stationIndex = TASK_STATIONS.findIndex((candidate) => candidate.id === station.id);
    const entity = game.simulation.world.getEntity(playerId)!;
    entity.position = { x: station.position.x, y: station.position.y };

    const inputs = PLAYER_IDS.map((id) =>
      id === playerId
        ? inputFor(id, {
            buttons: PlayerInputButton.TASK_COMPLETE,
            targetId: stationIndex,
          })
        : inputFor(id),
    );
    game.step(inputs, DT_MS);

    expect(game.getTasks(playerId)[0].completed).toBe(true);
    expect(game.getTasks(playerId)[0].progressTicks).toBe(station.durationTicks);
  });

  it('rejects TASK_COMPLETE while out of range', () => {
    const game = createGame('seed-progress-oor', 0, TASK_STATIONS.length);
    const playerId = PLAYER_IDS[0];
    const station = TASK_STATIONS.find(
      (candidate) => candidate.id === game.getTasks(playerId)[0].stationId,
    )!;
    const stationIndex = TASK_STATIONS.findIndex((candidate) => candidate.id === station.id);
    const entity = game.simulation.world.getEntity(playerId)!;
    entity.position = { x: -10000, y: -10000 };

    const inputs = PLAYER_IDS.map((id) =>
      id === playerId
        ? inputFor(id, {
            buttons: PlayerInputButton.TASK_COMPLETE,
            targetId: stationIndex,
          })
        : inputFor(id),
    );
    game.step(inputs, DT_MS);

    expect(game.getTasks(playerId).every((task) => !task.completed)).toBe(true);
  });

  it('rejects TASK_COMPLETE for a station the player was not assigned', () => {
    const game = createGame('seed-wrong-station', 0, 1);
    const playerId = PLAYER_IDS[0];
    const assignedId = game.getTasks(playerId)[0].stationId;
    const other = TASK_STATIONS.find((candidate) => candidate.id !== assignedId)!;
    const otherIndex = TASK_STATIONS.findIndex((candidate) => candidate.id === other.id);
    const entity = game.simulation.world.getEntity(playerId)!;
    entity.position = { x: other.position.x, y: other.position.y };

    const inputs = PLAYER_IDS.map((id) =>
      id === playerId
        ? inputFor(id, {
            buttons: PlayerInputButton.TASK_COMPLETE,
            targetId: otherIndex,
          })
        : inputFor(id),
    );
    game.step(inputs, DT_MS);

    expect(game.getTasks(playerId)[0].completed).toBe(false);
  });

  it('does not complete a task from USE alone while standing on the station', () => {
    const game = createGame('seed-no-use', 0, TASK_STATIONS.length);
    const playerId = PLAYER_IDS[0];
    const station = TASK_STATIONS.find(
      (candidate) => candidate.id === game.getTasks(playerId)[0].stationId,
    )!;
    const entity = game.simulation.world.getEntity(playerId)!;
    entity.position = { x: station.position.x, y: station.position.y };

    const inputs = PLAYER_IDS.map((id) =>
      id === playerId ? inputFor(id, { buttons: PlayerInputButton.USE }) : inputFor(id),
    );
    game.step(inputs, DT_MS);

    expect(game.getTasks(playerId)[0].completed).toBe(false);
    expect(game.getTasks(playerId)[0].progressTicks).toBe(0);
  });

  it('rejects impostor TASK_COMPLETE so fake tasks stay incomplete', () => {
    const game = createGame('seed-impostor-fake', 1, TASK_STATIONS.length);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    const station = TASK_STATIONS.find(
      (candidate) => candidate.id === game.getTasks(impostorId)[0].stationId,
    )!;
    const stationIndex = TASK_STATIONS.findIndex((candidate) => candidate.id === station.id);
    const entity = game.simulation.world.getEntity(impostorId)!;
    entity.position = { x: station.position.x, y: station.position.y };

    game.step(
      PLAYER_IDS.map((id) =>
        id === impostorId
          ? inputFor(id, {
              buttons: PlayerInputButton.TASK_COMPLETE,
              targetId: stationIndex,
            })
          : inputFor(id),
      ),
      DT_MS,
    );

    expect(game.getTasks(impostorId)[0].completed).toBe(false);
    expect(game.winner).toBeNull();
  });
});

describe('GameState determinism (composed with roles/phase)', () => {
  it('stays byte-for-byte identical across 3 independently-built instances', () => {
    const a = createGame('phase4-milestone2', 1);
    const b = createGame('phase4-milestone2', 1);
    const c = createGame('phase4-milestone2', 1);

    for (let tick = 0; tick < TICK_COUNT; tick += 1) {
      const inputs = scriptedInputs(tick);
      a.step(inputs, DT_MS);
      b.step(inputs, DT_MS);
      c.step(inputs, DT_MS);

      expect(a.getStateHash()).toBe(b.getStateHash());
      expect(a.getStateHash()).toBe(c.getStateHash());
    }
  });

  it('diverges when roles differ despite identical simulation input (different impostorCount)', () => {
    const a = createGame('phase4-milestone2', 1);
    const b = createGame('phase4-milestone2', 2);

    expect(a.getStateHash()).not.toBe(b.getStateHash());
  });

  it('diverges for two instances built from different seeds', () => {
    const a = createGame('seed-a');
    const b = createGame('seed-b');

    expect(a.getStateHash()).not.toBe(b.getStateHash());
  });
});

describe('GameState.step phase gating', () => {
  it('advances the simulation while phase is "playing"', () => {
    const game = createGame('seed-freeze');
    const before = game.simulation.currentTick;
    game.step(scriptedInputs(0), DT_MS);
    expect(game.simulation.currentTick).toBe(before + 1);
  });

  it('freezes the simulation (skips Simulation.step) once phase is not "playing"', () => {
    const game = createGame('seed-freeze');
    game.phase = 'meeting';
    const before = game.simulation.currentTick;
    const hashBefore = game.getStateHash();
    game.step(scriptedInputs(0), DT_MS);
    expect(game.simulation.currentTick).toBe(before);
    expect(game.getStateHash()).toBe(hashBefore);
  });
});

describe('GameState snapshot round-trip', () => {
  it('restores an identical hash from its own snapshot', () => {
    const game = createGame('seed-snapshot', 1);
    for (let tick = 0; tick < 30; tick += 1) {
      game.step(scriptedInputs(tick), DT_MS);
    }

    const snapshot = game.getSnapshot();
    const restored = GameState.fromSnapshot(snapshot, 'seed-snapshot', PROTOTYPE_MAP);

    expect(restored.getStateHash()).toBe(game.getStateHash());
    expect(restored.phase).toBe(game.phase);
    for (const playerId of PLAYER_IDS) {
      expect(restored.getRole(playerId)).toBe(game.getRole(playerId));
      expect(restored.getTasks(playerId)).toEqual(game.getTasks(playerId));
    }
  });
});

describe('GameState kill / ghost / body', () => {
  function inputFor(playerId: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
    return {
      version: INPUT_VERSION,
      seq: 0,
      playerId,
      moveX: 0,
      moveY: 0,
      buttons: 0,
      targetId: -1,
      lookYaw: 0,
      flashlightOn: 1,
      ...overrides,
    };
  }

  it('kills a nearby crewmate, spawns a body, and marks the victim as a ghost', () => {
    const game = createGame('seed-kill', 1);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    const crewId = PLAYER_IDS.find((id) => game.getRole(id) === 'crewmate')!;
    const impostor = game.simulation.world.getEntity(impostorId)!;
    const crew = game.simulation.world.getEntity(crewId)!;
    crew.position = { x: impostor.position.x + 10, y: impostor.position.y };

    const inputs = PLAYER_IDS.map((id) =>
      id === impostorId
        ? inputFor(id, { buttons: PlayerInputButton.KILL, targetId: crewId })
        : inputFor(id),
    );
    game.step(inputs, DT_MS);

    expect(game.isAlive(crewId)).toBe(false);
    expect(crew.ignoresCollision).toBe(true);
    expect(game.getBodies()).toHaveLength(1);
    expect(game.getBodies()[0].victimPlayerId).toBe(crewId);
    expect(game.getKillCooldownTicks(impostorId)).toBeGreaterThan(0);
  });

  it('lets a living player report a nearby body and enter a meeting', () => {
    const game = createGame('seed-report', 1);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    const crewId = PLAYER_IDS.find((id) => game.getRole(id) === 'crewmate')!;
    const reporterId = PLAYER_IDS.find((id) => id !== impostorId && id !== crewId)!;
    const impostor = game.simulation.world.getEntity(impostorId)!;
    const crew = game.simulation.world.getEntity(crewId)!;
    const reporter = game.simulation.world.getEntity(reporterId)!;
    crew.position = { x: impostor.position.x + 10, y: impostor.position.y };

    game.step(
      PLAYER_IDS.map((id) =>
        id === impostorId
          ? inputFor(id, { buttons: PlayerInputButton.KILL, targetId: crewId })
          : inputFor(id),
      ),
      DT_MS,
    );
    reporter.position = { ...game.getBodies()[0].position };

    game.step(
      PLAYER_IDS.map((id) =>
        id === reporterId ? inputFor(id, { buttons: PlayerInputButton.REPORT }) : inputFor(id),
      ),
      DT_MS,
    );

    expect(game.phase).toBe('meeting');
    expect(game.meeting?.reason).toBe('body');
    expect(game.getBodies()).toHaveLength(0);
  });
});

describe('GameState vents / sabotage / win', () => {
  function inputFor(playerId: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
    return {
      version: INPUT_VERSION,
      seq: 0,
      playerId,
      moveX: 0,
      moveY: 0,
      buttons: 0,
      targetId: -1,
      lookYaw: 0,
      flashlightOn: 1,
      ...overrides,
    };
  }

  it('teleports an impostor through a vent pair', () => {
    const game = createGame('seed-vent', 1);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    const entity = game.simulation.world.getEntity(impostorId)!;
    const entrance = VENTS[0];
    entity.position = { x: entrance.position.x, y: entrance.position.y };

    game.step(
      PLAYER_IDS.map((id) =>
        id === impostorId ? inputFor(id, { buttons: PlayerInputButton.USE }) : inputFor(id),
      ),
      DT_MS,
    );

    const exit = VENTS.find((vent) => vent.id === entrance.linkedId)!;
    expect(entity.position.x).toBeCloseTo(exit.position.x);
    expect(entity.position.y).toBeCloseTo(exit.position.y);
  });

  it('starts a lights sabotage from an impostor hotkey', () => {
    const game = createGame('seed-lights', 1);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    game.step(
      PLAYER_IDS.map((id) =>
        id === impostorId
          ? inputFor(id, { buttons: PlayerInputButton.SABOTAGE_LIGHTS })
          : inputFor(id),
      ),
      DT_MS,
    );
    expect(game.getSabotage().active).toBe('lights');
  });

  it('restores lights when a crewmate holds USE at the Electrical panel', () => {
    const game = createGame('seed-lights-fix', 1);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    const crewId = PLAYER_IDS.find((id) => game.getRole(id) === 'crewmate')!;
    game.step(
      PLAYER_IDS.map((id) =>
        id === impostorId
          ? inputFor(id, { buttons: PlayerInputButton.SABOTAGE_LIGHTS })
          : inputFor(id),
      ),
      DT_MS,
    );
    expect(game.getSabotage().active).toBe('lights');

    const crew = game.simulation.world.getEntity(crewId)!;
    crew.position = { x: LIGHTS_PANEL.position.x, y: LIGHTS_PANEL.position.y };

    for (let i = 0; i < LIGHTS_FIX_DURATION_TICKS; i += 1) {
      game.step(
        PLAYER_IDS.map((id) =>
          id === crewId ? inputFor(id, { buttons: PlayerInputButton.USE }) : inputFor(id),
        ),
        DT_MS,
      );
    }

    expect(game.getSabotage().active).toBeNull();
    expect(game.getSabotage().lightsFixProgress).toBe(0);
  });

  it('ends the game when the last impostor is ejected', () => {
    const game = createGame('seed-eject-win', 1);
    const impostorId = PLAYER_IDS.find((id) => game.getRole(id) === 'impostor')!;
    // Force emergency meeting then unanimously vote the impostor out.
    game.step(
      PLAYER_IDS.map((id) =>
        id === PLAYER_IDS[0]
          ? inputFor(id, { buttons: PlayerInputButton.CALL_MEETING })
          : inputFor(id),
      ),
      DT_MS,
    );
    expect(game.phase).toBe('meeting');
    if (game.meeting) {
      game.meeting.stage = 'voting';
      game.meeting.discussionTicksRemaining = 0;
    }
    game.step(
      PLAYER_IDS.map((id) =>
        inputFor(id, { buttons: PlayerInputButton.VOTE_CAST, targetId: impostorId }),
      ),
      DT_MS,
    );
    expect(game.isAlive(impostorId)).toBe(false);
    expect(game.winner).toBe('crewmate');
    expect(game.winReason).toBe('impostors_eliminated');
    expect(game.phase).toBe('ended');
  });
});
