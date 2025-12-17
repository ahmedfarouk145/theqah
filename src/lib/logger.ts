// src/lib/logger.ts
/**
 * Structured Logging System
 * Enhanced with request tracking, timing, and convenience methods
 */

export type LogLevel = "info" | "warn" | "error" | "debug" | "fatal";
export type LogContext = Record<string, unknown>;

function consoleMethod(level: LogLevel): "log" | "warn" | "error" {
  if (level === "error" || level === "fatal") return "error";
  if (level === "warn") return "warn";
  return "log";
}

export function log(level: LogLevel, msg: string, ctx: LogContext = {}): void {
  const rec = { 
    level, 
    msg, 
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV,
    service: "theqah-api",
    ...ctx 
  };
  const method = consoleMethod(level);
  const line = JSON.stringify(rec);
  if (method === "error") console.error(line);
  else if (method === "warn") console.warn(line);
  else console.log(line);
}

export const info  = (m: string, c?: LogContext) => log("info", m, c || {});
export const warn  = (m: string, c?: LogContext) => log("warn", m, c || {});
export const error = (m: string, c?: LogContext) => log("error", m, c || {});
export const debug = (m: string, c?: LogContext) => log("debug", m, c || {});
export const fatal = (m: string, c?: LogContext) => log("fatal", m, c || {});

/**
 * Create logger with default context
 */
export function createLogger(defaultContext: LogContext) {
  return {
    info: (m: string, c?: LogContext) => info(m, { ...defaultContext, ...c }),
    warn: (m: string, c?: LogContext) => warn(m, { ...defaultContext, ...c }),
    error: (m: string, c?: LogContext) => error(m, { ...defaultContext, ...c }),
    debug: (m: string, c?: LogContext) => debug(m, { ...defaultContext, ...c }),
    fatal: (m: string, c?: LogContext) => fatal(m, { ...defaultContext, ...c }),
  };
}

/**
 * Measure operation duration
 */
export async function time<T>(
  operation: string,
  fn: () => Promise<T> | T,
  context?: LogContext
): Promise<T> {
  const start = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    
    info(`${operation} completed`, {
      ...context,
      duration,
      success: true,
    });
    
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    
    error(`${operation} failed`, {
      ...context,
      duration,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    
    throw err;
  }
}

/**
 * Convenience logging functions for common patterns
 */
export const logger = {
  api: (endpoint: string, method: string, statusCode: number, duration: number, ctx?: LogContext) => {
    info("API Request", { ...ctx, endpoint, method, statusCode, duration });
  },
  
  database: (operation: string, collection: string, duration: number, ctx?: LogContext) => {
    debug("Database Operation", { ...ctx, operation, collection, duration });
  },
  
  external: (service: string, operation: string, duration: number, success: boolean, ctx?: LogContext) => {
    info("External Service Call", { ...ctx, service, operation, duration, success });
  },
  
  auth: (action: string, userId?: string, success?: boolean, ctx?: LogContext) => {
    info("Authentication", { ...ctx, action, userId, success });
  },
  
  sync: (storeUid: string, type: string, reviewCount: number, duration: number, ctx?: LogContext) => {
    info("Sync Operation", { ...ctx, storeUid, type, reviewCount, duration });
  },
  
  webhook: (event: string, storeUid: string, success: boolean, ctx?: LogContext) => {
    info("Webhook Processed", { ...ctx, event, storeUid, success });
  },
  
  metric: (name: string, value: number, labels?: Record<string, string>) => {
    debug("Metric Tracked", { metric: name, value, labels });
  },
};

export default { info, warn, error, debug, fatal, logger, createLogger, time };
