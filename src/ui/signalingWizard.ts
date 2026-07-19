import { PeerMesh } from '@net/mesh';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '@net/roomCode';

export interface SignalingWizardContext {
  mesh: PeerMesh;
  roomCode: string;
  localPlayerId: number;
  isHost: boolean;
}

export interface SignalingWizardCallbacks {
  /** Fired when a host/join session is ready; mount lobby into `mount`. */
  onSession: (context: SignalingWizardContext, mount: HTMLElement) => void;
  /** Fired when the user leaves a session via the Host/Join tabs. */
  onSessionEnd?: () => void;
}

export interface SignalingWizardHandle {
  /**
   * Remove the wizard chrome. Pass `closeMesh: false` when handing the active
   * session mesh to the match (game start) so PeerJS stays up.
   */
  destroy(options?: { closeMesh?: boolean }): void;
}

/**
 * Host / Join entry (PeerJS): title + tabs stay mounted; lobby content swaps
 * in below them. Defaults to Join.
 */
export function createSignalingWizard(
  root: HTMLElement,
  callbacks: SignalingWizardCallbacks,
): SignalingWizardHandle {
  const container = document.createElement('div');
  container.className = 'wizard';
  container.innerHTML = `
    <h1 class="wizard__title">SliMogus</h1>
    <div class="wizard__tabs" role="tablist">
      <button type="button" class="wizard__tab" data-tab="host">Host a Game</button>
      <button type="button" class="wizard__tab wizard__tab--active" data-tab="join">Join a Game</button>
    </div>
    <div class="wizard__session" data-field="session" hidden></div>
    <div class="wizard__forms" data-field="forms">
      <section class="wizard__panel wizard__panel--hidden" data-panel="host">
        <p>Create a room and share the 5-character code with friends.</p>
        <p class="wizard__hint" data-field="host-status">Creating room…</p>
        <button type="button" class="wizard__button" data-action="create-room" hidden>Try again</button>
      </section>
      <section class="wizard__panel" data-panel="join">
        <p>Enter the room code from your host:</p>
        <input
          type="text"
          class="wizard__code-input"
          data-field="room-code"
          maxlength="${ROOM_CODE_LENGTH}"
          autocomplete="off"
          spellcheck="false"
          placeholder="·····"
        />
        <button type="button" class="wizard__button" data-action="join-room">Join</button>
        <p class="wizard__hint" data-field="join-status" hidden></p>
      </section>
      <p class="wizard__error" data-field="error" hidden></p>
    </div>
  `;
  root.appendChild(container);

  const tabs = [...container.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const panels = [...container.querySelectorAll<HTMLElement>('[data-panel]')];
  const sessionEl = container.querySelector<HTMLElement>('[data-field="session"]');
  const formsEl = container.querySelector<HTMLElement>('[data-field="forms"]');
  const errorEl = container.querySelector<HTMLElement>('[data-field="error"]');
  const codeInput = container.querySelector<HTMLInputElement>('[data-field="room-code"]');
  const hostStatus = container.querySelector<HTMLElement>('[data-field="host-status"]');
  const joinStatus = container.querySelector<HTMLElement>('[data-field="join-status"]');
  const createButton = container.querySelector<HTMLButtonElement>('[data-action="create-room"]');
  const joinButton = container.querySelector<HTMLButtonElement>('[data-action="join-room"]');

  let activeMesh: PeerMesh | null = null;
  let activeMode: 'host' | 'join' | null = null;
  let connecting = false;
  let destroyed = false;

  function showError(message: string): void {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(): void {
    if (!errorEl) return;
    errorEl.hidden = true;
  }

  function selectTab(tabId: 'host' | 'join'): void {
    for (const tab of tabs) {
      tab.classList.toggle('wizard__tab--active', tab.dataset.tab === tabId);
    }
    for (const panel of panels) {
      panel.classList.toggle('wizard__panel--hidden', panel.dataset.panel !== tabId);
    }
  }

  function showForms(tabId: 'host' | 'join'): void {
    selectTab(tabId);
    if (sessionEl) {
      sessionEl.hidden = true;
      sessionEl.replaceChildren();
    }
    if (formsEl) formsEl.hidden = false;
  }

  function showSession(tabId: 'host' | 'join'): HTMLElement {
    selectTab(tabId);
    if (formsEl) formsEl.hidden = true;
    if (!sessionEl) throw new Error('wizard session mount missing');
    sessionEl.hidden = false;
    sessionEl.replaceChildren();
    return sessionEl;
  }

  function endSession(): void {
    if (activeMesh) {
      try {
        activeMesh.close();
      } catch {
        // Mesh may already be closed.
      }
      activeMesh = null;
    }
    const hadSession = activeMode !== null;
    activeMode = null;
    connecting = false;
    if (hadSession) callbacks.onSessionEnd?.();
  }

  function beginSession(context: SignalingWizardContext, mode: 'host' | 'join'): void {
    activeMesh = context.mesh;
    activeMode = mode;
    connecting = false;
    const mount = showSession(mode);
    callbacks.onSession(context, mount);
  }

  function host(): void {
    if (destroyed) return;
    if (activeMode === 'host' && activeMesh) {
      selectTab('host');
      return;
    }
    if (connecting) return;

    endSession();
    connecting = true;
    clearError();
    showForms('host');
    if (createButton) createButton.hidden = true;
    if (hostStatus) {
      hostStatus.hidden = false;
      hostStatus.textContent = 'Creating room…';
    }

    void (async () => {
      try {
        const mesh = await PeerMesh.createAsHost();
        if (destroyed) {
          mesh.close();
          return;
        }
        if (!connecting) {
          // User switched away before the room finished creating.
          mesh.close();
          return;
        }
        beginSession(
          {
            mesh,
            roomCode: mesh.roomCode,
            localPlayerId: mesh.localPlayerId,
            isHost: true,
          },
          'host',
        );
      } catch (error) {
        connecting = false;
        if (destroyed) return;
        showForms('host');
        showError(error instanceof Error ? error.message : 'Could not host.');
        if (hostStatus) hostStatus.textContent = 'Could not create room.';
        if (createButton) {
          createButton.hidden = false;
          createButton.disabled = false;
        }
      }
    })();
  }

  function showJoinForm(): void {
    if (destroyed) return;
    if (activeMode === 'join' && activeMesh) {
      selectTab('join');
      return;
    }
    endSession();
    connecting = false;
    clearError();
    showForms('join');
    if (joinButton) joinButton.disabled = false;
    if (joinStatus) joinStatus.hidden = true;
    setTimeout(() => codeInput?.focus(), 0);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      clearError();
      const tabId = tab.dataset.tab;
      if (tabId === 'host') {
        host();
        return;
      }
      if (tabId === 'join') {
        showJoinForm();
      }
    });
  }

  codeInput?.addEventListener('input', () => {
    if (!codeInput) return;
    codeInput.value = normalizeRoomCode(codeInput.value).slice(0, ROOM_CODE_LENGTH);
  });

  createButton?.addEventListener('click', () => {
    host();
  });

  function join(): void {
    if (destroyed || connecting) return;
    clearError();
    const code = normalizeRoomCode(codeInput?.value ?? '');
    if (code.length !== ROOM_CODE_LENGTH) {
      showError('Enter the 5-character room code.');
      return;
    }

    endSession();
    connecting = true;
    showForms('join');
    if (joinButton) joinButton.disabled = true;
    if (joinStatus) {
      joinStatus.hidden = false;
      joinStatus.textContent = 'Joining…';
    }

    void (async () => {
      try {
        const mesh = await PeerMesh.joinByCode(code);
        if (destroyed) {
          mesh.close();
          return;
        }
        if (!connecting) {
          mesh.close();
          return;
        }
        beginSession(
          {
            mesh,
            roomCode: mesh.roomCode,
            localPlayerId: mesh.localPlayerId,
            isHost: false,
          },
          'join',
        );
      } catch (error) {
        connecting = false;
        if (destroyed) return;
        showError(error instanceof Error ? error.message : 'Join failed.');
        if (joinButton) joinButton.disabled = false;
        if (joinStatus) joinStatus.hidden = true;
      }
    })();
  }

  joinButton?.addEventListener('click', join);
  codeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') join();
  });

  setTimeout(() => codeInput?.focus(), 0);

  return {
    destroy: (options) => {
      destroyed = true;
      const closeMesh = options?.closeMesh !== false;
      if (closeMesh) {
        endSession();
      } else {
        // Match is taking ownership of the mesh; caller already removed the lobby.
        activeMesh = null;
        activeMode = null;
        connecting = false;
      }
      container.remove();
    },
  };
}
