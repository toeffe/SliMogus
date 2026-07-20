import { FIXED_TIMESTEP_MS } from '@constants';

export interface StepResult {
  steps: number;
  accumulator: number;
}

/**
 * Pure accumulator step used by {@link GameLoop}. Kept separate from any
 * timing source so it can be unit tested deterministically; Phase 1 builds
 * the full deterministic simulation on top of this same primitive.
 */
export function accumulateSteps(
  accumulator: number,
  deltaMs: number,
  stepMs: number,
  maxSteps = 5,
): StepResult {
  let acc = accumulator + deltaMs;
  let steps = 0;
  while (acc >= stepMs && steps < maxSteps) {
    acc -= stepMs;
    steps += 1;
  }
  return { steps, accumulator: acc };
}

export interface GameLoopCallbacks {
  /** Called once per fixed step with the step size and the step index. */
  update: (dtMs: number, tick: number) => void;
  /** Called once per animation frame with the leftover interpolation alpha (0..1). */
  render: (alpha: number) => void;
  /**
   * Lockstep backpressure: when true after `update`, the wall-clock tick does
   * not advance. Keeps a fast client from racing ahead of peers and inflating
   * input-to-motion lag.
   */
  shouldHoldTick?: () => boolean;
}

/**
 * Fixed-timestep loop: rAF while the tab is visible (smooth motion), and a
 * background `setInterval` while hidden so lockstep peers keep receiving
 * input frames after alt-tab (rAF is paused/throttled in background tabs).
 */
export class GameLoop {
  private rafHandle: number | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private tick = 0;
  private fps = 0;
  private fpsAccumulatorMs = 0;
  private fpsFrameCount = 0;

  constructor(
    private readonly callbacks: GameLoopCallbacks,
    private readonly stepMs: number = FIXED_TIMESTEP_MS,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.syncClock();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.clearClock();
  }

  get currentFps(): number {
    return this.fps;
  }

  get currentTick(): number {
    return this.tick;
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.running) return;
    // Drop a huge paused delta so the first wake doesn't burst.
    this.lastTime = performance.now();
    this.accumulator = Math.min(this.accumulator, this.stepMs);
    this.syncClock();
  };

  private syncClock(): void {
    this.clearClock();
    if (typeof document !== 'undefined' && document.hidden) {
      // Background: rAF may not fire; interval keeps emitting input seqs.
      this.intervalHandle = setInterval(this.backgroundPulse, this.stepMs);
      return;
    }
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  private clearClock(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private readonly frame = (now: number): void => {
    this.stepSim(now, 5);
    this.callbacks.render(this.accumulator / this.stepMs);
    if (this.running && !(typeof document !== 'undefined' && document.hidden)) {
      this.rafHandle = requestAnimationFrame(this.frame);
    }
  };

  private readonly backgroundPulse = (): void => {
    // Throttled wakes (~1/s): allow up to a second of catch-up ticks.
    this.stepSim(performance.now(), 60);
  };

  private stepSim(now: number, maxSteps: number): void {
    const rawDelta = now - this.lastTime;
    this.lastTime = now;
    const delta = Math.min(rawDelta, this.stepMs * maxSteps);

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < maxSteps) {
      this.callbacks.update(this.stepMs, this.tick);
      this.accumulator -= this.stepMs;
      steps += 1;
      if (this.callbacks.shouldHoldTick?.()) {
        // Don't bank catch-up time while waiting on peer inputs.
        this.accumulator = Math.min(this.accumulator, this.stepMs);
        break;
      }
      this.tick += 1;
    }

    this.trackFps(delta);
  }

  private trackFps(deltaMs: number): void {
    this.fpsFrameCount += 1;
    this.fpsAccumulatorMs += deltaMs;
    if (this.fpsAccumulatorMs >= 250) {
      this.fps = Math.round((this.fpsFrameCount * 1000) / this.fpsAccumulatorMs);
      this.fpsFrameCount = 0;
      this.fpsAccumulatorMs = 0;
    }
  }
}
