import { createSimulationScene } from '@render/scene';
import { AudioBus } from '@core/audio';
import { loadSettings, type Settings } from '@core/settings';
import { createSignalingWizard, type SignalingWizardContext } from '@ui/signalingWizard';
import { createLobbyScreen } from '@ui/lobbyScreen';
import { createTaskHud } from '@ui/taskHud';
import { createTaskMinigame } from '@ui/taskMinigame';
import { createGameHud } from '@ui/gameHud';
import { createHelpOverlay } from '@ui/helpOverlay';
import { createKillFlash } from '@ui/killFlash';
import { createSettingsPanel } from '@ui/settingsPanel';
import { showRoleReveal } from '@ui/roleReveal';
import { createMeetingScreen } from '@ui/meetingScreen';
import { createVictoryScreen } from '@ui/victoryScreen';
import { createSabotageHud } from '@ui/sabotageHud';
import { getTaskStation, TASK_INTERACT_RANGE_PX } from '@game/tasks';
import { GameLoop } from '@core/loop';
import { logger } from '@core/logger';
import { APP_NAME, APP_VERSION } from '@constants';
import { TickBuffer } from '@sim/tickBuffer';
import { getTileMapById } from '@sim/tilemap';
import { NetworkBridge } from '@net/networkBridge';
import { PROTOCOL_VERSION } from '@net/protocol';
import type { LobbyState } from '@net/lobby';
import type { PeerMesh } from '@net/mesh';
import { isDev } from '@utils/env';

export type AppTeardown = () => void;

declare global {
  interface Window {
    /** Dev-only hooks so the Phase 2 live connectivity check (Playwright) can inspect real mesh topology and simulation state without needing UI-only signals. */
    __slimogusMesh?: PeerMesh;
    __slimogusGetStateHash?: () => string;
    /** Current loop tick — each of 3 real browser contexts advances independently in wall time, so "the current hash" alone isn't comparable across peers; callers should look up a shared past tick via `__slimogusGetHashAtTick` instead. */
    __slimogusGetCurrentTick?: () => number;
    __slimogusGetHashAtTick?: (tick: number) => string | undefined;
    /** Phase 4 gameplay hooks for the extended live connectivity check. */
    __slimogusGetPhase?: () => string;
    __slimogusQueueVote?: (targetId: number | 'skip') => void;
    __slimogusGetWinner?: () => string | null;
    __slimogusGetLocalRole?: () => string | undefined;
    __slimogusGetLocalPlayerId?: () => number;
    __slimogusGetPositions?: () => { id: number; x: number; y: number; alive: boolean }[];
  }
}

/** How often (in ticks) the running state hash is logged at debug level. */
const HASH_LOG_INTERVAL_TICKS = 60;
const FALLBACK_SEED = 'slimogus-fallback-seed';

/**
 * Top-level `'start' | 'lobby' | 'game'` state machine: the signaling
 * wizard bootstraps a `PeerMesh` (as host or joiner), the lobby screen
 * syncs player/ready state over it, and once everyone's ready the same
 * mesh feeds a `NetworkBridge` into Phase 4's `GameState` for real,
 * synchronized gameplay. Phase 5 polish (HUD/audio/help/settings) is
 * local-only and must not affect sim hashes.
 */
export async function bootstrapApp(root: HTMLElement): Promise<AppTeardown> {
  logger.info(`${APP_NAME} v${APP_VERSION} starting`);

  let teardownCurrentScreen: () => void = () => {};
  const audio = new AudioBus(loadSettings());
  const settingsPanel = createSettingsPanel(root, {
    onChange: (settings) => audio.applySettings(settings),
  });

  const onSettingsChanged = (event: Event): void => {
    const settings = (event as CustomEvent<Settings>).detail ?? loadSettings();
    audio.applySettings(settings);
  };
  window.addEventListener('slimogus:settings-changed', onSettingsChanged);

  // First click/key anywhere unlocks Web Audio (browser autoplay policy).
  const unlockAudio = (): void => {
    void audio.resume();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  function showWizard(): void {
    teardownCurrentScreen();
    const handle = createSignalingWizard(root, (context) => {
      logger.info(
        `${context.isHost ? 'Hosting' : 'Joined'} room ${context.roomCode} as player ${context.localPlayerId}`,
      );
      if (isDev) window.__slimogusMesh = context.mesh;
      showLobby(context);
    });
    teardownCurrentScreen = () => handle.destroy();
  }

  function showLobby(context: SignalingWizardContext): void {
    teardownCurrentScreen();
    const handle = createLobbyScreen(root, context, (lobbyState) => {
      logger.info('Game starting');
      void startGame(context, lobbyState);
    });
    teardownCurrentScreen = () => handle.destroy();
  }

  async function startGame(context: SignalingWizardContext, lobbyState: LobbyState): Promise<void> {
    teardownCurrentScreen();

    const returnToWizard = (): void => {
      // Prefer wizard over reusing the mesh — simpler and reliable after a win.
      try {
        context.mesh.close();
      } catch {
        // Mesh may already be closed.
      }
      if (isDev) {
        delete window.__slimogusMesh;
        delete window.__slimogusGetStateHash;
        delete window.__slimogusGetCurrentTick;
        delete window.__slimogusGetHashAtTick;
        delete window.__slimogusGetPhase;
        delete window.__slimogusQueueVote;
        delete window.__slimogusGetWinner;
        delete window.__slimogusGetLocalRole;
        delete window.__slimogusGetLocalPlayerId;
        delete window.__slimogusGetPositions;
      }
      showWizard();
    };

    const tickBuffer = new TickBuffer(lobbyState.hostPlayerId);
    const matchPlayerIds = lobbyState.players.map((player) => player.playerId);
    const readyPlayers = new Set<number>();
    let loopStarted = false;
    let gameLoop: GameLoop | null = null;
    let sceneApi: Awaited<ReturnType<typeof createSimulationScene>> | null = null;
    let roleRevealOpen = false;

    const setMatchHudHidden = (hidden: boolean): void => {
      for (const sel of ['.game-hud', '.task-hud'] as const) {
        const el = root.querySelector<HTMLElement>(sel);
        if (el) el.hidden = hidden;
      }
    };

    const startMatchLoop = (): void => {
      if (loopStarted || !gameLoop) return;
      loopStarted = true;
      root.querySelector('.match-gate')?.remove();
      sceneApi?.setChromeVisible(true);
      setMatchHudHidden(false);
      if (!roleRevealOpen && sceneApi?.getPhase() === 'playing') {
        sceneApi.setMovementLocked(false);
      }
      gameLoop.start();
      logger.info('Game loop started');
    };

    const maybeBroadcastMatchGo = (): void => {
      if (context.localPlayerId !== lobbyState.hostPlayerId) return;
      if (!matchPlayerIds.every((id) => readyPlayers.has(id))) return;
      context.mesh.broadcastReliable({ type: 'matchGo', version: PROTOCOL_VERSION });
      startMatchLoop();
    };

    const announceMatchReady = (): void => {
      readyPlayers.add(context.localPlayerId);
      context.mesh.broadcastReliable({
        type: 'matchReady',
        version: PROTOCOL_VERSION,
        playerId: context.localPlayerId,
      });
      maybeBroadcastMatchGo();
    };

    // Bridge listens before asset load so early matchReady from fast peers is not dropped.
    const networkBridge = new NetworkBridge({
      mesh: context.mesh,
      tickBuffer,
      onStateHashMismatch: (mismatch) => {
        logger.warn(
          `Desync vs player ${mismatch.fromPlayerId} at tick ${mismatch.tick} (local ${mismatch.localHash} != remote ${mismatch.remoteHash})`,
        );
      },
      onMessage: (_fromPlayerId, message) => {
        if (message.type === 'matchReady') {
          readyPlayers.add(message.playerId);
          maybeBroadcastMatchGo();
          return;
        }
        if (message.type === 'matchGo') {
          startMatchLoop();
        }
      },
    });
    const matchSeed = lobbyState.seed ?? FALLBACK_SEED;
    const taskMinigame = createTaskMinigame(root);

    const matchGate = document.createElement('div');
    matchGate.className = 'match-gate';
    matchGate.innerHTML = '<p class="match-gate__label">Loading station…</p>';
    root.appendChild(matchGate);
    const matchGateLabel = matchGate.querySelector<HTMLElement>('.match-gate__label');

    const unlockMovement = (): void => {
      sceneApi?.setMovementLocked(false);
    };

    const scene = await createSimulationScene({
      container: root,
      seed: matchSeed,
      players: lobbyState.players,
      localPlayerId: context.localPlayerId,
      tickBuffer,
      networkBridge,
      tileMap: getTileMapById(lobbyState.settings.mapId),
      impostorCount: lobbyState.settings.impostorCount,
      taskCount: lobbyState.settings.taskCount,
      onTaskUsePress: (stationId) => {
        if (taskMinigame.isOpen() || !sceneApi) return;
        // Impostors cannot run task minigames (fake list is HUD-only camouflage).
        if (sceneApi.getLocalRole() === 'impostor') return;
        sceneApi.setMovementLocked(true);
        taskMinigame.open({
          stationId,
          seed: matchSeed,
          playerId: context.localPlayerId,
          onComplete: (completedStationId) => {
            sceneApi?.queueTaskComplete(completedStationId);
            unlockMovement();
          },
          onCancel: unlockMovement,
        });
      },
    });
    sceneApi = scene;
    scene.primeView();
    if (matchGateLabel) matchGateLabel.textContent = 'Waiting for players…';

    const taskHud = createTaskHud(root);
    const gameHud = createGameHud(root);
    const sabotageHud = createSabotageHud(root, lobbyState.settings.mapId);
    const helpOverlay = createHelpOverlay(root);
    const killFlash = createKillFlash(root);
    const victoryScreen = createVictoryScreen(root, lobbyState.players, {
      onBackToLobby: returnToWizard,
      onPlayAgain: returnToWizard,
    });
    const meetingScreen = createMeetingScreen(root, {
      players: lobbyState.players,
      localPlayerId: context.localPlayerId,
      onVote: (targetId) => scene.queueVote(targetId),
    });
    setMatchHudHidden(true);

    const localRole = scene.getLocalRole();
    if (localRole) {
      // Keep look-lock off until reveal finishes *and* the match starts.
      scene.setMovementLocked(true);
      roleRevealOpen = true;
      showRoleReveal(root, localRole, 3000, () => {
        roleRevealOpen = false;
        if (loopStarted && scene.getPhase() === 'playing') scene.setMovementLocked(false);
      });
    }
    helpOverlay.maybeShowTutorial();

    let victoryShown = false;
    let lastPhase = scene.getPhase();
    let lastBodyCount = scene.getBodyCount();
    let lastSabotage = scene.getSabotage().active;
    const loop = new GameLoop({
      shouldHoldTick: () => scene.shouldHoldTick(),
      update: (dtMs, tick) => {
        scene.update(dtMs, tick);
        taskHud.update(scene.getLocalTasks());
        const localPos = scene.getPositions().find((p) => p.id === context.localPlayerId);

        // Leave range while a minigame is open → cancel without completing.
        if (taskMinigame.isOpen() && localPos) {
          const openStationId = taskMinigame.getStationId();
          const station = openStationId
            ? getTaskStation(openStationId, scene.getMapId())
            : undefined;
          if (station) {
            const dx = localPos.x - station.position.x;
            const dy = localPos.y - station.position.y;
            if (Math.hypot(dx, dy) > TASK_INTERACT_RANGE_PX) {
              taskMinigame.close();
            }
          }
        }

        sabotageHud.update(scene.getSabotage(), localPos ? { x: localPos.x, y: localPos.y } : null);
        const aliveCounts = scene.getAliveCounts();
        const crewTasks = scene.getCrewTaskProgress();
        gameHud.update({
          role: scene.getLocalRole(),
          phase: scene.getPhase(),
          alive: scene.isAlive(context.localPlayerId),
          killCooldownTicks: scene.getKillCooldownTicks(),
          prompt: scene.getNearestInteractPrompt(),
          roomName: scene.getLocalRoomName(),
          crewTasksCompleted: crewTasks.completed,
          crewTasksTotal: crewTasks.total,
          aliveCrewmates: aliveCounts.crewmates,
          aliveImpostors: aliveCounts.impostors,
        });

        const phase = scene.getPhase();
        const bodyCount = scene.getBodyCount();
        const sabotageActive = scene.getSabotage().active;

        if (bodyCount > lastBodyCount) {
          audio.play('kill');
          killFlash.flash();
        }
        if (phase === 'meeting' && lastPhase !== 'meeting') {
          const meeting = scene.getMeeting();
          audio.play(meeting?.reason === 'body' ? 'report' : 'meeting');
          // Free the cursor for vote buttons (same path as task UI).
          scene.setMovementLocked(true);
        }
        if (phase === 'playing' && lastPhase === 'meeting') {
          scene.setMovementLocked(false);
        }
        if (sabotageActive && sabotageActive !== lastSabotage) {
          audio.play('sabotage');
        }

        lastPhase = phase;
        lastBodyCount = bodyCount;
        lastSabotage = sabotageActive;

        const aliveById = new Map(
          lobbyState.players.map((player) => [player.playerId, scene.isAlive(player.playerId)]),
        );
        meetingScreen.update(scene.getMeeting(), aliveById);

        const winner = scene.getWinner();
        const winReason = scene.getWinReason();
        if (winner && winReason && !victoryShown) {
          victoryShown = true;
          audio.play('win');
          // Release pointer-lock so victory buttons are clickable.
          scene.setMovementLocked(true);
          victoryScreen.show(winner, winReason, scene.getRoles());
          logger.info(`Game over: ${winner} wins (${winReason})`);
        }

        if (tick % HASH_LOG_INTERVAL_TICKS === 0) {
          logger.debug(`tick ${tick} hash ${scene.getStateHash()}`);
        }
      },
      render: () => {
        scene.render();
      },
    });
    gameLoop = loop;

    if (isDev) {
      window.__slimogusGetStateHash = () => scene.getStateHash();
      window.__slimogusGetCurrentTick = () => loop.currentTick;
      window.__slimogusGetHashAtTick = (tick) => networkBridge.getLocalHash(tick);
      window.__slimogusGetPhase = () => scene.getPhase();
      window.__slimogusQueueVote = (targetId) => scene.queueVote(targetId);
      window.__slimogusGetWinner = () => scene.getWinner();
      window.__slimogusGetLocalRole = () => scene.getLocalRole();
      window.__slimogusGetLocalPlayerId = () => context.localPlayerId;
      window.__slimogusGetPositions = () => scene.getPositions();
    }

    // Post-load barrier: wait until every peer finished asset load before tick 0.
    announceMatchReady();

    teardownCurrentScreen = () => {
      loop.stop();
      matchGate.remove();
      taskMinigame.destroy();
      scene.destroy();
      taskHud.destroy();
      gameHud.destroy();
      sabotageHud.destroy();
      helpOverlay.destroy();
      killFlash.destroy();
      meetingScreen.destroy();
      victoryScreen.destroy();
    };
  }

  showWizard();

  return () => {
    window.removeEventListener('slimogus:settings-changed', onSettingsChanged);
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    teardownCurrentScreen();
    settingsPanel.destroy();
    audio.destroy();
  };
}
