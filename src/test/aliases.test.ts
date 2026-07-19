import { describe, expect, it } from 'vitest';
import { Logger } from '@core/logger';
import { assignRoles } from '@game/roles';
import { clamp } from '@utils/format';
import { APP_NAME } from '@constants';
import type { LogLevel } from '@types';

describe('path aliases', () => {
  it('resolves @core, @game, @utils, @constants, and @types imports', () => {
    const logger = new Logger(5);
    expect(logger).toBeInstanceOf(Logger);
    expect(clamp(20, 0, 10)).toBe(10);
    expect(APP_NAME).toBe('SliMogus');
    expect(assignRoles('seed', [0, 1], 1).size).toBe(2);

    const level: LogLevel = 'info';
    expect(level).toBe('info');
  });
});
