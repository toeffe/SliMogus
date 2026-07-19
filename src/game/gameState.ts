import { NO_TARGET, PlayerInputButton, type PlayerInput } from '@sim/input';
import { Simulation, type SimulationConfig } from '@sim/simulation';
import type { Snapshot } from '@sim/snapshot';
import type { TileMap } from '@sim/tilemap';
import { sub, length, vec2 } from '@sim/vector2';
import { findReportableBody, type Body } from './bodies';
import { KILL_COOLDOWN_TICKS, validateKill } from './kill';
import {
  advanceMeetingTimers,
  createMeetingState,
  EMERGENCY_MEETINGS_PER_PLAYER,
  tallyVotes,
  VOTE_SKIP_TARGET,
  type MeetingState,
} from './meeting';
import { assignRoles, type Role } from './roles';
import {
  createIdleSabotageState,
  getLightsPanel,
  getReactorPanelA,
  getReactorPanelB,
  isPlayerNearPanel,
  LIGHTS_FIX_DURATION_TICKS,
  resolveSabotage,
  tryStartSabotage,
  type SabotageState,
  type SabotageType,
} from './sabotage';
import {
  assignTasks,
  getTaskStationByIndex,
  TASK_INTERACT_RANGE_PX,
  type AssignedTask,
} from './tasks';
import { findNearestVent, getVent, getVents, VENT_COOLDOWN_TICKS } from './vents';
import { evaluateWinCondition, type WinReason, type Winner } from './winCondition';
import { collectPoiClearWorld } from './poiClear';

/**
 * `'playing'` advances `Simulation` every tick; `'meeting'`/`'ended'` freeze
 * it for free by simply skipping `Simulation.step` (see `GameState.step`).
 */
export type GamePhase = 'playing' | 'meeting' | 'ended';

export interface GameStateConfig {
  seed: string;
  playerIds: readonly number[];
  tileMap?: TileMap;
  impostorCount: number;
  taskCount: number;
}

export interface MeetingSnapshot {
  reason: MeetingState['reason'];
  reportedBy: number;
  bodyId: number | null;
  stage: MeetingState['stage'];
  discussionTicksRemaining: number;
  votingTicksRemaining: number;
  resultsTicksRemaining: number;
  votes: [number, number][];
  ejectedPlayerId: number | null;
  tallied: boolean;
}

export interface SabotageSnapshot {
  active: SabotageType | null;
  ticksRemaining: number;
  cooldownTicks: number;
  lightsFixProgress: number;
  reactorPanelAHeldBy: number | null;
  reactorPanelBHeldBy: number | null;
}

/** Plain-object serialization mirroring `Simulation`'s own `Snapshot`, composed with the game-specific fields layered on top of it. */
export interface GameSnapshot {
  simulation: Snapshot;
  phase: GamePhase;
  roles: [number, Role][];
  tasks: [number, AssignedTask[]][];
  alive: [number, boolean][];
  killCooldowns: [number, number][];
  emergencyMeetings: [number, number][];
  ventCooldowns: [number, number][];
  bodies: Body[];
  nextBodyId: number;
  meeting: MeetingSnapshot | null;
  sabotage: SabotageSnapshot;
  winner: Winner | null;
  winReason: WinReason | null;
}

/**
 * Top-level Among-Us-specific game state, composing a `Simulation` (Phase
 * 1-3's game-rule-agnostic engine) with roles/tasks/kills/bodies/meetings/
 * sabotages/vents/win conditions. Deliberately does not touch
 * `@sim/hash.ts`/`snapshot.ts` themselves: `getStateHash`/`getSnapshot`
 * each do a second pass that layers game-specific fields on top of
 * `Simulation`'s own hash/snapshot instead.
 */
export class GameState {
  phase: GamePhase;
  winner: Winner | null = null;
  winReason: WinReason | null = null;
  meeting: MeetingState | null = null;
  /** Active tilemap id (`omega`, `helix`, …) for POI lookups. */
  readonly mapId: string;

  private nextBodyId = 1;
  private readonly bodies: Body[] = [];
  private readonly alive = new Map<number, boolean>();
  private readonly killCooldowns = new Map<number, number>();
  private readonly emergencyMeetings = new Map<number, number>();
  private readonly ventCooldowns = new Map<number, number>();
  private readonly sabotage: SabotageState;

  private constructor(
    readonly simulation: Simulation,
    private readonly roles: ReadonlyMap<number, Role>,
    private readonly tasks: Map<number, AssignedTask[]>,
    phase: GamePhase,
    sabotage: SabotageState,
    mapId: string,
  ) {
    this.phase = phase;
    this.sabotage = sabotage;
    this.mapId = mapId;
  }

  static create(config: GameStateConfig): GameState {
    const sortedPlayerIds = [...config.playerIds].sort((a, b) => a - b);
    const mapId = config.tileMap?.id ?? 'omega';
    const simulationConfig: SimulationConfig = {
      seed: config.seed,
      playerIds: sortedPlayerIds,
      tileMap: config.tileMap,
      clearWorld: collectPoiClearWorld(config.tileMap?.tileSize ?? 32, mapId),
    };
    const simulation = Simulation.create(simulationConfig);
    const roles = assignRoles(config.seed, sortedPlayerIds, config.impostorCount);
    const tasks = new Map(
      sortedPlayerIds.map((playerId) => [
        playerId,
        assignTasks(config.seed, playerId, config.taskCount, mapId),
      ]),
    );
    const game = new GameState(
      simulation,
      roles,
      tasks,
      'playing',
      createIdleSabotageState(),
      mapId,
    );
    for (const playerId of sortedPlayerIds) {
      game.alive.set(playerId, true);
      game.killCooldowns.set(playerId, 0);
      game.emergencyMeetings.set(playerId, EMERGENCY_MEETINGS_PER_PLAYER);
      game.ventCooldowns.set(playerId, 0);
    }
    return game;
  }

  static fromSnapshot(snapshot: GameSnapshot, seed: string, tileMap?: TileMap): GameState {
    const mapId = tileMap?.id ?? 'omega';
    const simulation = Simulation.fromSnapshot(
      snapshot.simulation,
      seed,
      tileMap,
      collectPoiClearWorld(tileMap?.tileSize ?? 32, mapId),
    );
    const tasks = new Map(
      snapshot.tasks.map(([playerId, playerTasks]) => [
        playerId,
        playerTasks.map((task) => ({ ...task })),
      ]),
    );
    const sabotage: SabotageState = { ...snapshot.sabotage };
    const game = new GameState(
      simulation,
      new Map(snapshot.roles),
      tasks,
      snapshot.phase,
      sabotage,
      mapId,
    );
    for (const [playerId, isAlive] of snapshot.alive) game.alive.set(playerId, isAlive);
    for (const [playerId, ticks] of snapshot.killCooldowns) game.killCooldowns.set(playerId, ticks);
    for (const [playerId, remaining] of snapshot.emergencyMeetings) {
      game.emergencyMeetings.set(playerId, remaining);
    }
    for (const [playerId, ticks] of snapshot.ventCooldowns) game.ventCooldowns.set(playerId, ticks);
    game.nextBodyId = snapshot.nextBodyId;
    for (const body of snapshot.bodies) {
      game.bodies.push({
        id: body.id,
        victimPlayerId: body.victimPlayerId,
        position: vec2(body.position.x, body.position.y),
        reported: body.reported,
      });
    }
    if (snapshot.meeting) {
      game.meeting = {
        ...snapshot.meeting,
        votes: new Map(snapshot.meeting.votes),
      };
    }
    game.winner = snapshot.winner;
    game.winReason = snapshot.winReason;
    return game;
  }

  getRole(playerId: number): Role | undefined {
    return this.roles.get(playerId);
  }

  isAlive(playerId: number): boolean {
    return this.alive.get(playerId) ?? false;
  }

  getKillCooldownTicks(playerId: number): number {
    return this.killCooldowns.get(playerId) ?? 0;
  }

  getEmergencyMeetingsRemaining(playerId: number): number {
    return this.emergencyMeetings.get(playerId) ?? 0;
  }

  getBodies(): readonly Body[] {
    return this.bodies;
  }

  getSabotage(): Readonly<SabotageState> {
    return this.sabotage;
  }

  /** The player's assigned task list (crewmate: real; impostor: visually-identical fake). Empty for an unknown player id. */
  getTasks(playerId: number): readonly AssignedTask[] {
    return this.tasks.get(playerId) ?? [];
  }

  getRoles(): ReadonlyMap<number, Role> {
    return this.roles;
  }

  /**
   * Advances the game by one tick. Resolves discrete actions in the same
   * ascending-id/host-priority order `TickBuffer.resolve` already returns
   * `inputs` in, ticks cooldowns/sabotage/meeting timers, then — only while
   * `phase === 'playing'` — advances movement. A meeting simply never calls
   * `simulation.step`, so every entity freezes in place for free.
   */
  step(inputs: readonly PlayerInput[], dtMs: number): void {
    if (this.phase === 'ended') return;

    this.tickCooldowns();

    if (this.phase === 'meeting') {
      if (this.meeting) {
        this.applyMeetingInputs(inputs);
        this.stepMeeting();
      }
      // Reactor keeps counting down during meetings (critical sabotage doesn't pause).
      this.stepSabotageTimersOnly();
      return;
    }

    // Reset per-tick reactor hold tracking before applying this tick's USE holds.
    this.sabotage.reactorPanelAHeldBy = null;
    this.sabotage.reactorPanelBHeldBy = null;

    for (const input of inputs) {
      this.applyActions(input);
    }

    this.stepSabotage();

    if (this.phase === 'playing') {
      // Ghosts still move; living/dead filter is only for collision (ignoresCollision).
      this.simulation.step(inputs, dtMs);
    }

    this.checkWin(false);
  }

  getStateHash(): string {
    const rolesPart = [...this.roles.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([playerId, role]) => `${playerId}:${role}`)
      .join(',');
    const tasksPart = [...this.tasks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(
        ([playerId, playerTasks]) =>
          `${playerId}:${playerTasks.map((task) => `${task.stationId}=${task.completed ? 1 : 0}:${task.progressTicks}`).join(';')}`,
      )
      .join(',');
    const alivePart = [...this.alive.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, isAlive]) => `${id}:${isAlive ? 1 : 0}`)
      .join(',');
    const cooldownPart = [...this.killCooldowns.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, ticks]) => `${id}:${ticks}`)
      .join(',');
    const emergencyPart = [...this.emergencyMeetings.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, n]) => `${id}:${n}`)
      .join(',');
    const ventPart = [...this.ventCooldowns.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, ticks]) => `${id}:${ticks}`)
      .join(',');
    const bodiesPart = this.bodies
      .map(
        (body) =>
          `${body.id}:${body.victimPlayerId}:${body.position.x.toFixed(2)}:${body.position.y.toFixed(2)}:${body.reported ? 1 : 0}`,
      )
      .join(';');
    const meetingPart = this.meeting
      ? [
          this.meeting.reason,
          this.meeting.reportedBy,
          this.meeting.bodyId ?? -1,
          this.meeting.stage,
          this.meeting.discussionTicksRemaining,
          this.meeting.votingTicksRemaining,
          this.meeting.resultsTicksRemaining,
          this.meeting.ejectedPlayerId ?? -1,
          this.meeting.tallied ? 1 : 0,
          [...this.meeting.votes.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([v, t]) => `${v}>${t}`)
            .join(','),
        ].join(':')
      : 'none';
    const sabotagePart = [
      this.sabotage.active ?? 'none',
      this.sabotage.ticksRemaining,
      this.sabotage.cooldownTicks,
      this.sabotage.lightsFixProgress,
      this.sabotage.reactorPanelAHeldBy ?? -1,
      this.sabotage.reactorPanelBHeldBy ?? -1,
    ].join(':');
    return [
      this.simulation.getStateHash(),
      `phase:${this.phase}`,
      `roles:${rolesPart}`,
      `tasks:${tasksPart}`,
      `alive:${alivePart}`,
      `killCd:${cooldownPart}`,
      `emg:${emergencyPart}`,
      `ventCd:${ventPart}`,
      `bodies:${bodiesPart}`,
      `meeting:${meetingPart}`,
      `sab:${sabotagePart}`,
      `win:${this.winner ?? 'none'}:${this.winReason ?? 'none'}`,
    ].join('|');
  }

  getSnapshot(): GameSnapshot {
    return {
      simulation: this.simulation.getSnapshot(),
      phase: this.phase,
      roles: [...this.roles.entries()],
      tasks: [...this.tasks.entries()].map(([playerId, playerTasks]) => [
        playerId,
        playerTasks.map((task) => ({ ...task })),
      ]),
      alive: [...this.alive.entries()],
      killCooldowns: [...this.killCooldowns.entries()],
      emergencyMeetings: [...this.emergencyMeetings.entries()],
      ventCooldowns: [...this.ventCooldowns.entries()],
      bodies: this.bodies.map((body) => ({
        id: body.id,
        victimPlayerId: body.victimPlayerId,
        position: { x: body.position.x, y: body.position.y },
        reported: body.reported,
      })),
      nextBodyId: this.nextBodyId,
      meeting: this.meeting
        ? {
            reason: this.meeting.reason,
            reportedBy: this.meeting.reportedBy,
            bodyId: this.meeting.bodyId,
            stage: this.meeting.stage,
            discussionTicksRemaining: this.meeting.discussionTicksRemaining,
            votingTicksRemaining: this.meeting.votingTicksRemaining,
            resultsTicksRemaining: this.meeting.resultsTicksRemaining,
            votes: [...this.meeting.votes.entries()],
            ejectedPlayerId: this.meeting.ejectedPlayerId,
            tallied: this.meeting.tallied,
          }
        : null,
      sabotage: { ...this.sabotage },
      winner: this.winner,
      winReason: this.winReason,
    };
  }

  private tickCooldowns(): void {
    for (const [playerId, ticks] of this.killCooldowns) {
      if (ticks > 0) this.killCooldowns.set(playerId, ticks - 1);
    }
    for (const [playerId, ticks] of this.ventCooldowns) {
      if (ticks > 0) this.ventCooldowns.set(playerId, ticks - 1);
    }
    if (this.sabotage.cooldownTicks > 0) this.sabotage.cooldownTicks -= 1;
  }

  private applyActions(input: PlayerInput): void {
    if (this.phase !== 'playing') return;
    const playerId = input.playerId;
    if (!this.alive.get(playerId)) {
      // Ghosts may still finish tasks (crew win path); nothing else.
      if (input.buttons & PlayerInputButton.TASK_COMPLETE) this.applyTaskComplete(input);
      return;
    }

    if (input.buttons & PlayerInputButton.KILL) this.applyKill(input);
    if (input.buttons & PlayerInputButton.REPORT) this.applyReport(input);
    if (input.buttons & PlayerInputButton.CALL_MEETING) this.applyEmergencyMeeting(input);
    if (input.buttons & PlayerInputButton.SABOTAGE_LIGHTS)
      this.applySabotageTrigger(input, 'lights');
    if (input.buttons & PlayerInputButton.SABOTAGE_REACTOR) {
      this.applySabotageTrigger(input, 'reactor');
    }
    if (input.buttons & PlayerInputButton.TASK_COMPLETE) this.applyTaskComplete(input);
    if (input.buttons & PlayerInputButton.USE) {
      this.applyVentUse(input);
      this.applySabotageFixUse(input);
    }
  }

  private applyKill(input: PlayerInput): void {
    const entity = this.simulation.world.getEntity(input.playerId);
    if (!entity) return;
    const victimId = validateKill({
      killerId: input.playerId,
      killerAlive: this.alive.get(input.playerId) === true,
      killerIsImpostor: this.roles.get(input.playerId) === 'impostor',
      killerPosition: entity.position,
      killCooldownTicks: this.killCooldowns.get(input.playerId) ?? 0,
      suggestedTargetId: input.targetId,
      candidates: [...this.roles.keys()].map((playerId) => {
        const candidateEntity = this.simulation.world.getEntity(playerId);
        return {
          playerId,
          position: candidateEntity?.position ?? vec2(0, 0),
          alive: this.alive.get(playerId) === true,
          isImpostor: this.roles.get(playerId) === 'impostor',
        };
      }),
    });
    if (victimId === undefined) return;

    const victim = this.simulation.world.getEntity(victimId);
    if (!victim) return;
    this.alive.set(victimId, false);
    victim.ignoresCollision = true;
    victim.velocity = vec2(0, 0);
    this.bodies.push({
      id: this.nextBodyId,
      victimPlayerId: victimId,
      position: vec2(victim.position.x, victim.position.y),
      reported: false,
    });
    this.nextBodyId += 1;
    this.killCooldowns.set(input.playerId, KILL_COOLDOWN_TICKS);
    this.checkWin(false);
  }

  private applyReport(input: PlayerInput): void {
    if (this.phase !== 'playing') return;
    const entity = this.simulation.world.getEntity(input.playerId);
    if (!entity || !this.alive.get(input.playerId)) return;
    const body = findReportableBody(entity.position, this.bodies);
    if (!body) return;
    body.reported = true;
    this.beginMeeting({ reason: 'body', reportedBy: input.playerId, bodyId: body.id });
  }

  private applyEmergencyMeeting(input: PlayerInput): void {
    if (this.phase !== 'playing') return;
    if (!this.alive.get(input.playerId)) return;
    const remaining = this.emergencyMeetings.get(input.playerId) ?? 0;
    if (remaining <= 0) return;
    // No active critical sabotage block for emergency in this simplified ruleset.
    this.emergencyMeetings.set(input.playerId, remaining - 1);
    this.beginMeeting({ reason: 'emergency', reportedBy: input.playerId, bodyId: null });
  }

  private beginMeeting(options: {
    reason: MeetingState['reason'];
    reportedBy: number;
    bodyId: number | null;
  }): void {
    this.bodies.length = 0;
    this.meeting = createMeetingState(options);
    this.phase = 'meeting';
    // Active non-critical sabotages persist; reactor continues counting during meetings.
  }

  private applyMeetingInputs(inputs: readonly PlayerInput[]): void {
    if (!this.meeting || this.meeting.stage !== 'voting') return;
    for (const input of inputs) {
      if (!this.alive.get(input.playerId)) continue;
      if (this.meeting.votes.has(input.playerId)) continue;
      if (input.buttons & PlayerInputButton.VOTE_SKIP) {
        this.meeting.votes.set(input.playerId, VOTE_SKIP_TARGET);
      } else if (input.buttons & PlayerInputButton.VOTE_CAST && input.targetId !== NO_TARGET) {
        if (this.alive.get(input.targetId)) {
          this.meeting.votes.set(input.playerId, input.targetId);
        }
      }
    }
  }

  private stepMeeting(): void {
    if (!this.meeting) return;

    // Tally early once every living player has voted.
    if (this.meeting.stage === 'voting' && this.allLivingHaveVoted()) {
      this.tallyAndApplyEjection();
      // `checkWin` may have ended the game and cleared `meeting` — don't touch it then.
      if (this.meeting) {
        this.meeting.stage = 'results';
        this.meeting.votingTicksRemaining = 0;
      }
      return;
    }

    const previousStage = this.meeting.stage;
    const status = advanceMeetingTimers(this.meeting);

    // Tally the moment discussion/voting timers push us into results.
    if (previousStage === 'voting' && this.meeting.stage === 'results') {
      this.tallyAndApplyEjection();
    }

    if (status === 'finished') {
      this.meeting = null;
      if (this.phase !== 'ended') this.phase = 'playing';
      this.checkWin(false);
    }
  }

  private allLivingHaveVoted(): boolean {
    if (!this.meeting) return false;
    let livingCount = 0;
    for (const [playerId, isAlive] of this.alive) {
      if (!isAlive) continue;
      livingCount += 1;
      if (!this.meeting.votes.has(playerId)) return false;
    }
    return livingCount > 0;
  }

  private tallyAndApplyEjection(): void {
    if (!this.meeting || this.meeting.tallied) return;
    const livingVoters = new Set<number>();
    const livingCandidates = new Set<number>();
    for (const [playerId, isAlive] of this.alive) {
      if (!isAlive) continue;
      livingVoters.add(playerId);
      livingCandidates.add(playerId);
    }
    const ejected = tallyVotes(this.meeting.votes, livingVoters, livingCandidates);
    this.meeting.ejectedPlayerId = ejected;
    this.meeting.tallied = true;
    if (ejected !== null) {
      this.alive.set(ejected, false);
      const entity = this.simulation.world.getEntity(ejected);
      if (entity) {
        entity.ignoresCollision = true;
        entity.velocity = vec2(0, 0);
      }
    }
    this.checkWin(false);
  }

  /**
   * Discrete minigame completion. `targetId` is the index into `TASK_STATIONS`.
   * Validated against range + assignment so forged completes can't finish a
   * station the player isn't standing on / wasn't given.
   */
  private applyTaskComplete(input: PlayerInput): void {
    // Impostor tasks are camouflage only — never mark complete / count toward crew win.
    if (this.roles.get(input.playerId) === 'impostor') return;

    const station = getTaskStationByIndex(input.targetId, this.mapId);
    if (!station) return;
    const entity = this.simulation.world.getEntity(input.playerId);
    if (!entity) return;
    if (length(sub(entity.position, station.position)) > TASK_INTERACT_RANGE_PX) return;

    const playerTasks = this.tasks.get(input.playerId);
    if (!playerTasks) return;
    const task = playerTasks.find((entry) => entry.stationId === station.id);
    if (!task || task.completed) return;

    task.completed = true;
    task.progressTicks = station.durationTicks;
    this.checkWin(false);
  }

  private applyVentUse(input: PlayerInput): void {
    if (this.roles.get(input.playerId) !== 'impostor') return;
    if (!this.alive.get(input.playerId)) return;
    if ((this.ventCooldowns.get(input.playerId) ?? 0) > 0) return;
    const entity = this.simulation.world.getEntity(input.playerId);
    if (!entity) return;
    const vent = findNearestVent(entity.position, getVents(this.mapId));
    if (!vent) return;
    const linked = getVent(vent.linkedId, this.mapId);
    if (!linked) return;
    entity.position = vec2(linked.position.x, linked.position.y);
    entity.velocity = vec2(0, 0);
    this.ventCooldowns.set(input.playerId, VENT_COOLDOWN_TICKS);
  }

  private applySabotageTrigger(input: PlayerInput, type: SabotageType): void {
    if (this.roles.get(input.playerId) !== 'impostor') return;
    if (!this.alive.get(input.playerId)) return;
    tryStartSabotage(this.sabotage, type);
  }

  private applySabotageFixUse(input: PlayerInput): void {
    if (!this.alive.get(input.playerId)) return;
    if (this.roles.get(input.playerId) !== 'crewmate') return;
    const entity = this.simulation.world.getEntity(input.playerId);
    if (!entity) return;

    if (
      this.sabotage.active === 'lights' &&
      isPlayerNearPanel(entity.position, getLightsPanel(this.mapId))
    ) {
      this.sabotage.lightsFixProgress += 1;
      if (this.sabotage.lightsFixProgress >= LIGHTS_FIX_DURATION_TICKS) {
        resolveSabotage(this.sabotage);
      }
      return;
    }

    if (this.sabotage.active === 'reactor') {
      if (isPlayerNearPanel(entity.position, getReactorPanelA(this.mapId))) {
        this.sabotage.reactorPanelAHeldBy = input.playerId;
      }
      if (isPlayerNearPanel(entity.position, getReactorPanelB(this.mapId))) {
        this.sabotage.reactorPanelBHeldBy = input.playerId;
      }
    }
  }

  private stepSabotage(): void {
    if (this.sabotage.active === 'reactor') {
      const a = this.sabotage.reactorPanelAHeldBy;
      const b = this.sabotage.reactorPanelBHeldBy;
      if (a !== null && b !== null && a !== b) {
        resolveSabotage(this.sabotage);
        return;
      }
    }
    this.stepSabotageTimersOnly();
  }

  private stepSabotageTimersOnly(): void {
    if (this.sabotage.active !== 'reactor') return;
    this.sabotage.ticksRemaining -= 1;
    if (this.sabotage.ticksRemaining <= 0) {
      this.checkWin(true);
    }
  }

  private checkWin(reactorTimedOut: boolean): void {
    if (this.phase === 'ended') return;
    const result = evaluateWinCondition({
      roles: this.roles,
      alive: this.alive,
      tasks: this.tasks,
      reactorTimedOut,
    });
    if (!result) return;
    this.winner = result.winner;
    this.winReason = result.reason;
    this.phase = 'ended';
    this.meeting = null;
    if (reactorTimedOut && this.sabotage.active === 'reactor') {
      resolveSabotage(this.sabotage);
    }
  }
}
