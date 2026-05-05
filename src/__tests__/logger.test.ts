import { describe, it, expect, beforeEach } from "vitest";
import { debugLog, getLogs, clearLogs, initLogger } from "../logger";
import { afterEach, vi } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    clearLogs();
  });

  it("should store log when debug is true", () => {
    debugLog(true, "test message");
    const logs = getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain("test message");
  });

  it("should store log in memory when debug is false (for getLogs command)", () => {
    debugLog(false, "should appear in memory");
    const logs = getLogs();
    // Logs are always stored in memory, debug flag only controls console/file output
    expect(logs.length).toBe(1);
  });

  it("should include timestamp in log", () => {
    debugLog(true, "timestamp test");
    const logs = getLogs();
    expect(logs[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it("should cap at 500 entries", () => {
    for (let i = 0; i < 600; i++) {
      debugLog(true, `message ${i}`);
    }
    const logs = getLogs();
    expect(logs.length).toBeLessThanOrEqual(500);
  });

  it("should clear all logs", () => {
    debugLog(true, "msg1");
    debugLog(true, "msg2");
    clearLogs();
    expect(getLogs().length).toBe(0);
  });

});
