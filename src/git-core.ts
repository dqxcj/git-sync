import * as git from "isomorphic-git";
import * as fs from "fs";
import * as path from "path";
import http from "isomorphic-git/http/node";
import { ConflictFile } from "./types";

export class GitCore {
  private dir: string;
  private gitdir: string;
  private remoteUrl: string;
  private token: string;

  constructor(dir: string, gitdir: string, remoteUrl: string, token: string) {
    this.dir = dir;
    this.gitdir = gitdir;
    this.remoteUrl = remoteUrl;
    this.token = token;
  }

  private onAuth() {
    return { username: "oauth2", password: this.token };
  }

  async isRepo(): Promise<boolean> {
    try {
      await git.log({ fs, dir: this.dir, gitdir: this.gitdir, depth: 1 });
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
    await Promise.all(
      status.map(([filepath, , worktreeStatus]) => {
        if (worktreeStatus) {
          return git.add({ fs, dir: this.dir, gitdir: this.gitdir, filepath });
        }
      })
    );
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
      const stagedFiles: string[] = [];
      const status = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir });
      for (const [filepath, headStatus, , stageStatus] of status) {
        if (stageStatus === 0 || headStatus !== stageStatus) {
          stagedFiles.push(filepath);
        }
      }
      if (stagedFiles.length === 0) return "";

      let diff = "";
      for (const filepath of stagedFiles) {
        try {
          const absPath = path.join(this.dir, filepath);
          const content = fs.readFileSync(absPath, "utf-8");
          diff += `\n--- a/${filepath}\n+++ b/${filepath}\n${content}\n`;
        } catch {
          // skip binary
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
