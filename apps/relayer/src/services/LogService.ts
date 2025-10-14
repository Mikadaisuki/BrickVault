/**
 * Log Service
 * Captures and stores relayer logs for API access
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

export class LogService {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000; // Keep last 1000 logs
  private logCounter: number = 0;

  constructor(maxLogs: number = 1000) {
    this.maxLogs = maxLogs;
  }

  /**
   * Add a log entry
   */
  log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `log-${++this.logCounter}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      data
    };

    this.logs.push(entry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Also log to console
    this.logToConsole(entry);
  }

  /**
   * Log to console with formatting
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    
    switch (entry.level) {
      case 'error':
        console.error(prefix, entry.message, entry.data || '');
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.data || '');
        break;
      case 'debug':
        console.debug(prefix, entry.message, entry.data || '');
        break;
      default:
        console.log(prefix, entry.message, entry.data || '');
    }
  }

  /**
   * Get all logs
   */
  getLogs(options?: {
    level?: LogLevel;
    category?: string;
    limit?: number;
    offset?: number;
    since?: number;
  }): LogEntry[] {
    let filteredLogs = [...this.logs];

    // Filter by level
    if (options?.level) {
      filteredLogs = filteredLogs.filter(log => log.level === options.level);
    }

    // Filter by category
    if (options?.category) {
      filteredLogs = filteredLogs.filter(log => log.category === options.category);
    }

    // Filter by timestamp (since)
    if (options?.since !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= options.since!);
    }

    // Sort by timestamp descending (most recent first)
    filteredLogs.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || filteredLogs.length;
    
    return filteredLogs.slice(offset, offset + limit);
  }

  /**
   * Get log statistics
   */
  getStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<string, number>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    const byLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    };

    const byCategory: Record<string, number> = {};

    this.logs.forEach(log => {
      byLevel[log.level]++;
      byCategory[log.category] = (byCategory[log.category] || 0) + 1;
    });

    return {
      total: this.logs.length,
      byLevel,
      byCategory,
      oldestTimestamp: this.logs.length > 0 ? this.logs[0].timestamp : null,
      newestTimestamp: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
    };
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
    this.logCounter = 0;
  }

  /**
   * Get available categories
   */
  getCategories(): string[] {
    const categories = new Set(this.logs.map(log => log.category));
    return Array.from(categories).sort();
  }

  /**
   * Convenience methods for different log levels
   */
  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', category, message, data);
  }
}

