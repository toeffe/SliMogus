import { PeerMesh } from '@net/mesh';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '@net/roomCode';

export interface SignalingWizardContext {
  mesh: PeerMesh;
  roomCode: string;
  localPlayerId: number;
  isHost: boolean;
}

export interface SignalingWizardHandle {
  destroy(): void;
}

/**
 * Host / Join entry (PeerJS, same UX as tetris_game): host gets a 5-char
 * room code; joiners type that code — no copy/paste SDP blobs.
 */
export function createSignalingWizard(
  root: HTMLElement,
  onReady: (context: SignalingWizardContext) => void,
): SignalingWizardHandle {
  const container = document.createElement('div');
  container.className = 'wizard';
  container.innerHTML = `
    <h1 class="wizard__title">SliMogus</h1>
    <div class="wizard__tabs" role="tablist">
      <button type="button" class="wizard__tab wizard__tab--active" data-tab="host">Host a Game</button>
      <button type="button" class="wizard__tab" data-tab="join">Join a Game</button>
    </div>
    <section class="wizard__panel" data-panel="host">
      <p>Create a room and share the 5-character code with friends.</p>
      <button type="button" class="wizard__button" data-action="create-room">Host Game</button>
      <p class="wizard__hint" data-field="host-status" hidden></p>
    </section>
    <section class="wizard__panel wizard__panel--hidden" data-panel="join">
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
  `;
  root.appendChild(container);

  const tabs = [...container.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const panels = [...container.querySelectorAll<HTMLElement>('[data-panel]')];
  const errorEl = container.querySelector<HTMLElement>('[data-field="error"]');
  const codeInput = container.querySelector<HTMLInputElement>('[data-field="room-code"]');
  const hostStatus = container.querySelector<HTMLElement>('[data-field="host-status"]');
  const joinStatus = container.querySelector<HTMLElement>('[data-field="join-status"]');
  const createButton = container.querySelector<HTMLButtonElement>('[data-action="create-room"]');
  const joinButton = container.querySelector<HTMLButtonElement>('[data-action="join-room"]');

  function showError(message: string): void {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(): void {
    if (!errorEl) return;
    errorEl.hidden = true;
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      clearError();
      for (const other of tabs) other.classList.toggle('wizard__tab--active', other === tab);
      for (const panel of panels) {
        panel.classList.toggle('wizard__panel--hidden', panel.dataset.panel !== tab.dataset.tab);
      }
      if (tab.dataset.tab === 'join') {
        setTimeout(() => codeInput?.focus(), 0);
      }
    });
  }

  codeInput?.addEventListener('input', () => {
    if (!codeInput) return;
    codeInput.value = normalizeRoomCode(codeInput.value).slice(0, ROOM_CODE_LENGTH);
  });

  createButton?.addEventListener('click', () => {
    clearError();
    if (createButton) createButton.disabled = true;
    if (hostStatus) {
      hostStatus.hidden = false;
      hostStatus.textContent = 'Creating room…';
    }
    void (async () => {
      try {
        const mesh = await PeerMesh.createAsHost();
        onReady({
          mesh,
          roomCode: mesh.roomCode,
          localPlayerId: mesh.localPlayerId,
          isHost: true,
        });
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Could not host.');
        if (createButton) createButton.disabled = false;
        if (hostStatus) hostStatus.hidden = true;
      }
    })();
  });

  function join(): void {
    clearError();
    const code = normalizeRoomCode(codeInput?.value ?? '');
    if (code.length !== ROOM_CODE_LENGTH) {
      showError('Enter the 5-character room code.');
      return;
    }
    if (joinButton) joinButton.disabled = true;
    if (joinStatus) {
      joinStatus.hidden = false;
      joinStatus.textContent = 'Joining…';
    }
    void (async () => {
      try {
        const mesh = await PeerMesh.joinByCode(code);
        onReady({
          mesh,
          roomCode: mesh.roomCode,
          localPlayerId: mesh.localPlayerId,
          isHost: false,
        });
      } catch (error) {
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

  return {
    destroy: () => container.remove(),
  };
}
