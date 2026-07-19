import {
  getLightsPanel,
  getReactorPanelA,
  getReactorPanelB,
  isPlayerNearPanel,
  LIGHTS_FIX_DURATION_TICKS,
  REACTOR_TIMEOUT_TICKS,
  type SabotageState,
} from '@game/sabotage';
import type { Vector2 } from '@sim/vector2';

export interface SabotageHudHandle {
  update: (sabotage: Readonly<SabotageState>, localPosition?: Vector2 | null) => void;
  destroy: () => void;
}

/** Top-center alert while a sabotage is active, with panel proximity / hold status. */
export function createSabotageHud(root: HTMLElement, mapId = 'omega'): SabotageHudHandle {
  const el = document.createElement('div');
  el.className = 'sabotage-hud';
  el.hidden = true;
  root.appendChild(el);

  let lastKey = '';

  return {
    update(sabotage, localPosition = null) {
      if (!sabotage.active) {
        el.hidden = true;
        lastKey = '';
        return;
      }

      const nearLights = localPosition
        ? isPlayerNearPanel(localPosition, getLightsPanel(mapId))
        : false;
      const nearA = localPosition
        ? isPlayerNearPanel(localPosition, getReactorPanelA(mapId))
        : false;
      const nearB = localPosition
        ? isPlayerNearPanel(localPosition, getReactorPanelB(mapId))
        : false;
      const key = [
        sabotage.active,
        sabotage.ticksRemaining,
        sabotage.lightsFixProgress,
        sabotage.reactorPanelAHeldBy,
        sabotage.reactorPanelBHeldBy,
        nearLights,
        nearA,
        nearB,
      ].join(':');
      if (key === lastKey) {
        el.hidden = false;
        return;
      }
      lastKey = key;
      el.hidden = false;

      if (sabotage.active === 'lights') {
        const percent = Math.min(
          100,
          Math.round((sabotage.lightsFixProgress / LIGHTS_FIX_DURATION_TICKS) * 100),
        );
        const hint = nearLights
          ? percent > 0
            ? `Hold E — ${percent}%`
            : 'Hold E at the POWER console'
          : 'Hold E at the POWER console in Electrical (north wall)';
        el.innerHTML = `
          <div class="sabotage-hud__alert sabotage-hud__alert--lights">
            Lights out — restore power (${percent}%)
            <span class="sabotage-hud__hint">${hint}</span>
          </div>
        `;
        return;
      }

      const seconds = Math.ceil(sabotage.ticksRemaining / 60);
      const total = Math.ceil(REACTOR_TIMEOUT_TICKS / 60);
      const aHeld = sabotage.reactorPanelAHeldBy !== null;
      const bHeld = sabotage.reactorPanelBHeldBy !== null;
      el.innerHTML = `
        <div class="sabotage-hud__alert sabotage-hud__alert--reactor">
          Reactor meltdown — ${seconds}s / ${total}s
          <span class="sabotage-hud__hint">
            Panel A ${aHeld ? 'HELD' : 'open'}${nearA ? ' (you)' : ''} ·
            Panel B ${bHeld ? 'HELD' : 'open'}${nearB ? ' (you)' : ''}
          </span>
        </div>
      `;
    },
    destroy: () => el.remove(),
  };
}
