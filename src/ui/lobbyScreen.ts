import { resolveDisplayName, loadSettings, saveSettings, type Settings } from '@core/settings';
import { PLAYABLE_MAPS } from '@game/mapPois';
import { PROTOCOL_VERSION, type LobbyEvent, type NetMessage, type PlayerInfo } from '@net/protocol';
import {
  allPlayersReady,
  applyLobbyEvent,
  createLobbyState,
  isLocalPlayerHost,
  type LobbyState,
} from '@net/lobby';
import { applyHostMigration } from '@net/hostMigration';
import { HOST_PLAYER_ID } from '@net/mesh';
import { CHARACTER_ROSTER, DEFAULT_CHARACTER_ID, getCharacterLabel } from '@render/characterRoster';
import { openSettingsPanel } from './settingsPanel';
import type { SignalingWizardContext } from './signalingWizard';

const MAX_IMPOSTOR_COUNT = 3;
const MAX_TASK_COUNT = 20;

function clampImpostorCount(value: number, playerCount: number): number {
  const max = Math.max(1, Math.min(MAX_IMPOSTOR_COUNT, playerCount - 1));
  return Math.min(Math.max(1, Math.round(value) || 1), max);
}

function clampTaskCount(value: number): number {
  return Math.min(Math.max(1, Math.round(value) || 1), MAX_TASK_COUNT);
}

function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface LobbyScreenHandle {
  destroy(): void;
}

/** Industrial suit colors — readable on warm steel floors; no blurple/lavender. */
const PLAYER_COLOR_PALETTE = [0xb33a3a, 0x4a6a7a, 0x6a7a4a, 0xc4a574, 0xb86a3a, 0xd8d0c4];

function fallbackPlayerInfo(playerId: number): PlayerInfo {
  return {
    playerId,
    name: `Player ${playerId + 1}`,
    color: PLAYER_COLOR_PALETTE[playerId % PLAYER_COLOR_PALETTE.length] ?? 0xffffff,
    characterId: DEFAULT_CHARACTER_ID,
  };
}

function localPlayerInfo(playerId: number, settings: Settings = loadSettings()): PlayerInfo {
  return {
    ...fallbackPlayerInfo(playerId),
    name: resolveDisplayName(playerId, settings),
    characterId: settings.characterId || DEFAULT_CHARACTER_ID,
  };
}

/**
 * Room screen after PeerJS connect: share the 5-char code, ready up, host
 * starts. Additional joiners connect with the same code — no blob invite UI.
 */
export function createLobbyScreen(
  root: HTMLElement,
  context: SignalingWizardContext,
  onStart: (state: LobbyState) => void,
): LobbyScreenHandle {
  const { mesh, roomCode, localPlayerId, isHost } = context;

  let state: LobbyState = createLobbyState({
    roomCode,
    hostPlayerId: HOST_PLAYER_ID,
    localPlayerId,
    hostPlayer: isHost ? localPlayerInfo(HOST_PLAYER_ID) : fallbackPlayerInfo(HOST_PLAYER_ID),
  });
  if (!isHost) {
    state = applyLobbyEvent(state, { kind: 'join', player: localPlayerInfo(localPlayerId) });
  }

  const characterTiles = CHARACTER_ROSTER.map(
    (c) =>
      `<button type="button" class="lobby__char" data-character="${c.id}" title="${c.label}">${c.label}</button>`,
  ).join('');

  const container = document.createElement('div');
  container.className = 'lobby';
  container.innerHTML = `
    <h1 class="lobby__title">Room code</h1>
    <div class="lobby__code-row">
      <span class="lobby__code" data-field="room-code"></span>
      <button type="button" class="lobby__button" data-action="copy-code">Copy</button>
    </div>
    <p class="lobby__hint">Friends join with this code</p>
    <label class="lobby__name-field">
      Your name
      <input
        type="text"
        class="lobby__name-input"
        data-field="display-name"
        maxlength="24"
        placeholder="Player ${localPlayerId + 1}"
        value="${escapeAttr(loadSettings().displayName)}"
        autocomplete="nickname"
        spellcheck="false"
      />
    </label>
    <div class="lobby__host-panel" data-host-only hidden>
      <h2 class="lobby__subtitle">Match setup</h2>
      <div class="lobby__settings">
        <label class="lobby__settings-field">
          Impostors
          <input
            type="number"
            class="lobby__settings-input"
            data-field="impostor-count"
            min="1"
            step="1"
          />
        </label>
        <label class="lobby__settings-field">
          Tasks
          <input
            type="number"
            class="lobby__settings-input"
            data-field="task-count"
            min="1"
            max="${MAX_TASK_COUNT}"
            step="1"
          />
        </label>
        <label class="lobby__settings-field lobby__settings-field--map">
          Map
          <select class="lobby__settings-input lobby__settings-input--map" data-field="map-id">
            ${PLAYABLE_MAPS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
    <p class="lobby__settings-summary" data-field="settings-summary" hidden></p>
    <h2 class="lobby__subtitle">Players</h2>
    <ul class="lobby__players" data-field="player-list"></ul>
    <h2 class="lobby__subtitle">Character</h2>
    <div class="lobby__chars" data-field="character-grid">${characterTiles}</div>
    <div class="lobby__actions">
      <button type="button" class="lobby__button" data-action="toggle-ready">Ready</button>
      <button type="button" class="lobby__button" data-action="open-settings">Audio</button>
      <button type="button" class="lobby__button lobby__button--primary" data-action="start" data-host-start hidden>
        Start Game
      </button>
    </div>
    <p class="lobby__error" data-field="error" hidden></p>
  `;
  root.appendChild(container);

  const roomCodeEl = container.querySelector<HTMLElement>('[data-field="room-code"]');
  const playerListEl = container.querySelector<HTMLElement>('[data-field="player-list"]');
  const characterGridEl = container.querySelector<HTMLElement>('[data-field="character-grid"]');
  const readyButton = container.querySelector<HTMLButtonElement>('[data-action="toggle-ready"]');
  const hostPanel = container.querySelector<HTMLElement>('[data-host-only]');
  const startButton = container.querySelector<HTMLButtonElement>('[data-action="start"]');
  const errorEl = container.querySelector<HTMLElement>('[data-field="error"]');
  const settingsSummaryEl = container.querySelector<HTMLElement>('[data-field="settings-summary"]');
  const impostorCountInput = container.querySelector<HTMLInputElement>(
    '[data-field="impostor-count"]',
  );
  const taskCountInput = container.querySelector<HTMLInputElement>('[data-field="task-count"]');
  const mapIdSelect = container.querySelector<HTMLSelectElement>('[data-field="map-id"]');
  const displayNameInput = container.querySelector<HTMLInputElement>('[data-field="display-name"]');

  function commitDisplayName(): void {
    if (!displayNameInput) return;
    const settings = saveSettings({ displayName: displayNameInput.value });
    // Keep the input in sync with sanitization (trim / length).
    if (displayNameInput.value !== settings.displayName) {
      displayNameInput.value = settings.displayName;
    }
    // Lobby join sync happens via the shared settings-changed listener.
    window.dispatchEvent(
      new CustomEvent<Settings>('slimogus:settings-changed', { detail: settings }),
    );
  }

  function showError(message: string): void {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function broadcastLobbyEvent(event: LobbyEvent): void {
    mesh.broadcastReliable({ type: 'lobbyEvent', version: PROTOCOL_VERSION, event });
  }

  function applyAndBroadcast(event: LobbyEvent): void {
    state = applyLobbyEvent(state, event);
    broadcastLobbyEvent(event);
    render();
  }

  function announceLocalPlayer(): void {
    applyAndBroadcast({ kind: 'join', player: localPlayerInfo(localPlayerId) });
  }

  function render(): void {
    const localIsHost = isLocalPlayerHost(state);
    if (roomCodeEl) roomCodeEl.textContent = state.roomCode;
    if (hostPanel) hostPanel.hidden = !localIsHost;
    if (startButton) {
      startButton.hidden = !localIsHost;
      startButton.disabled = !allPlayersReady(state);
    }
    if (settingsSummaryEl) {
      settingsSummaryEl.hidden = localIsHost;
      const mapLabel =
        PLAYABLE_MAPS.find((m) => m.id === state.settings.mapId)?.name ?? state.settings.mapId;
      settingsSummaryEl.textContent = `Impostors: ${state.settings.impostorCount} \u00b7 Tasks: ${state.settings.taskCount} \u00b7 ${mapLabel}`;
    }

    const localPlayer = state.players.find((player) => player.playerId === localPlayerId);
    if (readyButton) {
      readyButton.textContent = localPlayer?.ready ? 'Not Ready' : 'Ready';
      readyButton.classList.toggle('lobby__button--ready', Boolean(localPlayer?.ready));
    }

    const selectedId = localPlayer?.characterId ?? loadSettings().characterId;
    characterGridEl?.querySelectorAll<HTMLButtonElement>('.lobby__char').forEach((btn) => {
      btn.classList.toggle('lobby__char--selected', btn.dataset.character === selectedId);
    });

    if (playerListEl) {
      playerListEl.innerHTML = state.players
        .map((player) => {
          const tags = [
            player.playerId === state.hostPlayerId ? 'Host' : null,
            player.playerId === localPlayerId ? 'You' : null,
          ].filter(Boolean);
          const suffix = tags.length > 0 ? ` (${tags.join(', ')})` : '';
          const charLabel = getCharacterLabel(player.characterId);
          const swatch = colorToCss(player.color);
          return `<li class="lobby__player${player.ready ? ' lobby__player--ready' : ''}"><span class="lobby__player-swatch" style="background:${swatch}"></span><span class="lobby__player-text">${player.name}${suffix} — ${charLabel} — ${player.ready ? 'Ready' : 'Not ready'}</span></li>`;
        })
        .join('');
    }

    if (impostorCountInput) {
      impostorCountInput.max = String(
        Math.max(1, Math.min(MAX_IMPOSTOR_COUNT, state.players.length - 1)),
      );
      if (Number(impostorCountInput.value) !== state.settings.impostorCount) {
        impostorCountInput.value = String(state.settings.impostorCount);
      }
    }
    if (taskCountInput && Number(taskCountInput.value) !== state.settings.taskCount) {
      taskCountInput.value = String(state.settings.taskCount);
    }
    if (mapIdSelect && mapIdSelect.value !== state.settings.mapId) {
      mapIdSelect.value = state.settings.mapId;
    }
  }

  function handlePeerMessage(_fromPlayerId: number, message: NetMessage): void {
    if (message.type !== 'lobbyEvent') return;
    state = applyLobbyEvent(state, message.event);
    render();
    if (state.started) onStart(state);
  }

  function backfillNewPeer(playerId: number): void {
    for (const existing of state.players) {
      mesh.sendReliable(playerId, {
        type: 'lobbyEvent',
        version: PROTOCOL_VERSION,
        event: { kind: 'join', player: existing },
      });
      if (existing.ready) {
        mesh.sendReliable(playerId, {
          type: 'lobbyEvent',
          version: PROTOCOL_VERSION,
          event: { kind: 'ready', playerId: existing.playerId, ready: true },
        });
      }
    }
    mesh.sendReliable(playerId, {
      type: 'lobbyEvent',
      version: PROTOCOL_VERSION,
      event: { kind: 'settingsChanged', settings: state.settings },
    });
    if (!state.players.some((player) => player.playerId === playerId)) {
      applyAndBroadcast({ kind: 'join', player: fallbackPlayerInfo(playerId) });
    }
  }

  function handlePeerDisconnect(playerId: number): void {
    if (!state.players.some((player) => player.playerId === playerId)) return;
    state = applyLobbyEvent(state, { kind: 'leave', playerId });
    const migrated = applyHostMigration(state);
    const hostChanged = migrated.hostPlayerId !== state.hostPlayerId;
    state = migrated;
    broadcastLobbyEvent({ kind: 'leave', playerId });
    if (hostChanged && state.hostPlayerId === localPlayerId) {
      broadcastLobbyEvent({ kind: 'hostMigrated', newHostId: state.hostPlayerId });
    }
    render();
  }

  mesh.updateOptions({
    onPeerMessage: handlePeerMessage,
    onPeerChannelOpen: (playerId, channel) => {
      if (channel !== 'reliable') return;
      if (isHost) backfillNewPeer(playerId);
      announceLocalPlayer();
    },
    onPeerConnectionStateChange: (playerId, connectionState) => {
      if (
        connectionState === 'disconnected' ||
        connectionState === 'failed' ||
        connectionState === 'closed'
      ) {
        handlePeerDisconnect(playerId);
      }
    },
  });

  characterGridEl?.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-character]');
    if (!btn?.dataset.character) return;
    const characterId = btn.dataset.character;
    const settings = saveSettings({ characterId });
    applyAndBroadcast({ kind: 'join', player: localPlayerInfo(localPlayerId, settings) });
  });

  readyButton?.addEventListener('click', () => {
    const localPlayer = state.players.find((player) => player.playerId === localPlayerId);
    applyAndBroadcast({
      kind: 'ready',
      playerId: localPlayerId,
      ready: !(localPlayer?.ready ?? false),
    });
  });

  container.querySelector('[data-action="open-settings"]')?.addEventListener('click', () => {
    openSettingsPanel();
  });

  const copyButton = container.querySelector<HTMLButtonElement>('[data-action="copy-code"]');
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
  copyButton?.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard?.writeText(roomCode);
        if (!copyButton) return;
        if (copyResetTimer) clearTimeout(copyResetTimer);
        copyButton.textContent = 'Copied!';
        copyButton.classList.add('lobby__button--copied');
        copyResetTimer = setTimeout(() => {
          copyButton.textContent = 'Copy';
          copyButton.classList.remove('lobby__button--copied');
          copyResetTimer = null;
        }, 1600);
      } catch {
        showError('Copy failed — share the code manually.');
      }
    })();
  });

  displayNameInput?.addEventListener('change', () => {
    commitDisplayName();
  });
  displayNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      displayNameInput.blur();
    }
  });

  const onSettingsChanged = (event: Event): void => {
    const settings = (event as CustomEvent<Settings>).detail ?? loadSettings();
    if (displayNameInput && document.activeElement !== displayNameInput) {
      displayNameInput.value = settings.displayName;
    }
    applyAndBroadcast({ kind: 'join', player: localPlayerInfo(localPlayerId, settings) });
  };
  window.addEventListener('slimogus:settings-changed', onSettingsChanged);

  impostorCountInput?.addEventListener('change', () => {
    if (!isLocalPlayerHost(state)) return;
    const clamped = clampImpostorCount(Number(impostorCountInput.value), state.players.length);
    applyAndBroadcast({ kind: 'settingsChanged', settings: { impostorCount: clamped } });
  });

  taskCountInput?.addEventListener('change', () => {
    if (!isLocalPlayerHost(state)) return;
    const clamped = clampTaskCount(Number(taskCountInput.value));
    applyAndBroadcast({ kind: 'settingsChanged', settings: { taskCount: clamped } });
  });

  mapIdSelect?.addEventListener('change', () => {
    if (!isLocalPlayerHost(state)) return;
    const mapId = mapIdSelect.value;
    if (!PLAYABLE_MAPS.some((m) => m.id === mapId)) return;
    applyAndBroadcast({ kind: 'settingsChanged', settings: { mapId } });
  });

  startButton?.addEventListener('click', () => {
    if (!isLocalPlayerHost(state) || !allPlayersReady(state)) return;
    applyAndBroadcast({ kind: 'start', seed: crypto.randomUUID() });
    onStart(state);
  });

  announceLocalPlayer();
  if (isHost) {
    applyAndBroadcast({ kind: 'ready', playerId: localPlayerId, ready: true });
  } else {
    render();
  }

  return {
    destroy: () => {
      if (copyResetTimer) clearTimeout(copyResetTimer);
      window.removeEventListener('slimogus:settings-changed', onSettingsChanged);
      container.remove();
    },
  };
}
