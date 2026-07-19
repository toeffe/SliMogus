export type InteractPrompt =
  | 'use'
  | 'report'
  | 'kill'
  | 'vent'
  | 'fix'
  | 'emergency'
  | 'sabotage-lights'
  | 'sabotage-reactor'
  | null;

export interface GameHudSnapshot {
  role: 'crewmate' | 'impostor' | undefined;
  phase: string;
  alive: boolean;
  killCooldownTicks: number;
  prompt: InteractPrompt;
  roomName: string | null;
  crewTasksCompleted: number;
  crewTasksTotal: number;
  aliveCrewmates: number;
  aliveImpostors: number;
}

export interface GameHudHandle {
  update: (snapshot: GameHudSnapshot) => void;
  destroy: () => void;
}

const PROMPT_LABEL: Readonly<Record<Exclude<InteractPrompt, null>, string>> = {
  use: 'E Task',
  report: 'R Report',
  kill: 'Q Kill',
  vent: 'E Vent',
  fix: 'E Fix',
  emergency: 'M Emergency',
  'sabotage-lights': '1 Lights off · 2 Reactor',
  'sabotage-reactor': '2 Reactor · 1 Lights',
};

/**
 * Top status strip + bottom action strip: room, phase, crew task bar, role,
 * kill cooldown, and contextual prompts. Ghosts keep a reduced status view.
 */
export function createGameHud(root: HTMLElement): GameHudHandle {
  const el = document.createElement('div');
  el.className = 'game-hud';
  root.appendChild(el);

  let lastKey = '';

  return {
    update(snapshot) {
      if (snapshot.phase === 'ended') {
        el.hidden = true;
        lastKey = '';
        return;
      }

      el.hidden = false;
      const cooldownSec =
        snapshot.role === 'impostor' && snapshot.killCooldownTicks > 0
          ? Math.ceil(snapshot.killCooldownTicks / 60)
          : 0;
      const taskPct =
        snapshot.crewTasksTotal > 0
          ? Math.round((snapshot.crewTasksCompleted / snapshot.crewTasksTotal) * 100)
          : 0;
      const key = [
        snapshot.phase,
        snapshot.role,
        snapshot.alive,
        snapshot.roomName,
        cooldownSec,
        snapshot.prompt,
        snapshot.crewTasksCompleted,
        snapshot.crewTasksTotal,
        snapshot.aliveCrewmates,
        snapshot.aliveImpostors,
      ].join('|');
      if (key === lastKey) return;
      lastKey = key;

      const roleLabel = snapshot.role === 'impostor' ? 'Impostor' : 'Crewmate';
      const roleClass =
        snapshot.role === 'impostor' ? 'game-hud__role--impostor' : 'game-hud__role--crewmate';
      const phaseLabel =
        snapshot.phase === 'meeting' ? 'Meeting' : snapshot.alive ? 'Playing' : 'Spectating';
      const aliveLabel =
        snapshot.role === 'impostor'
          ? `${snapshot.aliveCrewmates} crew · ${snapshot.aliveImpostors} imp alive`
          : `${snapshot.aliveCrewmates + snapshot.aliveImpostors} alive`;

      const cooldownHtml =
        snapshot.role === 'impostor' && snapshot.alive
          ? `<span class="game-hud__cooldown${cooldownSec > 0 ? '' : ' game-hud__cooldown--ready'}">${
              cooldownSec > 0 ? `Kill ${cooldownSec}s` : 'Kill ready'
            }</span>`
          : '';

      const promptHtml =
        snapshot.prompt && snapshot.phase === 'playing'
          ? `<span class="game-hud__prompt">${PROMPT_LABEL[snapshot.prompt]}</span>`
          : '';

      const ghostNote =
        !snapshot.alive && snapshot.phase === 'playing'
          ? `<span class="game-hud__ghost">Ghost — finish tasks / watch</span>`
          : '';

      el.innerHTML = `
        <div class="game-hud__status">
          <span class="game-hud__room">${snapshot.roomName ?? '…'}</span>
          <span class="game-hud__phase">${phaseLabel}</span>
          <span class="game-hud__alive">${aliveLabel}</span>
          <div class="game-hud__tasks" title="Crew task progress">
            <span class="game-hud__tasks-label">Tasks ${snapshot.crewTasksCompleted}/${snapshot.crewTasksTotal}</span>
            <span class="game-hud__tasks-bar"><span class="game-hud__tasks-fill" style="width:${taskPct}%"></span></span>
          </div>
        </div>
        <div class="game-hud__strip">
          <span class="game-hud__role ${roleClass}">${roleLabel}</span>
          ${cooldownHtml}
          ${promptHtml}
          ${ghostNote}
        </div>
      `;
    },
    destroy: () => el.remove(),
  };
}
