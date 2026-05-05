import * as fs from "fs";

const logs: string[] = [];
let logFilePath: string | null = null;

export function initLogger(vaultPath: string): void {
  logFilePath = vaultPath + "/.git-sync-debug.log";
}

export function debugLog(debug: boolean, msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  logs.push(line);
  if (logs.length > 500) logs.shift();
  if (debug) {
    console.log("[GitSync]", line);
    if (logFilePath) {
      try { fs.appendFileSync(logFilePath, line + "\n"); } catch {}
    }
  }
}

export function getLogs(): string[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
  if (logFilePath) {
    try { fs.writeFileSync(logFilePath, ""); } catch {}
  }
}
