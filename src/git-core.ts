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
    return { username: "git", password: this.token };
  }

  // Embed credentials in URL — more reliable than onAuth for isomorphic-git
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
    await git.init({ fs, dir: this.dir, gitdir: this.gitdir, defaultBranch: "main" });
  }

  async listRemotes(): Promise<Array<{ remote: string; url: string }>> {
    return await git.listRemotes({ fs, dir: this.dir, gitdir: this.gitdir });
  }

  async addRemote(): Promise<void> {
    const remotes = await git.listRemotes({ fs, dir: this.dir, gitdir: this.gitdir });
    const existing = remotes.find((r) => r.remote === "origin");
    if (existing) {
      // Update if URL differs from configured
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

  private async doPull(branch: string): Promise<void> {
    await git.pull({
      fs,
      http,
      dir: this.dir,
      gitdir: this.gitdir,
      url: this.authUrl(),
      ref: branch,
      singleBranch: true,
      author: { name: "Obsidian Git Sync", email: "sync@obsidian.local" },
    });
  }

  async pullWithConflictDetection(): Promise<ConflictFile[]> {
    // Try main first, then master (Gitee default)
    for (const branch of ["main", "master"]) {
      try {
        await this.doPull(branch);
        this.log(`pull: ${branch} 成功`);
        return [];
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Merge conflict") || msg.includes("CONFLICT")) {
          return await this.scanConflicts();
        }
        if (msg.includes("Could not find") || msg.includes("Not Found") || msg.includes("Couldn't find")) {
          this.log(`pull: ${branch} 不存在, 尝试下一个`);
          continue;
        }
        if (msg.includes("401") || msg.includes("403")) {
          this.log(`pull: ${branch} 认证失败: ${msg.substring(0, 50)}`);
          continue;
        }
        throw err;
      }
    }
    return [];
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
      // Never add .git internal files (including nested repos)
      if (filepath.startsWith(".git/") || filepath === ".git" || filepath.includes("/.git/")) continue;
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
        if (filepath.startsWith(".git/") || filepath.includes("/.git/")) continue;
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
    // Push local main to remote — try both remote branch names
    const targets = [
      { ref: "main" },
      { ref: "main", remoteRef: "refs/heads/master" },
    ];
    for (const opts of targets) {
      try {
        await git.push({
          fs, http,
          dir: this.dir, gitdir: this.gitdir,
          url: this.authUrl(),
          force: true,
          ...opts,
        });
        this.log(`push: main -> ${opts.remoteRef || "main"} 成功`);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("unpack ok")) {
          this.log(`push: 成功 (unpack ok)`);
          return;
        }
        this.log(`push: main -> ${opts.remoteRef || "main"} 失败: ${msg.substring(0, 80)}`);
      }
    }
    throw new Error("push 失败: 无法推送到远程");
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
