import type { Role } from '@game/roles';
import type { WinReason, Winner } from '@game/winCondition';
import type { PlayerInfo } from '@net/protocol';

export interface VictoryScreenOptions {
  onBackToLobby?: () => void;
  onPlayAgain?: () => void;
}

export interface VictoryScreenHandle {
  show: (winner: Winner, reason: WinReason, roles: ReadonlyMap<number, Role>) => void;
  destroy: () => void;
}

const REASON_LABEL: Readonly<Record<WinReason, string>> = {
  tasks: 'All tasks completed',
  impostor_majority: 'Impostors equaled the crew',
  reactor_timeout: 'Reactor meltdown',
  impostors_eliminated: 'All impostors eliminated',
};

/**
 * End-of-game overlay with the winning team, reason, and a full role reveal
 * for every player. Shown once when `GameState.phase` becomes `'ended'`.
 * "Back to lobby" / "Play again" tear down the game and return to the wizard.
 */
export function createVictoryScreen(
  root: HTMLElement,
  players: readonly PlayerInfo[],
  options: VictoryScreenOptions = {},
): VictoryScreenHandle {
  const el = document.createElement('div');
  el.className = 'victory';
  el.hidden = true;
  root.appendChild(el);

  return {
    show(winner, reason, roles) {
      const roster = players
        .map((player) => {
          const role = roles.get(player.playerId) ?? 'crewmate';
          return `<li class="victory__player victory__player--${role}">${player.name} — ${role}</li>`;
        })
        .join('');
      el.innerHTML = `
        <div class="victory__card victory__card--${winner}">
          <p class="victory__label">${winner === 'crewmate' ? 'Crewmates win' : 'Impostors win'}</p>
          <p class="victory__reason">${REASON_LABEL[reason]}</p>
          <ul class="victory__roster">${roster}</ul>
          <div class="victory__actions">
            <button type="button" class="lobby__button" data-action="back">Back to lobby</button>
            <button type="button" class="lobby__button lobby__button--primary" data-action="again">Play again</button>
          </div>
        </div>
      `;
      el.hidden = false;
      el.querySelector('[data-action="back"]')?.addEventListener('click', () => {
        options.onBackToLobby?.();
      });
      el.querySelector('[data-action="again"]')?.addEventListener('click', () => {
        options.onPlayAgain?.();
      });
    },
    destroy: () => el.remove(),
  };
}
