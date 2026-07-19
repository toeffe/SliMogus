import { KeyboardController } from '@core/controls';
import { GameState } from '@game/gameState';
import { findReportableBody } from '@game/bodies';
import { KILL_RANGE_PX } from '@game/kill';
import type { Role } from '@game/roles';
import {
  canStartSabotage,
  getLightsPanel,
  getReactorPanelA,
  getReactorPanelB,
  isPlayerNearPanel,
  type SabotageState,
} from '@game/sabotage';
import {
  getTaskStation,
  getTaskStationIndex,
  TASK_INTERACT_RANGE_PX,
  type AssignedTask,
} from '@game/tasks';
import { findNearestVent, getVents } from '@game/vents';
import type { WinReason, Winner } from '@game/winCondition';
import { INPUT_VERSION, NO_TARGET, PlayerInputButton, type PlayerInput } from '@sim/input';
import type { TickBuffer } from '@sim/tickBuffer';
import { getRoomAtWorld, type TileMap } from '@sim/tilemap';
import { length, sub } from '@sim/vector2';
import type { NetworkBridge } from '@net/networkBridge';
import type { PlayerInfo } from '@net/protocol';
import { DEFAULT_CHARACTER_ID } from '@render/characterRoster';
import { INPUT_DELAY_TICKS } from '@constants';
import type { ViewSnapshot } from './viewSnapshot';

export type InteractPrompt =
  | 'use'
  | 'report'
  | 'kill'
  | 'vent'
  | 'fix'
  | 'emergency'
  | 'sabotage-lights'
  | 'sabotage-reactor'
  | null;

export interface MatchDriver {
  update: (dtMs: number, tick: number) => void;
  /** True when lockstep is waiting on peer input — GameLoop must not advance tick. */
  shouldHoldTick: () => boolean;
  getViewSnapshot: () => ViewSnapshot;
  getStateHash: () => string;
  getLocalRole: () => Role | undefined;
  getMapId: () => string;
  getLocalTasks: () => readonly AssignedTask[];
  getPhase: () => GameState['phase'];
  getMeeting: () => GameState['meeting'];
  getSabotage: () => Readonly<SabotageState>;
  getWinner: () => Winner | null;
  getWinReason: () => WinReason | null;
  getRoles: () => ReadonlyMap<number, Role>;
  isAlive: (playerId: number) => boolean;
  getKillCooldownTicks: () => number;
  getBodyCount: () => number;
  getLocalRoomName: () => string | null;
  getCrewTaskProgress: () => { completed: number; total: number };
  getAliveCounts: () => { crewmates: number; impostors: number; total: number };
  getNearestInteractPrompt: () => InteractPrompt;
  getNearestTaskStationId: () => string | null;
  getMatchSeed: () => string;
  setMovementLocked: (locked: boolean) => void;
  /** FPS: rotate WASD into world axes before packing PlayerInput. */
  setFacingYaw: (yaw: number) => void;
  queueTaskComplete: (stationId: string) => void;
  queueVote: (targetId: number | 'skip') => void;
  getPositions: () => { id: number; x: number; y: number; alive: boolean }[];
  destroy: () => void;
}

export interface MatchDriverOptions {
  seed: string;
  players: readonly PlayerInfo[];
  localPlayerId: number;
  tickBuffer: TickBuffer;
  networkBridge: NetworkBridge;
  tileMap: TileMap;
  impostorCount: number;
  taskCount: number;
  onTaskUsePress?: (stationId: string) => void;
}

function resolveKillTarget(gameState: GameState, localPlayerId: number, buttons: number): number {
  if ((buttons & PlayerInputButton.KILL) === 0) return NO_TARGET;
  if (gameState.getRole(localPlayerId) !== 'impostor') return NO_TARGET;
  if (!gameState.isAlive(localPlayerId)) return NO_TARGET;
  const self = gameState.simulation.world.getEntity(localPlayerId);
  if (!self) return NO_TARGET;

  let bestId = NO_TARGET;
  let bestDistance = Infinity;
  for (const entity of gameState.simulation.world.listEntities()) {
    if (entity.id === localPlayerId) continue;
    if (!gameState.isAlive(entity.id)) continue;
    if (gameState.getRole(entity.id) === 'impostor') continue;
    const distance = length(sub(self.position, entity.position));
    if (distance > KILL_RANGE_PX) continue;
    if (distance < bestDistance || (distance === bestDistance && entity.id < bestId)) {
      bestDistance = distance;
      bestId = entity.id;
    }
  }
  return bestId;
}

function nearestInteractPrompt(gameState: GameState, localPlayerId: number): InteractPrompt {
  if (gameState.phase !== 'playing') return null;
  const self = gameState.simulation.world.getEntity(localPlayerId);
  if (!self) return null;
  const alive = gameState.isAlive(localPlayerId);
  const role = gameState.getRole(localPlayerId);
  const sabotage = gameState.getSabotage();

  if (alive && findReportableBody(self.position, gameState.getBodies())) return 'report';

  if (alive && role === 'impostor' && gameState.getKillCooldownTicks(localPlayerId) <= 0) {
    for (const entity of gameState.simulation.world.listEntities()) {
      if (entity.id === localPlayerId) continue;
      if (!gameState.isAlive(entity.id)) continue;
      if (gameState.getRole(entity.id) === 'impostor') continue;
      if (length(sub(self.position, entity.position)) <= KILL_RANGE_PX) return 'kill';
    }
  }

  if (alive && role === 'impostor' && findNearestVent(self.position, getVents(gameState.mapId))) {
    return 'vent';
  }

  if (
    alive &&
    role === 'crewmate' &&
    sabotage.active === 'lights' &&
    isPlayerNearPanel(self.position, getLightsPanel(gameState.mapId))
  ) {
    return 'fix';
  }
  if (
    alive &&
    role === 'crewmate' &&
    sabotage.active === 'reactor' &&
    (isPlayerNearPanel(self.position, getReactorPanelA(gameState.mapId)) ||
      isPlayerNearPanel(self.position, getReactorPanelB(gameState.mapId)))
  ) {
    return 'fix';
  }

  for (const task of gameState.getTasks(localPlayerId)) {
    if (task.completed) continue;
    // Impostors only get fake task lists — they cannot interact with stations.
    if (role === 'impostor') break;
    const station = getTaskStation(task.stationId, gameState.mapId);
    if (!station) continue;
    if (length(sub(self.position, station.position)) <= TASK_INTERACT_RANGE_PX) return 'use';
  }

  if (alive && role === 'impostor' && canStartSabotage(sabotage)) {
    return 'sabotage-lights';
  }

  if (alive) return 'emergency';
  return null;
}

function nearestIncompleteTaskStationId(
  gameState: GameState,
  localPlayerId: number,
): string | null {
  const self = gameState.simulation.world.getEntity(localPlayerId);
  if (!self) return null;
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const task of gameState.getTasks(localPlayerId)) {
    if (task.completed) continue;
    const station = getTaskStation(task.stationId, gameState.mapId);
    if (!station) continue;
    const distance = length(sub(self.position, station.position));
    if (distance > TASK_INTERACT_RANGE_PX) continue;
    if (distance < bestDistance || (distance === bestDistance && station.id < (bestId ?? ''))) {
      bestDistance = distance;
      bestId = station.id;
    }
  }
  return bestId;
}

function localInputForPlayer(
  tick: number,
  playerId: number,
  controls: KeyboardController,
  gameState: GameState,
  suppressUse: boolean,
): PlayerInput {
  const { moveX, moveY } = controls.getMovement();
  let buttons = controls.getHeldButtons();
  if (suppressUse || controls.isMovementLocked()) {
    buttons &= ~PlayerInputButton.USE;
  }
  const queued = controls.takeQueuedAction();
  if (queued) buttons |= queued.button;
  const targetId = queued ? queued.targetId : resolveKillTarget(gameState, playerId, buttons);
  return {
    version: INPUT_VERSION,
    seq: tick,
    playerId,
    moveX,
    moveY,
    buttons,
    targetId,
    lookYaw: controls.getFacingYaw(),
    flashlightOn: controls.isFlashlightOn() ? 1 : 0,
  };
}

/** Crewmate can contribute to fixing the active sabotage from this position. */
function canFixSabotageHere(gameState: GameState, localPlayerId: number): boolean {
  if (gameState.getRole(localPlayerId) !== 'crewmate') return false;
  if (!gameState.isAlive(localPlayerId)) return false;
  const self = gameState.simulation.world.getEntity(localPlayerId);
  if (!self) return false;
  const sabotage = gameState.getSabotage();
  if (sabotage.active === 'lights') {
    return isPlayerNearPanel(self.position, getLightsPanel(gameState.mapId));
  }
  if (sabotage.active === 'reactor') {
    return (
      isPlayerNearPanel(self.position, getReactorPanelA(gameState.mapId)) ||
      isPlayerNearPanel(self.position, getReactorPanelB(gameState.mapId))
    );
  }
  return false;
}

/**
 * Owns GameState + lockstep input. Renderer-agnostic — views sync from
 * `getViewSnapshot()` each tick.
 */
export function createMatchDriver(options: MatchDriverOptions): MatchDriver {
  const {
    seed,
    players,
    localPlayerId,
    tickBuffer,
    networkBridge,
    tileMap,
    impostorCount,
    taskCount,
    onTaskUsePress,
  } = options;
  const playerIds = players.map((player) => player.playerId);
  const playerInfoById = new Map(players.map((player) => [player.playerId, player]));
  const gameState = GameState.create({ seed, playerIds, tileMap, impostorCount, taskCount });
  const controls = new KeyboardController();
  /** Next simulation tick to execute once every player's input is buffered. */
  let nextSimTick = 0;
  let lastSimTick = -1;
  /** Set each update: pause wall-clock tick while missing peer inputs for the delayed sim tick. */
  let holdTick = false;

  const update = (dtMs: number, tick: number): void => {
    const useEdge = controls.consumeUseEdge();
    const localRole = gameState.getRole(localPlayerId);
    const fixingSabotage = canFixSabotageHere(gameState, localPlayerId);
    // Crew only: open assigned stations. Never open a task while holding E to fix sabotage.
    const stationId =
      localRole === 'impostor' || fixingSabotage
        ? null
        : nearestIncompleteTaskStationId(gameState, localPlayerId);
    // Strip USE only for task-station proximity — sabotage fix *requires* held USE.
    const suppressUse = (!fixingSabotage && stationId !== null) || controls.isMovementLocked();
    if (!controls.isMovementLocked() && useEdge && stationId) {
      onTaskUsePress?.(stationId);
    }

    const localInput = localInputForPlayer(tick, localPlayerId, controls, gameState, suppressUse);
    networkBridge.sendLocalInput(localInput);

    // Lockstep: only step ticks that have every player's input; catch up when late frames arrive.
    while (nextSimTick <= tick - INPUT_DELAY_TICKS && tickBuffer.hasAll(nextSimTick, playerIds)) {
      gameState.step(tickBuffer.resolve(nextSimTick), dtMs);
      tickBuffer.clearUpTo(nextSimTick);
      networkBridge.recordLocalTick(nextSimTick, gameState.getStateHash());
      lastSimTick = nextSimTick;
      nextSimTick += 1;
    }

    const wantSim = nextSimTick <= tick - INPUT_DELAY_TICKS;
    const hasAll = wantSim ? tickBuffer.hasAll(nextSimTick, playerIds) : false;
    holdTick = wantSim && !hasAll;
  };

  const getViewSnapshot = (): ViewSnapshot => {
    const localIsGhost = !gameState.isAlive(localPlayerId);
    const entities = gameState.simulation.world.listEntities().map((entity) => {
      const info = playerInfoById.get(entity.id);
      return {
        id: entity.id,
        x: entity.position.x,
        y: entity.position.y,
        vx: entity.velocity.x,
        vy: entity.velocity.y,
        facingYaw: entity.facingYaw,
        flashlightOn: entity.flashlightOn !== 0,
        color: info?.color ?? 0x888888,
        name: info?.name ?? `P${entity.id}`,
        characterId: info?.characterId ?? DEFAULT_CHARACTER_ID,
        alive: gameState.isAlive(entity.id),
        role: gameState.getRole(entity.id),
      };
    });
    const bodies = gameState.getBodies().map((body) => {
      const info = playerInfoById.get(body.victimPlayerId);
      return {
        victimPlayerId: body.victimPlayerId,
        x: body.position.x,
        y: body.position.y,
        color: info?.color ?? 0x888888,
        characterId: info?.characterId ?? DEFAULT_CHARACTER_ID,
      };
    });
    const local = gameState.simulation.world.getEntity(localPlayerId);
    return {
      simTick: lastSimTick,
      localPlayerId,
      localIsGhost,
      localX: local?.position.x ?? 0,
      localY: local?.position.y ?? 0,
      lightsOut: gameState.getSabotage().active === 'lights',
      phase: gameState.phase,
      entities,
      bodies,
    };
  };

  return {
    update,
    getViewSnapshot,
    getStateHash: () => gameState.getStateHash(),
    getLocalRole: () => gameState.getRole(localPlayerId),
    getMapId: () => gameState.mapId,
    getLocalTasks: () => gameState.getTasks(localPlayerId),
    getPhase: () => gameState.phase,
    getMeeting: () => gameState.meeting,
    getSabotage: () => gameState.getSabotage(),
    getWinner: () => gameState.winner,
    getWinReason: () => gameState.winReason,
    getRoles: () => gameState.getRoles(),
    isAlive: (playerId) => gameState.isAlive(playerId),
    getKillCooldownTicks: () => gameState.getKillCooldownTicks(localPlayerId),
    getBodyCount: () => gameState.getBodies().length,
    getLocalRoomName: () => {
      const entity = gameState.simulation.world.getEntity(localPlayerId);
      if (!entity) return null;
      return getRoomAtWorld(tileMap, entity.position.x, entity.position.y)?.name ?? 'Corridor';
    },
    getCrewTaskProgress: () => {
      let completed = 0;
      let total = 0;
      for (const [playerId, role] of gameState.getRoles()) {
        if (role === 'impostor') continue;
        for (const task of gameState.getTasks(playerId)) {
          total += 1;
          if (task.completed) completed += 1;
        }
      }
      return { completed, total };
    },
    getAliveCounts: () => {
      let crewmates = 0;
      let impostors = 0;
      for (const [playerId, role] of gameState.getRoles()) {
        if (!gameState.isAlive(playerId)) continue;
        if (role === 'impostor') impostors += 1;
        else crewmates += 1;
      }
      return { crewmates, impostors, total: crewmates + impostors };
    },
    getNearestInteractPrompt: () => nearestInteractPrompt(gameState, localPlayerId),
    getNearestTaskStationId: () => nearestIncompleteTaskStationId(gameState, localPlayerId),
    getMatchSeed: () => seed,
    shouldHoldTick: () => holdTick,
    setMovementLocked: (locked) => controls.setMovementLocked(locked),
    setFacingYaw: (yaw) => controls.setFacingYaw(yaw),
    queueTaskComplete: (stationId) => {
      const index = getTaskStationIndex(stationId, gameState.mapId);
      if (index < 0) return;
      controls.queueAction(PlayerInputButton.TASK_COMPLETE, index);
    },
    queueVote: (targetId) => {
      if (targetId === 'skip') {
        controls.queueAction(PlayerInputButton.VOTE_SKIP, NO_TARGET);
      } else {
        controls.queueAction(PlayerInputButton.VOTE_CAST, targetId);
      }
    },
    getPositions: () =>
      gameState.simulation.world.listEntities().map((entity) => ({
        id: entity.id,
        x: entity.position.x,
        y: entity.position.y,
        alive: gameState.isAlive(entity.id),
      })),
    destroy: () => {
      controls.destroy();
    },
  };
}
