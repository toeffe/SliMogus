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
 * Fixed-timestep sim clock + rAF render.
 *
 * Simulation is driven by `setInterval`, not `requestAnimationFrame`, because
 * background tabs pause or heavily throttle rAF — which stops input seq
 * emission and freezes every peer's lockstep barrier. Hidden timers are often
 * clamped to ~1s; when hidden we allow up to 60 steps per pulse so one
 * throttled wake still emits about a second of inputs.
 */
export class GameLoop {
  private rafHandle: number | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
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
    if (this.intervalHandle !== null) return;
    this.lastTime = performance.now();
    this.intervalHandle = setInterval(this.pulse, this.stepMs);
    this.rafHandle = requestAnimationFrame(this.renderFrame);
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  get currentFps(): number {
    return this.fps;
  }

  get currentTick(): number {
    return this.tick;
  }

  private readonly pulse = (): void => {
    const now = performance.now();
    const rawDelta = now - this.lastTime;
    this.lastTime = now;
    // Foreground: small clamp avoids spiral-of-death after a hitch.
    // Background: browsers often fire this only ~1/sec — allow a full second
    // of catch-up so lockstep peers keep receiving input frames.
    const maxSteps = typeof document !== 'undefined' && document.hidden ? 60 : 5;
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
  };

  private readonly renderFrame = (): void => {
    this.callbacks.render(this.accumulator / this.stepMs);
    this.rafHandle = requestAnimationFrame(this.renderFrame);
  };

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
