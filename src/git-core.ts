import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { ConflictFile } from "./types";
import { debugLog } from "./logger";

const BRANCH = "master";

function join(...segments: string[]): string {
  return segments.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || ".";
}

export class GitCore {
  private dir: string;
  private gitdir: string;
  private remoteUrl: string;
  private token: string;
  private debug: boolean;
  private fs: any;

  constructor(dir: string, gitdir: string, remoteUrl: string, token: string, debug = false, fs?: any) {
    this.dir = dir;
    this.gitdir = gitdir;
    this.remoteUrl = remoteUrl;
    this.token = token;
    this.debug = debug;
    this.fs = fs || {};
  }

  private log(msg: string): void { debugLog(this.debug, msg); }

  private authUrl(): string {
    let username = "git";
    const m = this.remoteUrl.match(/\/([^\/]+)\/[^\/]+(?:\.git)?$/);
    if (m) username = m[1];
    return this.remoteUrl.replace("https://", `https://${encodeURIComponent(username)}:${encodeURIComponent(this.token)}@`);
  }

  async isRepo(): Promise<boolean> {
    try {
      if (this.fs.statSync) {
        this.fs.statSync(join(this.gitdir, "HEAD"));
        return true;
      }
      // Mobile: try reading HEAD via promises
      await this.fs.promises.readFile(join(this.gitdir, "HEAD"));
      return true;
    } catch { return false; }
  }

  async init(): Promise<void> {
    await git.init({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: BRANCH });
  }

  async listRemotes(): Promise<Array<{ remote: string; url: string }>> {
    return await git.listRemotes({ fs: this.fs, dir: this.dir, gitdir: this.gitdir });
  }

  async hasChanges(): Promise<boolean> {
    const status = await git.statusMatrix({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
    for (const [filepath, , worktreeStatus] of status) {
      if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
      if (filepath === ".git-sync-debug.log") continue;
      if (worktreeStatus) return true;
    }
    return false;
  }

  async addRemote(): Promise<void> {
    const remotes = await git.listRemotes({ fs: this.fs, dir: this.dir, gitdir: this.gitdir });
    const existing = remotes.find((r: any) => r.remote === "origin");
    if (existing) {
      if (existing.url !== this.remoteUrl) {
        this.log(`addRemote: 更新 origin URL: ${existing.url} -> ${this.remoteUrl}`);
        await git.deleteRemote({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, remote: "origin" });
        await git.addRemote({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, remote: "origin", url: this.remoteUrl });
      }
    } else {
      await git.addRemote({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, remote: "origin", url: this.remoteUrl });
    }
  }

  async pullWithConflictDetection(): Promise<ConflictFile[]> {
    try {
      await git.pull({
        fs: this.fs, http,
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
      if (msg.includes("Could not find") || msg.includes("Not Found")) {
        this.log(`pull: 远程无 ${BRANCH} 分支`);
        return [];
      }
      this.log(`pull: 失败 — ${msg.substring(0, 80)}`);
      return [];
    }
  }

  private async scanConflicts(): Promise<ConflictFile[]> {
    const conflicts: ConflictFile[] = [];
    const files = await git.listFiles({ fs: this.fs, dir: this.dir, gitdir: this.gitdir });
    for (const filepath of files) {
      if (!filepath.match(/\.(md|txt|json|css|js|ts|yml|yaml|html|canvas)$/)) continue;
      try {
        const abs = join(this.dir, filepath);
        let content: string;
        if (this.fs.readFileSync) {
          content = this.fs.readFileSync(abs, "utf-8");
        } else {
          content = await this.fs.promises.readFile(abs);
        }
        if (content.includes("<<<<<<<") || content.includes(">>>>>>>")) {
          conflicts.push({ path: abs, content });
        }
      } catch { /* skip */ }
    }
    return conflicts;
  }

  writeFile(filepath: string, content: string): void {
    if (this.fs.writeFileSync) {
      this.fs.writeFileSync(filepath, content, "utf-8");
    } else {
      this.fs.promises.writeFile(filepath, content);
    }
  }

  async addAll(): Promise<void> {
    const status = await git.statusMatrix({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
    const toAdd: string[] = [];
    for (const [filepath, , worktreeStatus] of status) {
      if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
      if (filepath === ".git-sync-debug.log") continue;
      if (worktreeStatus) toAdd.push(filepath);
    }
    if (toAdd.length > 0) {
      this.log(`addAll: 添加 ${toAdd.length} 个文件`);
      await Promise.all(toAdd.map((f) => git.add({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, filepath: f })));
    }
  }

  async commit(message: string): Promise<string> {
    return await git.commit({
      fs: this.fs, dir: this.dir, gitdir: this.gitdir, message,
      author: { name: "Obsidian Git Sync", email: "sync@obsidian.local" },
    });
  }

  async getStagedDiff(): Promise<string> {
    try {
      const status = await git.statusMatrix({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, ignored: true });
      const changed: string[] = [];
      for (const [filepath, headStatus, workdirStatus, stageStatus] of status) {
        if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
        if (filepath === ".git-sync-debug.log") continue;
        if (stageStatus === 0 || workdirStatus !== headStatus) changed.push(filepath);
      }
      if (changed.length === 0) return "";
      let diff = "";
      for (const fp of changed) {
        try {
          const abs = join(this.dir, fp);
          const data = this.fs.readFileSync ? this.fs.readFileSync(abs, "utf-8") : await this.fs.promises.readFile(abs);
          diff += `\n${fp} (${data.length} bytes)\n`;
        } catch { /* skip */ }
      }
      return diff;
    } catch { return ""; }
  }

  async push(): Promise<void> {
    await git.push({
      fs: this.fs, http,
      dir: this.dir, gitdir: this.gitdir,
      url: this.authUrl(),
      ref: BRANCH, force: false,
    });
    this.log(`push: 成功`);
  }

  async initAndPull(): Promise<ConflictFile[]> {
    if (!await this.isRepo()) {
      await git.init({ fs: this.fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: BRANCH });
    }
    await this.addRemote();
    return await this.pullWithConflictDetection();
  }
}
