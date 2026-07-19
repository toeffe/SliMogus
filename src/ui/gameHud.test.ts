import { beforeEach, describe, expect, it } from 'vitest';
import { createGameHud, type GameHudSnapshot } from './gameHud';

function base(partial: Partial<GameHudSnapshot> = {}): GameHudSnapshot {
  return {
    role: 'crewmate',
    phase: 'playing',
    alive: true,
    killCooldownTicks: 0,
    prompt: null,
    roomName: 'Cafeteria',
    crewTasksCompleted: 0,
    crewTasksTotal: 5,
    aliveCrewmates: 2,
    aliveImpostors: 1,
    ...partial,
  };
}

describe('createGameHud', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('hides when the game has ended', () => {
    const hud = createGameHud(root);
    hud.update(base({ phase: 'ended' }));
    expect(root.querySelector('.game-hud')?.hasAttribute('hidden')).toBe(true);
    hud.destroy();
  });

  it('shows room, role, task bar, and use prompt while playing', () => {
    const hud = createGameHud(root);
    hud.update(base({ prompt: 'use' }));
    const el = root.querySelector('.game-hud');
    expect(el?.textContent).toContain('Cafeteria');
    expect(el?.textContent).toContain('Crewmate');
    expect(el?.textContent).toContain('Tasks 0/5');
    expect(el?.textContent).toContain('E Task');
    hud.destroy();
  });

  it('shows kill cooldown for impostors and ghost note when dead', () => {
    const hud = createGameHud(root);
    hud.update(
      base({
        role: 'impostor',
        killCooldownTicks: 120,
        alive: false,
      }),
    );
    expect(root.querySelector('.game-hud')?.textContent).toContain('Ghost');
    hud.destroy();
  });
});
