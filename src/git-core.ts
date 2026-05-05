import * as git from "isomorphic-git";
import * as fs from "fs";
import * as path from "path";
import http from "isomorphic-git/http/node";
import { ConflictFile } from "./types";
import { debugLog } from "./logger";

export class GitCore {
  private dir: string;
  private gitdir: string;
  private remoteUrl: string;
  private token: string;
  private debug: boolean;

  constructor(dir: string, gitdir: string, remoteUrl: string, token: string, debug: boolean = false) {
    this.dir = dir;
    this.gitdir = gitdir;
    this.remoteUrl = remoteUrl;
    this.token = token;
    this.debug = debug;
  }

  private log(msg: string): void {
    debugLog(this.debug, msg);
  }

  private onAuth() {
    return { username: "oauth2", password: this.token };
  }

  async isRepo(): Promise<boolean> {
    try {
      fs.statSync(path.join(this.gitdir, "HEAD"));
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await git.init({ fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: "main" });
  }

  async addRemote(): Promise<void> {
    const remotes = await git.listRemotes({ fs, dir: this.dir, gitdir: this.gitdir });
    const hasOrigin = remotes.some((r) => r.remote === "origin");
    if (!hasOrigin) {
      await git.addRemote({ fs, dir: this.dir, gitdir: this.gitdir, remote: "origin", url: this.remoteUrl });
    }
  }

  private async doPull(): Promise<void> {
    await git.pull({
      fs,
      http,
      dir: this.dir,
      gitdir: this.gitdir,
      remote: "origin",
      ref: "main",
      singleBranch: true,
      author: { name: "Obsidian Git Sync", email: "sync@obsidian.local" },
      onAuth: () => this.onAuth(),
    });
  }

  async pullWithConflictDetection(): Promise<ConflictFile[]> {
    try {
      await this.doPull();
      return [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Merge conflict") || msg.includes("CONFLICT")) {
        return await this.scanConflicts();
      }
      throw err;
    }
  }

  private async scanConflicts(): Promise<ConflictFile[]> {
    const conflicts: ConflictFile[] = [];
    const files = await git.listFiles({ fs, dir: this.dir, gitdir: this.gitdir });
    for (const filepath of files) {
      // Only read Markdown/text files (skip binaries)
      if (filepath.match(/\.(md|txt|json|css|js|ts|yml|yaml|html|canvas)$/)) {
        try {
          const absPath = path.join(this.dir, filepath);
          const content = fs.readFileSync(absPath, "utf-8");
          if (content.includes("<<<<<<<") || content.includes(">>>>>>>")) {
            conflicts.push({ path: absPath, content });
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
    return conflicts;
  }

  writeFile(filepath: string, content: string): void {
    fs.writeFileSync(filepath, content, "utf-8");
  }

  async addAll(): Promise<void> {
    const status = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
    this.log(`addAll: StatusMatrix 返回 ${status.length} 条, dir=${this.dir}, gitdir=${this.gitdir}`);
    const toAdd: string[] = [];
    for (const [filepath, , worktreeStatus] of status) {
      if (worktreeStatus) {
        toAdd.push(filepath);
      } else if (this.debug) {
        this.log(`addAll: 跳过 ${filepath} (worktreeStatus=${worktreeStatus})`);
      }
    }

    // Fallback for brand-new repos without HEAD: walk directory manually
    if (toAdd.length === 0) {
      this.log("addAll: statusMatrix empty, walking directory");
      this.walkFiles((relPath) => {
        toAdd.push(relPath);
        this.log(`addAll: walk发现 ${relPath}`);
      });
    }

    this.log(`addAll: 准备添加 ${toAdd.length} 个文件: ${toAdd.slice(0, 10).join(", ")}`);
    if (toAdd.length > 0) {
      await Promise.all(
        toAdd.map((f) => git.add({ fs, dir: this.dir, gitdir: this.gitdir, filepath: f }))
      );
      this.log("addAll: git.add 完成");
    }
  }

  private walkFiles(cb: (relPath: string) => void, subDir: string = ""): void {
    const base = path.join(this.dir, subDir);
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = subDir ? path.join(subDir, entry.name) : entry.name;
      if (entry.name === ".git" || entry.name === ".obsidian") continue;
      if (entry.isDirectory()) {
        this.walkFiles(cb, relPath);
      } else {
        cb(relPath);
      }
    }
  }

  async commit(message: string): Promise<string> {
    const sha = await git.commit({
      fs,
      dir: this.dir,
      gitdir: this.gitdir,
      message,
      author: { name: "Obsidian Git Sync", email: "sync@obsidian.local" },
    });
    return sha;
  }

  async getStagedDiff(): Promise<string> {
    try {
      // Use git diff to detect changes (more reliable than checking status)
      const status = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
      const changedFiles: string[] = [];
      for (const [filepath, headStatus, workdirStatus, stageStatus] of status) {
        // staged: stageStatus === 0 (after add) or workdirStatus !== headStatus (changed)
        if (stageStatus === 0 || workdirStatus !== headStatus) {
          changedFiles.push(filepath);
        }
      }

      // Fallback for new repo: just check if any files were added
      if (changedFiles.length === 0) return "";

      let diff = "";
      for (const filepath of changedFiles) {
        try {
          const absPath = path.join(this.dir, filepath);
          if (fs.existsSync(absPath)) {
            const content = fs.readFileSync(absPath, "utf-8");
            diff += `\n${filepath} (${content.length} bytes)\n`;
          }
        } catch {
          // skip binary or unreadable
        }
      }
      return diff;
    } catch {
      return "";
    }
  }

  async push(): Promise<void> {
    await git.push({
      fs,
      http,
      dir: this.dir,
      gitdir: this.gitdir,
      remote: "origin",
      ref: "main",
      onAuth: () => this.onAuth(),
    });
  }

  async initAndPull(): Promise<ConflictFile[]> {
    const exists = await this.isRepo();
    if (!exists) {
      await git.init({ fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: "main" });
    }
    await this.addRemote();
    try {
      return await this.pullWithConflictDetection();
    } catch {
      // Remote may be empty (new repo) — that's fine, sync() will push later
      return [];
    }
  }
}
