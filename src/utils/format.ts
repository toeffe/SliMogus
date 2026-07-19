export function formatMs(ms: number, fractionDigits = 1): string {
  return `${ms.toFixed(fractionDigits)}ms`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
