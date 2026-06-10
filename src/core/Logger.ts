/**
 * Structured logging with levels, channels, and a ring buffer that feeds the
 * in-game dev console. Gameplay code gets a child logger per system
 * (log.child('ai'), log.child('waves')) so output is filterable.
 */

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Silent = 4,
}

export interface LogEntry {
  level: LogLevel;
  channel: string;
  message: string;
  data?: unknown;
  time: number;
}

export type LogSink = (entry: LogEntry) => void;

const consoleSink: LogSink = (entry) => {
  const tag = `[${entry.channel}]`;
  switch (entry.level) {
    case LogLevel.Debug:
      // eslint-disable-next-line no-console
      console.debug(tag, entry.message, entry.data ?? '');
      break;
    case LogLevel.Info:
      // eslint-disable-next-line no-console
      console.info(tag, entry.message, entry.data ?? '');
      break;
    case LogLevel.Warn:
      // eslint-disable-next-line no-console
      console.warn(tag, entry.message, entry.data ?? '');
      break;
    default:
      // eslint-disable-next-line no-console
      console.error(tag, entry.message, entry.data ?? '');
  }
};

export class Logger {
  level: LogLevel;
  readonly channel: string;
  private readonly sink: LogSink;
  private readonly buffer: LogEntry[];
  private readonly capacity: number;
  private readonly root: Logger;

  constructor(channel: string, level: LogLevel = LogLevel.Info, sink: LogSink = consoleSink, capacity = 200, root?: Logger) {
    this.channel = channel;
    this.level = level;
    this.sink = sink;
    this.capacity = capacity;
    this.buffer = root ? [] : [];
    this.root = root ?? this;
  }

  child(name: string): Logger {
    return new Logger(`${this.channel}.${name}`, this.level, this.sink, this.capacity, this.root);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.root.level) return;
    const entry: LogEntry = { level, channel: this.channel, message, data, time: performanceNow() };
    const buf = this.root.buffer;
    buf.push(entry);
    if (buf.length > this.root.capacity) buf.shift();
    this.sink(entry);
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.Debug, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.Info, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.Warn, message, data);
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.Error, message, data);
  }

  /** Most recent entries (oldest first) from the shared ring buffer. */
  recent(): readonly LogEntry[] {
    return this.root.buffer;
  }
}

const performanceNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : 0;
