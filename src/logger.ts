const logs: string[] = [];

export function debugLog(debug: boolean, msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  logs.push(line);
  if (logs.length > 500) logs.shift();
  if (debug) console.log("[GitSync]", line);
}

export function getLogs(): string[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
}
