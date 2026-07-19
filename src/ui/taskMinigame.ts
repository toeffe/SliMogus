import { Random } from '@sim/random';
import { getTaskStation, type TaskMinigameId } from '@game/tasks';

export interface TaskMinigameHandle {
  open: (options: {
    stationId: string;
    seed: string;
    playerId: number;
    onComplete: (stationId: string) => void;
    onCancel: () => void;
  }) => void;
  /** True while a panel is visible. */
  isOpen: () => boolean;
  /** Station currently being played, if any. */
  getStationId: () => string | null;
  close: () => void;
  destroy: () => void;
}

const WIRE_COLORS = [
  { id: 'red', hex: '#b33a3a' },
  { id: 'blue', hex: '#4a6a7a' },
  { id: 'green', hex: '#6a9a5a' },
  { id: 'amber', hex: '#d4a017' },
] as const;

const THEME_BY_KIND: Record<TaskMinigameId, string> = {
  wires: 'wires',
  gauge: 'gauge',
  download: 'download',
};

/**
 * Local-only Among Us-style task panels. Puzzle state never leaves the
 * client; completion is reported via `onComplete` so the sim can apply a
 * single validated `TASK_COMPLETE` input.
 */
export function createTaskMinigame(root: HTMLElement): TaskMinigameHandle {
  const backdrop = document.createElement('div');
  backdrop.className = 'task-minigame';
  backdrop.hidden = true;
  root.appendChild(backdrop);

  let stationId: string | null = null;
  let onComplete: ((id: string) => void) | null = null;
  let onCancel: (() => void) | null = null;
  let rafId = 0;
  let successTimer = 0;

  const clearRaf = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const clearTimers = (): void => {
    clearRaf();
    if (successTimer !== 0) {
      window.clearTimeout(successTimer);
      successTimer = 0;
    }
  };

  const close = (): void => {
    clearTimers();
    stationId = null;
    onComplete = null;
    onCancel = null;
    backdrop.hidden = true;
    backdrop.innerHTML = '';
    backdrop.className = 'task-minigame';
  };

  const finishSuccess = (): void => {
    const id = stationId;
    const complete = onComplete;
    close();
    if (id && complete) complete(id);
  };

  const celebrateThenComplete = (): void => {
    const panel = backdrop.querySelector('.task-minigame__panel');
    panel?.classList.add('task-minigame__panel--success');
    backdrop.classList.add('task-minigame--success');
    successTimer = window.setTimeout(() => {
      successTimer = 0;
      finishSuccess();
    }, 520);
  };

  const finishCancel = (): void => {
    const cancel = onCancel;
    close();
    cancel?.();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (backdrop.hidden) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      finishCancel();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const open = (options: {
    stationId: string;
    seed: string;
    playerId: number;
    onComplete: (stationId: string) => void;
    onCancel: () => void;
  }): void => {
    const station = getTaskStation(options.stationId);
    if (!station) return;
    close();
    stationId = options.stationId;
    onComplete = options.onComplete;
    onCancel = options.onCancel;

    const theme = THEME_BY_KIND[station.minigame];
    const random = new Random(`${options.seed}:mini:${options.playerId}:${options.stationId}`);
    const assetBase = import.meta.env.BASE_URL;
    backdrop.hidden = false;
    backdrop.className = `task-minigame task-minigame--${theme}`;
    backdrop.style.setProperty(
      '--tm-panel-bg',
      `url("${assetBase}assets/ui/panels/console-bg.png")`,
    );
    backdrop.innerHTML = `
      <div class="task-minigame__panel" role="dialog" aria-label="${station.name}">
        <div class="task-minigame__scanlines" aria-hidden="true"></div>
        <div class="task-minigame__glow" aria-hidden="true"></div>
        <header class="task-minigame__header">
          <div class="task-minigame__brand">
            <span class="task-minigame__badge">STATION CONSOLE</span>
            <h2 class="task-minigame__title">${station.name}</h2>
          </div>
          <button type="button" class="task-minigame__close" data-action="cancel" aria-label="Close">Esc</button>
        </header>
        <div class="task-minigame__body" data-body></div>
        <div class="task-minigame__success-burst" aria-hidden="true">
          <span>COMPLETE</span>
        </div>
      </div>
    `;
    const body = backdrop.querySelector<HTMLElement>('[data-body]')!;
    backdrop.querySelector('[data-action="cancel"]')?.addEventListener('click', finishCancel);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finishCancel();
    });

    mountMinigame(station.minigame, body, random, celebrateThenComplete, (id) => {
      rafId = id;
    });
  };

  return {
    open,
    isOpen: () => !backdrop.hidden,
    getStationId: () => stationId,
    close: finishCancel,
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown);
      close();
      backdrop.remove();
    },
  };
}

function mountMinigame(
  kind: TaskMinigameId,
  body: HTMLElement,
  random: Random,
  onSuccess: () => void,
  setRaf: (id: number) => void,
): void {
  if (kind === 'wires') mountWires(body, random, onSuccess);
  else if (kind === 'gauge') mountGauge(body, random, onSuccess);
  else mountDownload(body, random, onSuccess, setRaf);
}

function mountWires(body: HTMLElement, random: Random, onSuccess: () => void): void {
  const leftOrder = shuffle([...WIRE_COLORS], random);
  const rightOrder = shuffle([...WIRE_COLORS], random);
  const connected = new Set<string>();
  let selectedLeft: string | null = null;

  body.innerHTML = `
    <p class="task-minigame__hint">Link each left port to its matching color on the right</p>
    <div class="task-minigame__wires" data-wires>
      <svg class="task-minigame__wire-svg" data-svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="task-minigame__wire-col" data-side="left"></div>
      <div class="task-minigame__wire-col" data-side="right"></div>
    </div>
    <div class="task-minigame__status-row">
      <span class="task-minigame__led" data-led></span>
      <span class="task-minigame__status" data-status>0 / 4 linked</span>
    </div>
  `;

  const board = body.querySelector<HTMLElement>('[data-wires]')!;
  const svg = body.querySelector<SVGSVGElement>('[data-svg]')!;
  const leftCol = body.querySelector('[data-side="left"]')!;
  const rightCol = body.querySelector('[data-side="right"]')!;
  const status = body.querySelector<HTMLElement>('[data-status]')!;
  const led = body.querySelector<HTMLElement>('[data-led]')!;

  const makePort = (
    color: (typeof WIRE_COLORS)[number],
    side: 'left' | 'right',
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-minigame__wire';
    btn.style.setProperty('--wire-color', color.hex);
    btn.dataset.color = color.id;
    btn.dataset.side = side;
    btn.innerHTML = `
      <span class="task-minigame__wire-jack"></span>
      <span class="task-minigame__wire-label">${color.id}</span>
      <span class="task-minigame__wire-jack"></span>
    `;
    return btn;
  };

  for (const color of leftOrder) leftCol.appendChild(makePort(color, 'left'));
  for (const color of rightOrder) rightCol.appendChild(makePort(color, 'right'));

  const redrawLinks = (): void => {
    const boardRect = board.getBoundingClientRect();
    if (boardRect.width <= 0 || boardRect.height <= 0) return;
    svg.replaceChildren();
    for (const colorId of connected) {
      const left = board.querySelector<HTMLElement>(
        `.task-minigame__wire[data-side="left"][data-color="${colorId}"]`,
      );
      const right = board.querySelector<HTMLElement>(
        `.task-minigame__wire[data-side="right"][data-color="${colorId}"]`,
      );
      if (!left || !right) continue;
      const color = WIRE_COLORS.find((entry) => entry.id === colorId)?.hex ?? '#fff';
      const lr = left.getBoundingClientRect();
      const rr = right.getBoundingClientRect();
      const x1 = ((lr.right - boardRect.left) / boardRect.width) * 100;
      const y1 = ((lr.top + lr.height / 2 - boardRect.top) / boardRect.height) * 100;
      const x2 = ((rr.left - boardRect.left) / boardRect.width) * 100;
      const y2 = ((rr.top + rr.height / 2 - boardRect.top) / boardRect.height) * 100;
      const cx = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
      path.setAttribute('stroke', color);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', '2.4');
      path.setAttribute('stroke-linecap', 'round');
      path.style.color = color;
      path.classList.add('task-minigame__wire-path');
      svg.appendChild(path);
    }
  };

  const updateStatus = (): void => {
    status.textContent = `${connected.size} / 4 linked`;
    led.classList.toggle('task-minigame__led--on', connected.size > 0);
    led.classList.toggle('task-minigame__led--ready', connected.size >= WIRE_COLORS.length);
  };

  body.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.task-minigame__wire');
    if (!target || target.disabled) return;
    const color = target.dataset.color!;
    const side = target.dataset.side!;

    if (side === 'left') {
      body.querySelectorAll('.task-minigame__wire--selected').forEach((el) => {
        el.classList.remove('task-minigame__wire--selected');
      });
      if (connected.has(color)) return;
      selectedLeft = color;
      target.classList.add('task-minigame__wire--selected');
      return;
    }

    if (!selectedLeft) return;
    if (color !== selectedLeft) {
      body.querySelectorAll('.task-minigame__wire--selected').forEach((el) => {
        el.classList.remove('task-minigame__wire--selected');
      });
      board.classList.add('task-minigame__wires--shake');
      window.setTimeout(() => board.classList.remove('task-minigame__wires--shake'), 280);
      selectedLeft = null;
      return;
    }

    connected.add(color);
    body
      .querySelectorAll<HTMLButtonElement>(`.task-minigame__wire[data-color="${color}"]`)
      .forEach((el) => {
        el.disabled = true;
        el.classList.add('task-minigame__wire--done');
        el.classList.remove('task-minigame__wire--selected');
      });
    selectedLeft = null;
    redrawLinks();
    updateStatus();
    if (connected.size >= WIRE_COLORS.length) onSuccess();
  });

  updateStatus();
  requestAnimationFrame(redrawLinks);
  window.addEventListener('resize', redrawLinks, { once: true });
}

function mountGauge(body: HTMLElement, random: Random, onSuccess: () => void): void {
  const target = random.nextFloat(0.22, 0.78);
  const zoneHalf = 0.07;
  let value = random.nextFloat(0.05, 0.95);

  // Map 0..1 onto a 220° dial sweep from -110° to +110°.
  const toAngle = (t: number): number => -110 + t * 220;
  const zoneStart = toAngle(target - zoneHalf);
  const zoneEnd = toAngle(target + zoneHalf);

  body.innerHTML = `
    <p class="task-minigame__hint">Align the needle with the safe band, then lock it in</p>
    <div class="task-minigame__gauge" data-gauge>
      <svg class="task-minigame__dial" viewBox="0 0 200 140" aria-hidden="true">
        <defs>
          <linearGradient id="tm-dial-arc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#243848"/>
            <stop offset="45%" stop-color="#3a5a68"/>
            <stop offset="100%" stop-color="#1e3340"/>
          </linearGradient>
          <filter id="tm-needle-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path class="task-minigame__dial-track" d="${describeArc(100, 110, 78, -110, 110)}" />
        <path class="task-minigame__dial-zone" data-zone d="${describeArc(100, 110, 78, zoneStart, zoneEnd)}" />
        <g class="task-minigame__dial-ticks" data-ticks></g>
        <line class="task-minigame__dial-needle" data-needle x1="100" y1="110" x2="100" y2="38" filter="url(#tm-needle-glow)" />
        <circle class="task-minigame__dial-hub" cx="100" cy="110" r="8" />
        <circle class="task-minigame__dial-hub-core" cx="100" cy="110" r="3.5" />
      </svg>
      <div class="task-minigame__gauge-readout">
        <span data-readout>000</span>
        <small>CAL</small>
      </div>
      <input type="range" min="0" max="1000" class="task-minigame__gauge-slider" data-slider />
    </div>
    <button type="button" class="task-minigame__confirm" data-confirm disabled>
      <span class="task-minigame__confirm-label">Lock setting</span>
    </button>
  `;

  const needle = body.querySelector<SVGLineElement>('[data-needle]')!;
  const slider = body.querySelector<HTMLInputElement>('[data-slider]')!;
  const confirm = body.querySelector<HTMLButtonElement>('[data-confirm]')!;
  const readout = body.querySelector<HTMLElement>('[data-readout]')!;
  const ticks = body.querySelector<SVGGElement>('[data-ticks]')!;
  const gauge = body.querySelector<HTMLElement>('[data-gauge]')!;

  for (let i = 0; i <= 10; i += 1) {
    const angle = toAngle(i / 10);
    const outer = polar(100, 110, 78, angle);
    const inner = polar(100, 110, i % 5 === 0 ? 66 : 70, angle);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(inner.x));
    line.setAttribute('y1', String(inner.y));
    line.setAttribute('x2', String(outer.x));
    line.setAttribute('y2', String(outer.y));
    line.classList.add('task-minigame__dial-tick');
    if (i % 5 === 0) line.classList.add('task-minigame__dial-tick--major');
    ticks.appendChild(line);
  }

  const sync = (): void => {
    const angle = toAngle(value);
    const tip = polar(100, 110, 72, angle);
    needle.setAttribute('x2', String(tip.x));
    needle.setAttribute('y2', String(tip.y));
    slider.value = String(Math.round(value * 1000));
    readout.textContent = String(Math.round(value * 100)).padStart(3, '0');
    const inZone = Math.abs(value - target) <= zoneHalf;
    confirm.disabled = !inZone;
    confirm.classList.toggle('task-minigame__confirm--ready', inZone);
    gauge.classList.toggle('task-minigame__gauge--locked-zone', inZone);
  };

  slider.addEventListener('input', () => {
    value = Number(slider.value) / 1000;
    sync();
  });
  confirm.addEventListener('click', () => {
    if (Math.abs(value - target) <= zoneHalf) onSuccess();
  });
  sync();
}

function mountDownload(
  body: HTMLElement,
  random: Random,
  onSuccess: () => void,
  setRaf: (id: number) => void,
): void {
  const interruptCount = random.nextInt(1, 2);
  const interrupts: number[] = [];
  for (let i = 0; i < interruptCount; i += 1) {
    interrupts.push(random.nextFloat(0.25, 0.85));
  }
  interrupts.sort((a, b) => a - b);

  let progress = 0;
  let interruptIndex = 0;
  let waitingClick = false;
  let lastTs = 0;
  const durationMs = 2800;
  const segments = 12;

  body.innerHTML = `
    <p class="task-minigame__hint" data-hint>Transferring packet stream — authorize when prompted</p>
    <div class="task-minigame__download" data-download>
      <div class="task-minigame__download-frame">
        <div class="task-minigame__download-grid" aria-hidden="true"></div>
        <div class="task-minigame__download-segments" data-segments></div>
        <div class="task-minigame__download-meta">
          <span data-pct>0%</span>
          <span data-packets>PKT 00/${String(segments).padStart(2, '0')}</span>
        </div>
      </div>
      <button type="button" class="task-minigame__interrupt" data-interrupt hidden>
        <span class="task-minigame__interrupt-ring" aria-hidden="true"></span>
        <span class="task-minigame__interrupt-label">AUTHORIZE</span>
      </button>
    </div>
  `;

  const segmentHost = body.querySelector<HTMLElement>('[data-segments]')!;
  for (let i = 0; i < segments; i += 1) {
    const seg = document.createElement('span');
    seg.className = 'task-minigame__download-seg';
    segmentHost.appendChild(seg);
  }
  const segs = [...segmentHost.querySelectorAll<HTMLElement>('.task-minigame__download-seg')];
  const hint = body.querySelector<HTMLElement>('[data-hint]')!;
  const interruptBtn = body.querySelector<HTMLButtonElement>('[data-interrupt]')!;
  const pctEl = body.querySelector<HTMLElement>('[data-pct]')!;
  const packetsEl = body.querySelector<HTMLElement>('[data-packets]')!;
  const download = body.querySelector<HTMLElement>('[data-download]')!;

  interruptBtn.addEventListener('click', () => {
    if (!waitingClick) return;
    waitingClick = false;
    interruptBtn.hidden = true;
    download.classList.remove('task-minigame__download--interrupt');
    hint.textContent = 'Transferring packet stream…';
    interruptIndex += 1;
    download.classList.add('task-minigame__download--pulse');
    window.setTimeout(() => download.classList.remove('task-minigame__download--pulse'), 320);
  });

  const tick = (ts: number): void => {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(48, ts - lastTs);
    lastTs = ts;

    if (!waitingClick) {
      progress = Math.min(1, progress + dt / durationMs);
      const filled = Math.floor(progress * segments);
      segs.forEach((seg, index) => {
        seg.classList.toggle('task-minigame__download-seg--on', index < filled);
        seg.classList.toggle(
          'task-minigame__download-seg--active',
          index === filled && progress < 1,
        );
      });
      pctEl.textContent = `${Math.round(progress * 100)}%`;
      packetsEl.textContent = `PKT ${String(Math.min(segments, filled)).padStart(2, '0')}/${String(segments).padStart(2, '0')}`;

      const next = interrupts[interruptIndex];
      if (next !== undefined && progress >= next) {
        waitingClick = true;
        interruptBtn.hidden = false;
        download.classList.add('task-minigame__download--interrupt');
        hint.textContent = 'Handshake required — authorize now';
      } else if (progress >= 1 && interruptIndex >= interrupts.length) {
        onSuccess();
        return;
      }
    }

    setRaf(requestAnimationFrame(tick));
  };

  setRaf(requestAnimationFrame(tick));
}

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function shuffle<T>(items: T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = random.nextInt(0, i);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}
