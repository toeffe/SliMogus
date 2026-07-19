import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showRoleReveal } from './roleReveal';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  root.remove();
});

describe('showRoleReveal', () => {
  it('renders the crewmate label', () => {
    showRoleReveal(root, 'crewmate');
    expect(root.querySelector('.role-reveal--crewmate')).not.toBeNull();
    expect(root.textContent).toContain('Crewmate');
  });

  it('renders the impostor label', () => {
    showRoleReveal(root, 'impostor');
    expect(root.querySelector('.role-reveal--impostor')).not.toBeNull();
    expect(root.textContent).toContain('Impostor');
  });

  it('auto-dismisses after the given duration', () => {
    showRoleReveal(root, 'crewmate', 1000);
    expect(root.querySelector('.role-reveal')).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(root.querySelector('.role-reveal')).toBeNull();
  });

  it('dismisses immediately on click', () => {
    showRoleReveal(root, 'crewmate', 10000);
    root.querySelector<HTMLElement>('.role-reveal')?.click();
    expect(root.querySelector('.role-reveal')).toBeNull();
  });

  it('destroy() removes the element and is safe to call twice', () => {
    const handle = showRoleReveal(root, 'crewmate', 10000);
    handle.destroy();
    expect(root.querySelector('.role-reveal')).toBeNull();
    expect(() => handle.destroy()).not.toThrow();
  });

  it('invokes onDismiss when the reveal closes', () => {
    const onDismiss = vi.fn();
    showRoleReveal(root, 'crewmate', 1000, onDismiss);
    vi.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
