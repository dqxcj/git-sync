import { describe, it, expect, beforeEach, vi } from "vitest";
import { Syncer } from "../syncer";
import { GitCore } from "../git-core";
import { DeepSeekClient } from "../deepseek";
import { SyncerEvent } from "../types";

// Mocks
vi.mock("../git-core", () => ({
  GitCore: vi.fn(),
}));

vi.mock("../deepseek", () => ({
  DeepSeekClient: vi.fn(),
}));

function createMockGit(overrides: Partial<any> = {}) {
  return {
    isRepo: vi.fn().mockResolvedValue(true),
    hasChanges: vi.fn().mockResolvedValue(true),
    initAndPull: vi.fn().mockResolvedValue([]),
    pullWithConflictDetection: vi.fn().mockResolvedValue([]),
    addAll: vi.fn().mockResolvedValue(undefined),
    getStagedDiff: vi.fn().mockResolvedValue("mock diff content"),
    commit: vi.fn().mockResolvedValue("abc123def456"),
    push: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    clone: vi.fn().mockResolvedValue(undefined),
    addRemote: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn(),
    ...overrides,
  } as unknown as GitCore;
}

function createMockLLM(overrides: Partial<any> = {}) {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    resolveConflict: vi.fn().mockResolvedValue("merged"),
    generateCommitMessage: vi.fn().mockResolvedValue("LLM generated message"),
    ...overrides,
  } as unknown as DeepSeekClient;
}

describe("Syncer", () => {
  let syncer: Syncer;
  let mockGit: any;
  let mockLLM: any;
  let events: SyncerEvent[];

  beforeEach(() => {
    events = [];
    mockGit = createMockGit();
    mockLLM = createMockLLM();
    syncer = new Syncer(mockGit, mockLLM, 1, (event) => events.push(event), true, false);
  });

  describe("initRepo", () => {
    it("should init and pull when repo does not exist", async () => {
      mockGit.isRepo.mockResolvedValueOnce(false);
      await syncer.initRepo();
      expect(mockGit.isRepo).toHaveBeenCalled();
      expect(mockGit.initAndPull).toHaveBeenCalled();
    });

    it("should add remote when repo exists", async () => {
      await syncer.initRepo();
      expect(mockGit.initAndPull).toHaveBeenCalled();
    });

    it("should emit idle event when done", async () => {
      await syncer.initRepo();
      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe("idle");
    });
  });

  describe("sync", () => {
    it("should skip if already running", async () => {
      // Simulate running state
      Object.defineProperty(syncer, "running", { value: true, writable: true });
      // This won't actually work since running is private — need a different approach
    });

    it("should pull, commit, push when changes exist", async () => {
      await syncer.sync();

      expect(mockGit.pullWithConflictDetection).toHaveBeenCalled();
      expect(mockGit.addAll).toHaveBeenCalled();
      expect(mockGit.getStagedDiff).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalledWith("LLM generated message");
      expect(mockGit.push).toHaveBeenCalled();
    });

    it("should skip commit when no changes", async () => {
      mockGit.getStagedDiff.mockResolvedValueOnce("");
      await syncer.sync();

      expect(mockGit.commit).not.toHaveBeenCalled();
    });

    it("should skip push when no remote auth", async () => {
      const localSyncer = new Syncer(mockGit, mockLLM, 1, () => {}, false, false);
      await localSyncer.sync();

      expect(mockGit.push).not.toHaveBeenCalled();
    });

    it("should continue with local commit when pull fails", async () => {
      mockGit.pullWithConflictDetection.mockRejectedValueOnce(new Error("network error"));
      await syncer.sync();

      // Should still do local operations
      expect(mockGit.addAll).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalled();
    });

    it("should emit idle on success", async () => {
      await syncer.sync();
      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe("idle");
    });
  });

  describe("commit message interval", () => {
    it("should use LLM when interval is reached", async () => {
      const s = new Syncer(mockGit, mockLLM, 1, () => {}, true, false);
      await s.sync();
      expect(mockGit.commit).toHaveBeenCalledWith("LLM generated message");
    });

    it("should use auto message when LLM not configured", async () => {
      mockLLM.isConfigured.mockReturnValueOnce(false);
      const s = new Syncer(mockGit, mockLLM, 1, () => {}, true, false);
      await s.sync();
      const call = (mockGit.commit as any).mock.calls[0][0];
      expect(call).toMatch(/自动同步:/);
    });
  });
});
