import { describe, expect, it } from 'vitest';
import { clamp, formatMs } from './format';

describe('formatMs', () => {
  it('formats milliseconds with a fixed number of decimals', () => {
    expect(formatMs(16.6667)).toBe('16.7ms');
    expect(formatMs(2, 0)).toBe('2ms');
  });
});

describe('clamp', () => {
  it('keeps values already within range unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps values below the minimum', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it('clamps values above the maximum', () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
