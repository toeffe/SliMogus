import type { PlayerInput } from './input';

/**
 * Buffers per-tick, per-player inputs and resolves them into a single,
 * deterministic execution order. In Phase 2 this is fed by real
 * WebRTC-delivered input; here it's exercised directly by tests.
 */
export class TickBuffer {
  private readonly byTick = new Map<number, Map<number, PlayerInput>>();

  constructor(private readonly hostPlayerId: number) {}

  add(tick: number, input: PlayerInput): void {
    let byPlayer = this.byTick.get(tick);
    if (!byPlayer) {
      byPlayer = new Map();
      this.byTick.set(tick, byPlayer);
    }
    byPlayer.set(input.playerId, input);
  }

  hasTick(tick: number): boolean {
    return this.byTick.has(tick);
  }

  /** True only when every expected player has buffered input for `tick` (lockstep barrier). */
  hasAll(tick: number, playerIds: readonly number[]): boolean {
    const byPlayer = this.byTick.get(tick);
    if (!byPlayer) return false;
    for (const playerId of playerIds) {
      if (!byPlayer.has(playerId)) return false;
    }
    return true;
  }

  /** Host input first, then remaining players ascending by id — the tie-breaker rule for conflicting/simultaneous actions. */
  resolve(tick: number): PlayerInput[] {
    const byPlayer = this.byTick.get(tick);
    if (!byPlayer) return [];
    return [...byPlayer.values()].sort((a, b) => {
      if (a.playerId === this.hostPlayerId) return -1;
      if (b.playerId === this.hostPlayerId) return 1;
      return a.playerId - b.playerId;
    });
  }

  /** Drops all buffered ticks up to and including `tick`, once the simulation has consumed them. */
  clearUpTo(tick: number): void {
    for (const bufferedTick of this.byTick.keys()) {
      if (bufferedTick <= tick) {
        this.byTick.delete(bufferedTick);
      }
    }
  }
}
