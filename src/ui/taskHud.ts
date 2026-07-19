import { getTaskStation, type AssignedTask } from '@game/tasks';

export interface TaskHudHandle {
  update: (tasks: readonly AssignedTask[]) => void;
  destroy: () => void;
}

/**
 * Always-visible task list. Completion is binary after minigames (0% / 100%);
 * mid-progress fill is no longer part of the loop. Same list for crewmates
 * and impostors — whether a task "counts" stays invisible by design.
 */
export function createTaskHud(root: HTMLElement): TaskHudHandle {
  const el = document.createElement('div');
  el.className = 'task-hud';
  root.appendChild(el);

  let lastRenderedKey = '';

  const update = (tasks: readonly AssignedTask[]): void => {
    // Cheap re-render guard: rebuilding the DOM every tick (60/sec) even when
    // nothing changed would be wasteful — same spirit as Phase 3's minimap pooling fix.
    const key = tasks.map((task) => `${task.stationId}:${task.completed ? 1 : 0}`).join('|');
    if (key === lastRenderedKey) return;
    lastRenderedKey = key;

    const items = tasks
      .map((task) => {
        const station = getTaskStation(task.stationId);
        const name = station?.name ?? task.stationId;
        const percent = task.completed ? 100 : 0;
        return `
          <li class="task-hud__item${task.completed ? ' task-hud__item--done' : ''}">
            <span class="task-hud__name">${task.completed ? '\u2713 ' : ''}${name}</span>
            <span class="task-hud__bar"><span class="task-hud__bar-fill" style="width:${percent}%"></span></span>
          </li>
        `;
      })
      .join('');
    el.innerHTML = items.length > 0 ? `<ul class="task-hud__list">${items}</ul>` : '';
  };

  return {
    update,
    destroy: () => el.remove(),
  };
}
