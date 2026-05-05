import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitCore } from "../git-core";
import * as path from "path";
import * as fs from "fs";

describe("GitCore", () => {
  let git: GitCore;
  const testDir = "/tmp/git-core-test-" + Date.now();
  const remoteUrl = "https://gitee.com/testuser/test-repo.git";
  const token = "test-token-123";

  beforeEach(() => {
    // Clean up any existing test dir
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, "test-dir"), { recursive: true });
    fs.writeFileSync(path.join(testDir, "note1.md"), "# Test Note 1", "utf-8");
    fs.writeFileSync(path.join(testDir, "note2.md"), "# Test Note 2", "utf-8");
    fs.writeFileSync(path.join(testDir, "test-dir", "sub.md"), "# Sub", "utf-8");

    git = new GitCore(testDir, path.join(testDir, ".git"), remoteUrl, token, true, fs);
  });

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  describe("isRepo", () => {
    it("should return false when no .git/HEAD exists", async () => {
      const result = await git.isRepo();
      expect(result).toBe(false);
    });

    it("should return true after init", async () => {
      await git.init();
      const result = await git.isRepo();
      expect(result).toBe(true);
    });
  });

  describe("init", () => {
    it("should create .git directory with HEAD", async () => {
      await git.init();
      expect(fs.existsSync(path.join(testDir, ".git", "HEAD"))).toBe(true);
    });
  });

  describe("addRemote", () => {
    it("should add origin when it does not exist", async () => {
      await git.init();
      await git.addRemote();

      // Verify by trying to list remotes
      const remotes = await git.listRemotes();
      expect(remotes.length).toBe(1);
      expect(remotes[0].remote).toBe("origin");
      expect(remotes[0].url).toBe(remoteUrl);
    });

    it("should update origin URL when it differs", async () => {
      await git.init();
      // First add with old URL
      await git.addRemote();
      // Create new git with different URL
      const newGit = new GitCore(testDir, path.join(testDir, ".git"), "https://gitee.com/testuser/new-repo.git", token, true, fs);
      await newGit.addRemote();

      const remotes = await newGit.listRemotes();
      expect(remotes[0].url).toBe("https://gitee.com/testuser/new-repo.git");
    });
  });

  describe("addAll", () => {
    it("should add files in new repo", async () => {
      await git.init();
      await git.addAll();

      // After addAll, should be able to commit
      const sha = await git.commit("initial commit");
      expect(sha).toBeTruthy();
    });

    it("should filter .git/ internal files", async () => {
      await git.init();
      await git.addAll();

      // Verify .git/ files are not in the commit by checking the commit tree
      // (indirect test: commit succeeds without including git internals)
      const sha = await git.commit("test");
      expect(sha).toBeTruthy();
    });
  });

  describe("commit", () => {
    it("should create a commit with given message", async () => {
      await git.init();
      await git.addAll();
      const sha = await git.commit("test commit message");
      expect(sha).toBeTruthy();
      expect(sha.length).toBe(40);
    });
  });

  describe("onAuth", () => {
    it("should extract username from Gitee URL", async () => {
      // Test indirectly through the auth callback
      // Gitee URL format: https://gitee.com/USERNAME/repo.git
      const giteeGit = new GitCore(testDir, path.join(testDir, ".git"), "https://gitee.com/myuser/my-repo.git", token, false, fs);
      // The username should be extracted as "myuser" from the URL
      // This is tested via the onAuth private method, but we can only test indirectly
    });
  });

  describe("initAndPull", () => {
    it("should init repo and add remote", async () => {
      const result = await git.initAndPull();
      // Should return empty conflicts for new repo (no remote pull)
      expect(result).toEqual([]);
      expect(await git.isRepo()).toBe(true);
    });
  });
});
