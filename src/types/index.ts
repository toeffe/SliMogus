export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
}

export interface FrameStats {
  fps: number;
  tick: number;
  frameMs: number;
}
