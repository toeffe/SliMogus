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
 * Render-decoupled fixed-timestep loop stub. Drives `update` at a fixed
 * rate via an accumulator and `render` once per animation frame.
 */
export class GameLoop {
  private rafHandle: number | null = null;
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
    if (this.rafHandle !== null) return;
    this.lastTime = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
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

  private readonly frame = (now: number): void => {
    const rawDelta = now - this.lastTime;
    this.lastTime = now;
    // Clamp so a stalled tab (e.g. backgrounded) doesn't spiral into a huge catch-up burst.
    const delta = Math.min(rawDelta, this.stepMs * 5);

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < 5) {
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
    this.callbacks.render(this.accumulator / this.stepMs);
    this.rafHandle = requestAnimationFrame(this.frame);
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
