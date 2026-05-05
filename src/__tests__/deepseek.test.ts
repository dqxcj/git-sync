import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeepSeekClient } from "../deepseek";
import { DeepSeekMessage } from "../types";

function mockFetch(response: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(response),
  });
}

describe("DeepSeekClient", () => {
  let client: DeepSeekClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    client = new DeepSeekClient("sk-test-key", "https://api.deepseek.com", "deepseek-v4-flash");
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("isConfigured", () => {
    it("should return true when API key is set", () => {
      expect(client.isConfigured()).toBe(true);
    });

    it("should return false when API key is empty", () => {
      const c = new DeepSeekClient("");
      expect(c.isConfigured()).toBe(false);
    });
  });

  describe("resolveConflict", () => {
    it("should send merge prompt to DeepSeek", async () => {
      global.fetch = mockFetch({
        choices: [{ message: { content: "merged content here" } }],
      });

      const result = await client.resolveConflict("ours content", "theirs content");
      expect(result).toBe("merged content here");

      const call = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe("deepseek-v4-flash");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).toContain("<<<<<<< HEAD");
      expect(body.messages[1].content).toContain("ours content");
      expect(body.messages[1].content).toContain("=======");
      expect(body.messages[1].content).toContain("theirs content");
    });
  });

  describe("generateCommitMessage", () => {
    it("should send commit prompt with combined diffs", async () => {
      global.fetch = mockFetch({
        choices: [{ message: { content: "更新笔记内容" } }],
      });

      const result = await client.generateCommitMessage(["diff1", "diff2"]);
      expect(result).toBe("更新笔记内容");

      const call = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.messages[0].content).toContain("commit message");
      expect(body.messages[1].content).toContain("diff1");
      expect(body.messages[1].content).toContain("diff2");
    });

    it("should join multiple diffs with separator", async () => {
      global.fetch = mockFetch({
        choices: [{ message: { content: "ok" } }],
      });

      await client.generateCommitMessage(["a", "b", "c"]);
      const call = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.messages[1].content).toContain("---");
    });
  });

  describe("error handling", () => {
    it("should throw on non-ok response", async () => {
      global.fetch = mockFetch({}, 401);

      await expect(client.resolveConflict("a", "b")).rejects.toThrow("DeepSeek API error");
    });
  });
});
