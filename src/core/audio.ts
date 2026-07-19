import { loadSettings, type Settings } from './settings';

export type SfxId = 'kill' | 'report' | 'meeting' | 'sabotage' | 'win' | 'ui';

interface Tone {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
}

const SFX_TONES: Readonly<Record<SfxId, readonly Tone[]>> = {
  kill: [
    { frequency: 180, durationMs: 80, type: 'sawtooth', gain: 0.35 },
    { frequency: 90, durationMs: 140, type: 'square', gain: 0.25 },
  ],
  report: [{ frequency: 660, durationMs: 90, type: 'triangle', gain: 0.3 }],
  meeting: [
    { frequency: 440, durationMs: 100, type: 'square', gain: 0.25 },
    { frequency: 554, durationMs: 120, type: 'square', gain: 0.25 },
  ],
  sabotage: [
    { frequency: 220, durationMs: 70, type: 'sawtooth', gain: 0.3 },
    { frequency: 180, durationMs: 70, type: 'sawtooth', gain: 0.3 },
    { frequency: 140, durationMs: 120, type: 'sawtooth', gain: 0.3 },
  ],
  win: [
    { frequency: 523, durationMs: 100, type: 'triangle', gain: 0.28 },
    { frequency: 659, durationMs: 100, type: 'triangle', gain: 0.28 },
    { frequency: 784, durationMs: 180, type: 'triangle', gain: 0.28 },
  ],
  ui: [{ frequency: 520, durationMs: 40, type: 'sine', gain: 0.15 }],
};

/**
 * Procedural Web Audio bus — no sample files. Mute/volume come from
 * `Settings`; browsers require a user gesture before `AudioContext` can
 * start, so the first `play` (or explicit `resume`) unlocks it.
 */
export class AudioBus {
  private context: AudioContext | null = null;
  private settings: Settings;

  constructor(initial: Settings = loadSettings()) {
    this.settings = initial;
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  play(id: SfxId): void {
    if (this.settings.muted || this.settings.volume <= 0) return;
    const tones = SFX_TONES[id];
    if (!tones) return;

    void this.resume().then(() => {
      const ctx = this.ensureContext();
      let offset = 0;
      for (const tone of tones) {
        this.scheduleTone(ctx, tone, offset);
        offset += (tone.durationMs / 1000) * 0.85;
      }
    });
  }

  destroy(): void {
    void this.context?.close();
    this.context = null;
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctx();
    }
    return this.context;
  }

  private scheduleTone(ctx: AudioContext, tone: Tone, whenOffsetSec: number): void {
    const start = ctx.currentTime + whenOffsetSec;
    const duration = tone.durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.frequency, start);
    const peak = (tone.gain ?? 0.25) * this.settings.volume;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}
