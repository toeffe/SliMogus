import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TASK_STATIONS } from '@game/tasks';
import { createTaskHud } from './taskHud';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
});

describe('createTaskHud', () => {
  it('renders nothing for an empty task list', () => {
    const hud = createTaskHud(root);
    hud.update([]);
    expect(root.querySelector('.task-hud__list')).toBeNull();
  });

  it('renders one item per task with its station name', () => {
    const hud = createTaskHud(root);
    const station = TASK_STATIONS[0];
    hud.update([{ stationId: station.id, completed: false, progressTicks: 0 }]);
    const items = root.querySelectorAll('.task-hud__item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain(station.name);
  });

  it('shows 0% fill for incomplete tasks and 100% when completed', () => {
    const hud = createTaskHud(root);
    const station = TASK_STATIONS[0];
    hud.update([
      { stationId: station.id, completed: false, progressTicks: station.durationTicks / 2 },
    ]);
    expect(root.querySelector<HTMLElement>('.task-hud__bar-fill')?.style.width).toBe('0%');
    hud.update([{ stationId: station.id, completed: true, progressTicks: station.durationTicks }]);
    expect(root.querySelector<HTMLElement>('.task-hud__bar-fill')?.style.width).toBe('100%');
  });

  it('marks a completed task with the --done class and a checkmark', () => {
    const hud = createTaskHud(root);
    const station = TASK_STATIONS[0];
    hud.update([{ stationId: station.id, completed: true, progressTicks: station.durationTicks }]);
    expect(root.querySelector('.task-hud__item--done')).not.toBeNull();
    expect(root.querySelector('.task-hud__item')?.textContent).toContain('\u2713');
  });

  it('destroy() removes the element from the DOM', () => {
    const hud = createTaskHud(root);
    hud.destroy();
    expect(root.querySelector('.task-hud')).toBeNull();
  });
});
