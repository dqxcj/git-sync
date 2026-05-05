import * as git from "isomorphic-git";
import * as fs from "fs";
import * as path from "path";
import http from "isomorphic-git/http/node";
import { ConflictFile } from "./types";
import { debugLog } from "./logger";

const BRANCH = "master";

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

  private authUrl(): string {
    let username = "git";
    const match = this.remoteUrl.match(/\/([^\/]+)\/[^\/]+(?:\.git)?$/);
    if (match) username = match[1];
    return this.remoteUrl.replace("https://", `https://${encodeURIComponent(username)}:${encodeURIComponent(this.token)}@`);
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
    await git.init({ fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: BRANCH });
  }

  async listRemotes(): Promise<Array<{ remote: string; url: string }>> {
    return await git.listRemotes({ fs, dir: this.dir, gitdir: this.gitdir });
  }

  async hasChanges(): Promise<boolean> {
    const status = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
    for (const [filepath, , worktreeStatus] of status) {
      if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
      if (filepath === ".git-sync-debug.log") continue;
      if (worktreeStatus) return true;
    }
    return false;
  }

  async addRemote(): Promise<void> {
    const remotes = await git.listRemotes({ fs, dir: this.dir, gitdir: this.gitdir });
    const existing = remotes.find((r) => r.remote === "origin");
    if (existing) {
      if (existing.url !== this.remoteUrl) {
        this.log(`addRemote: 更新 origin URL: ${existing.url} -> ${this.remoteUrl}`);
        await git.deleteRemote({ fs, dir: this.dir, gitdir: this.gitdir, remote: "origin" });
        await git.addRemote({ fs, dir: this.dir, gitdir: this.gitdir, remote: "origin", url: this.remoteUrl });
      } else {
        this.log(`addRemote: origin 已存在, URL匹配`);
      }
    } else {
      await git.addRemote({ fs, dir: this.dir, gitdir: this.gitdir, remote: "origin", url: this.remoteUrl });
      this.log(`addRemote: 添加 origin -> ${this.remoteUrl}`);
    }
  }

  async pullWithConflictDetection(): Promise<ConflictFile[]> {
    try {
      await git.pull({
        fs, http,
        dir: this.dir, gitdir: this.gitdir,
        url: this.authUrl(),
        ref: BRANCH, singleBranch: true,
        author: { name: "Obsidian Git Sync", email: "sync@obsidian.local" },
      });
      this.log(`pull: 成功`);
      return [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Merge conflict") || msg.includes("CONFLICT")) {
        return await this.scanConflicts();
      }
      if (msg.includes("Could not find") || msg.includes("Not Found") || msg.includes("Couldn't find")) {
        this.log(`pull: 远程无 ${BRANCH} 分支 (空仓库)`);
        return [];
      }
      if (msg.includes("401") || msg.includes("403")) {
        this.log(`pull: 认证失败: ${msg.substring(0, 50)}`);
        // Don't throw — try push later
        return [];
      }
      this.log(`pull: 失败 (继续) — ${msg.substring(0, 80)}`);
      return [];
    }
  }

  private async scanConflicts(): Promise<ConflictFile[]> {
    const conflicts: ConflictFile[] = [];
    const files = await git.listFiles({ fs, dir: this.dir, gitdir: this.gitdir });
    for (const filepath of files) {
      if (filepath.match(/\.(md|txt|json|css|js|ts|yml|yaml|html|canvas)$/)) {
        try {
          const absPath = path.join(this.dir, filepath);
          const content = fs.readFileSync(absPath, "utf-8");
          if (content.includes("<<<<<<<") || content.includes(">>>>>>>")) {
            conflicts.push({ path: absPath, content });
          }
        } catch { /* skip */ }
      }
    }
    return conflicts;
  }

  writeFile(filepath: string, content: string): void {
    fs.writeFileSync(filepath, content, "utf-8");
  }

  async addAll(): Promise<void> {
    const status = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
    this.log(`addAll: StatusMatrix 返回 ${status.length} 条, dir=${this.dir}`);
    const toAdd: string[] = [];
    for (const [filepath, , worktreeStatus] of status) {
      if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
      if (filepath === ".git-sync-debug.log") continue;
      if (worktreeStatus) toAdd.push(filepath);
    }
    if (toAdd.length === 0) {
      this.walkFiles((relPath) => toAdd.push(relPath));
    }
    this.log(`addAll: 准备添加 ${toAdd.length} 个文件: ${toAdd.slice(0, 5).join(", ")}`);
    if (toAdd.length > 0) {
      await Promise.all(toAdd.map((f) => git.add({ fs, dir: this.dir, gitdir: this.gitdir, filepath: f })));
    }
  }

  private walkFiles(cb: (relPath: string) => void, subDir: string = ""): void {
    const base = path.join(this.dir, subDir);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const relPath = subDir ? path.join(subDir, entry.name) : entry.name;
      if (entry.name === ".git" || entry.name === ".obsidian") continue;
      if (entry.isDirectory()) { this.walkFiles(cb, relPath); }
      else { cb(relPath); }
    }
  }

  async commit(message: string): Promise<string> {
    return await git.commit({
      fs, dir: this.dir, gitdir: this.gitdir, message,
      author: { name: "Obsidian Git Sync", email: "sync@obsidian.local" },
    });
  }

  async getStagedDiff(): Promise<string> {
    try {
      const status = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
      const changedFiles: string[] = [];
      for (const [filepath, headStatus, workdirStatus, stageStatus] of status) {
        if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
        if (filepath === ".git-sync-debug.log") continue;
        if (stageStatus === 0 || workdirStatus !== headStatus) changedFiles.push(filepath);
      }
      if (changedFiles.length === 0) return "";
      let diff = "";
      for (const filepath of changedFiles) {
        try {
          const absPath = path.join(this.dir, filepath);
          if (fs.existsSync(absPath)) {
            diff += `\n${filepath} (${fs.readFileSync(absPath, "utf-8").length} bytes)\n`;
          }
        } catch { /* skip */ }
      }
      return diff;
    } catch { return ""; }
  }

  async push(): Promise<void> {
    try {
      await git.push({
        fs, http,
        dir: this.dir, gitdir: this.gitdir,
        url: this.authUrl(),
        ref: BRANCH,
        force: false,
      });
      this.log(`push: 成功`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("unpack ok")) { this.log(`push: 成功 (unpack ok)`); return; }
      if (msg.includes("fast-forward") || msg.includes("rejected")) {
        this.log(`push: 被拒绝, 远程有更新, 需先 pull`);
        throw err;
      }
      this.log(`push: 失败 — ${msg.substring(0, 80)}`);
      throw err;
    }
  }

  async initAndPull(): Promise<ConflictFile[]> {
    const exists = await this.isRepo();
    if (!exists) {
      await git.init({ fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: BRANCH });
    }
    await this.addRemote();
    return await this.pullWithConflictDetection();
  }
}
