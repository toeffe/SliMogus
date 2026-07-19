import type { FrameStats } from '@types';
import { APP_NAME, APP_VERSION } from '@constants';
import { formatMs } from '@utils/format';

export interface DebugOverlayHandle {
  setStats: (stats: FrameStats) => void;
  destroy: () => void;
}

/** Compact FPS/tick strip only — log lines go to the browser console via `Logger`. */
export function createDebugOverlay(root: HTMLElement): DebugOverlayHandle {
  const el = document.createElement('div');
  el.className = 'debug-overlay';

  const statsEl = document.createElement('div');
  statsEl.className = 'debug-overlay__stats';
  el.append(statsEl);
  root.appendChild(el);

  return {
    setStats: ({ fps, tick, frameMs }) => {
      statsEl.textContent = `${APP_NAME} v${APP_VERSION} · FPS ${fps} · tick ${tick} · frame ${formatMs(frameMs)}`;
    },
    destroy: () => {
      el.remove();
    },
  };
}
