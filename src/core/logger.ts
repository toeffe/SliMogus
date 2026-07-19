import type { LogEntry, LogLevel } from '@types';
import { DEBUG_LOG_LIMIT } from '@constants';

type LogListener = (entries: readonly LogEntry[]) => void;

const CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/**
 * Leveled logger with a small ring buffer of recent entries. Always writes
 * to the browser console; the on-screen overlay no longer mirrors log lines.
 */
export class Logger {
  private readonly entries: LogEntry[] = [];
  private readonly listeners = new Set<LogListener>();

  constructor(private readonly limit: number = DEBUG_LOG_LIMIT) {}

  log(level: LogLevel, message: string): void {
    const entry: LogEntry = { level, message, timestamp: Date.now() };
    this.entries.push(entry);
    if (this.entries.length > this.limit) {
      this.entries.shift();
    }
    this.emitToConsole(entry);
    this.notify();
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  /** Subscribes to log updates and immediately replays the current buffer. */
  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.entries);
    }
  }

  private emitToConsole(entry: LogEntry): void {
    const method = CONSOLE_METHOD[entry.level];
    // eslint-disable-next-line no-console -- this is the logger's own console sink
    console[method](`[${entry.level.toUpperCase()}] ${entry.message}`);
  }
}

export const logger = new Logger();
