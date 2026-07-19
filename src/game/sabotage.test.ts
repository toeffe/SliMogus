import { describe, expect, it } from 'vitest';
import {
  createIdleSabotageState,
  resolveSabotage,
  SABOTAGE_COOLDOWN_TICKS,
  tryStartSabotage,
} from './sabotage';

describe('sabotage state machine', () => {
  it('starts lights or reactor only when idle and off cooldown', () => {
    const state = createIdleSabotageState();
    expect(tryStartSabotage(state, 'lights')).toBe(true);
    expect(state.active).toBe('lights');
    expect(tryStartSabotage(state, 'reactor')).toBe(false);

    resolveSabotage(state);
    expect(state.active).toBeNull();
    expect(state.cooldownTicks).toBe(SABOTAGE_COOLDOWN_TICKS);
    expect(tryStartSabotage(state, 'reactor')).toBe(false);

    state.cooldownTicks = 0;
    expect(tryStartSabotage(state, 'reactor')).toBe(true);
    expect(state.active).toBe('reactor');
  });
});
