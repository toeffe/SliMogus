import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps only the most recent entries up to the configured limit', () => {
    const logger = new Logger(3);
    logger.info('a');
    logger.info('b');
    logger.info('c');
    logger.info('d');

    expect(logger.getEntries()).toHaveLength(3);
    expect(logger.getEntries().map((entry) => entry.message)).toEqual(['b', 'c', 'd']);
  });

  it('notifies subscribers immediately and on every new entry', () => {
    const logger = new Logger();
    const listener = vi.fn();
    logger.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);

    logger.warn('careful');

    expect(listener).toHaveBeenCalledTimes(2);
    const lastEntries = listener.mock.calls.at(-1)?.[0] as ReturnType<Logger['getEntries']>;
    expect(lastEntries.at(-1)).toMatchObject({ level: 'warn', message: 'careful' });
  });

  it('stops notifying after unsubscribe', () => {
    const logger = new Logger();
    const listener = vi.fn();
    const unsubscribe = logger.subscribe(listener);
    unsubscribe();

    logger.error('boom');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
