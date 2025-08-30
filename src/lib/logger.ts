// src/lib/logger.ts
export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogContext = Record<string, unknown>;

function consoleMethod(level: LogLevel): "log" | "warn" | "error" {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  return "log";
}

export function log(level: LogLevel, msg: string, ctx: LogContext = {}): void {
  // كان فيه خطأ:  . , ctx    ← يتصلّح إلى ...ctx
  const rec = { level, msg, ts: new Date().toISOString(), ...ctx };
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
