import { loadSettings, saveSettings, type Settings } from '@core/settings';

export interface SettingsPanelHandle {
  destroy: () => void;
}

export interface SettingsPanelOptions {
  /** Called after every successful save so audio/lobby can react. */
  onChange?: (settings: Settings) => void;
}

/**
 * Modal panel for mute / volume. Purely local — never touches the network.
 * Display name is edited on the lobby screen; host match settings stay there too.
 */
export function createSettingsPanel(
  root: HTMLElement,
  options: SettingsPanelOptions = {},
): SettingsPanelHandle {
  const el = document.createElement('div');
  el.className = 'settings-panel';
  el.hidden = true;
  root.appendChild(el);

  function render(settings: Settings): void {
    el.innerHTML = `
      <div class="settings-panel__card">
        <h2 class="settings-panel__title">Audio</h2>
        <label class="settings-panel__field settings-panel__field--row">
          <input type="checkbox" data-field="muted" ${settings.muted ? 'checked' : ''} />
          Mute sound
        </label>
        <label class="settings-panel__field">
          Volume
          <input
            type="range"
            class="settings-panel__range"
            data-field="volume"
            min="0"
            max="1"
            step="0.05"
            value="${settings.volume}"
            ${settings.muted ? 'disabled' : ''}
          />
        </label>
        <div class="settings-panel__actions">
          <button type="button" class="lobby__button lobby__button--primary" data-action="save">Save</button>
          <button type="button" class="lobby__button" data-action="close">Close</button>
        </div>
      </div>
    `;

    el.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      el.hidden = true;
    });
    el.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      const mutedInput = el.querySelector<HTMLInputElement>('[data-field="muted"]');
      const volumeInput = el.querySelector<HTMLInputElement>('[data-field="volume"]');
      const next = saveSettings({
        muted: Boolean(mutedInput?.checked),
        volume: Number(volumeInput?.value ?? 0.7),
      });
      options.onChange?.(next);
      window.dispatchEvent(
        new CustomEvent<Settings>('slimogus:settings-changed', { detail: next }),
      );
      el.hidden = true;
    });
    el.addEventListener('click', (event) => {
      if (event.target === el) el.hidden = true;
    });
  }

  render(loadSettings());

  // Expose open via a custom event so lobby/help can trigger without holding a ref cycle.
  const openHandler = (): void => {
    render(loadSettings());
    el.hidden = false;
  };
  window.addEventListener('slimogus:open-settings', openHandler);

  return {
    destroy: () => {
      window.removeEventListener('slimogus:open-settings', openHandler);
      el.remove();
    },
  };
}

export function openSettingsPanel(): void {
  window.dispatchEvent(new Event('slimogus:open-settings'));
}
