import { loadSettings, saveSettings } from '@core/settings';
import { openSettingsPanel } from './settingsPanel';

export interface HelpOverlayHandle {
  /** Show once on first game if the player hasn't dismissed the tutorial. */
  maybeShowTutorial: () => void;
  destroy: () => void;
}

/**
 * Toggleable help overlay (`?` / `H`): keyboard map + short how-to-play.
 * Also doubles as the first-run tutorial via `settings.seenTutorial`.
 */
export function createHelpOverlay(root: HTMLElement): HelpOverlayHandle {
  const el = document.createElement('div');
  el.className = 'help-overlay';
  el.hidden = true;
  el.innerHTML = `
    <div class="help-overlay__card">
      <h2 class="help-overlay__title">How to play</h2>
      <ul class="help-overlay__list">
        <li><kbd>WASD</kbd> / arrows — move</li>
        <li><kbd>E</kbd> — open task (crew) / vent (impostor) / hold to fix sabotage</li>
        <li><kbd>R</kbd> — report a body</li>
        <li><kbd>Q</kbd> — kill (impostors)</li>
        <li><kbd>1</kbd> — turn off lights (impostors)</li>
        <li><kbd>2</kbd> — start reactor meltdown (impostors)</li>
        <li><kbd>F</kbd> — toggle flashlight</li>
        <li><kbd>M</kbd> — emergency meeting (when allowed)</li>
        <li><kbd>?</kbd> / <kbd>H</kbd> — toggle this help</li>
      </ul>
      <p class="help-overlay__blurb">
        Crewmates complete tasks and vote out impostors. Impostors kill and sabotage with
        <kbd>1</kbd>/<kbd>2</kbd> (not tasks). Stay quiet — there is no text chat yet.
      </p>
      <div class="help-overlay__actions">
        <button type="button" class="lobby__button" data-action="settings">Settings</button>
        <button type="button" class="lobby__button lobby__button--primary" data-action="close">Got it</button>
      </div>
    </div>
  `;
  root.appendChild(el);

  function setOpen(open: boolean): void {
    el.hidden = !open;
    if (!open && !loadSettings().seenTutorial) {
      saveSettings({ seenTutorial: true });
    }
    window.dispatchEvent(new Event('slimogus:overlay-changed'));
  }

  function toggle(): void {
    setOpen(el.hasAttribute('hidden'));
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const key = event.key;
    if (key === '?' || key === 'h' || key === 'H') {
      // Don't steal typing in inputs (meeting votes are buttons; lobby settings use inputs).
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      toggle();
    } else if (key === 'Escape' && !el.hidden) {
      setOpen(false);
    }
  };

  el.querySelector('[data-action="close"]')?.addEventListener('click', () => setOpen(false));
  el.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
    openSettingsPanel();
  });
  el.addEventListener('click', (event) => {
    if (event.target === el) setOpen(false);
  });
  window.addEventListener('keydown', onKeyDown);

  return {
    maybeShowTutorial: () => {
      if (!loadSettings().seenTutorial) setOpen(true);
    },
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown);
      el.remove();
    },
  };
}
