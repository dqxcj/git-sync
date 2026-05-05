# Obsidian Git Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that syncs vault data via isomorphic-git + resolves conflicts and generates commit messages using DeepSeek LLM.

**Architecture:** Plugin class (`src/main.ts`) owns a Syncer per repo (notes + optional config). Each Syncer runs a state machine: pull → detect conflicts → LLM merge → LLM commit → push. Git operations delegate to `git-core.ts` (isomorphic-git wrapper). LLM calls delegate to `deepseek.ts`. Settings UI is native Obsidian `PluginSettingTab`. Status bar shows sync state.

**Tech Stack:** TypeScript, esbuild, isomorphic-git, Obsidian Plugin API, DeepSeek API

---

### Task 1: Project Scaffolding

**Files:**
- Create: `D:\Code\obsidian-git-sync\package.json`
- Create: `D:\Code\obsidian-git-sync\tsconfig.json`
- Create: `D:\Code\obsidian-git-sync\esbuild.config.mjs`
- Create: `D:\Code\obsidian-git-sync\manifest.json`
- Create: `D:\Code\obsidian-git-sync\styles.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "obsidian-git-sync",
  "version": "0.1.0",
  "description": "Auto-sync Obsidian vault via isomorphic-git with LLM conflict resolution",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "typecheck": "tsc -noEmit -skipLibCheck"
  },
  "author": "dqxcj",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^16.11.6",
    "builtin-modules": "3.3.0",
    "esbuild": "0.17.3",
    "obsidian": "latest",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "isomorphic-git": "^1.25.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2020",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "allowSyntheticDefaultImports": true,
    "lib": ["DOM", "ES5", "ES6", "ES7", "ES2020"]
  },
  "include": ["src/**/*.ts", "main.ts"]
}
```

- [ ] **Step 3: Create esbuild.config.mjs**

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: "" },
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: true,
  treeShaking: true,
  minify: prod,
  legalComments: "none",
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 4: Create manifest.json**

```json
{
  "id": "git-sync",
  "name": "Git Sync",
  "version": "0.1.0",
  "minAppVersion": "1.5.8",
  "description": "Auto-sync vault via isomorphic-git with LLM conflict resolution and commit messages",
  "author": "dqxcj",
  "authorUrl": "https://github.com/dqxcj/obsidian-git-sync",
  "isDesktopOnly": false
}
```

- [ ] **Step 5: Create styles.css**

```css
.git-sync-status-ok { color: var(--text-muted); }
.git-sync-status-error { color: var(--text-error); }
.git-sync-status-syncing { color: var(--text-accent); }
```

- [ ] **Step 6: Install dependencies**

```bash
cd D:\Code\obsidian-git-sync && npm install
```

Expected: node_modules created, no errors.

- [ ] **Step 7: Commit**

```bash
cd D:\Code\obsidian-git-sync && git init && git add -A && git commit -m "chore: scaffold Obsidian plugin project"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\types.ts`

- [ ] **Step 1: Define all TypeScript interfaces**

```typescript
export type SyncStrategy = "manual" | "startup-shutdown" | "timer" | "all";

export type SyncState = "idle" | "pulling" | "pushing" | "error";

export interface RepoConfig {
  remoteUrl: string;
  token: string;
  enabled: boolean;
}

export interface PluginSettings {
  notesRepo: RepoConfig;
  configRepo: RepoConfig;
  syncStrategy: SyncStrategy;
  timerInterval: number;
  llmCommitInterval: number;
  deepseekApiKey: string;
  deepseekUrl: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  notesRepo: { remoteUrl: "", token: "", enabled: true },
  configRepo: { remoteUrl: "", token: "", enabled: false },
  syncStrategy: "timer",
  timerInterval: 30,
  llmCommitInterval: 1,
  deepseekApiKey: "",
  deepseekUrl: "https://api.deepseek.com",
};

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekResponse {
  choices: Array<{ message: { content: string } }>;
}

export interface ConflictFile {
  path: string;
  content: string;
}

export interface SyncerEvent {
  type: "pulling" | "conflict" | "merging" | "committing" | "pushing" | "idle" | "error";
  message?: string;
}

export type SyncerCallback = (event: SyncerEvent) => void;
```

- [ ] **Step 2: Verify types compile**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: No errors (may show warnings if obsidian types aren't fully resolved — ignore warnings, ensure no errors from types.ts).

- [ ] **Step 3: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/types.ts && git commit -m "feat: add type definitions"
```

---

### Task 3: DeepSeek API Client

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\deepseek.ts`

- [ ] **Step 1: Implement DeepSeek client**

```typescript
import { DeepSeekMessage, DeepSeekResponse } from "./types";

export class DeepSeekClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.deepseek.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async chat(messages: DeepSeekMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data: DeepSeekResponse = await response.json();
    return data.choices[0].message.content;
  }

  async resolveConflict(oursContent: string, theirsContent: string): Promise<string> {
    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are a Git merge assistant. Merge two conflicting versions of a file. Preserve all meaningful changes from both sides. Output ONLY the merged file content, no explanations, no markdown fences.",
      },
      {
        role: "user",
        content: `<<<<<<< HEAD\n${oursContent}\n=======\n${theirsContent}\n>>>>>>> remote`,
      },
    ];
    return await this.chat(messages);
  }

  async generateCommitMessage(diffs: string[]): Promise<string> {
    const combinedDiff = diffs.join("\n\n---\n\n");
    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are a commit message generator. Summarize the following git diff(s) into ONE concise commit message in Chinese. Max 50 characters. Output ONLY the commit message, no quotes, no markdown.",
      },
      {
        role: "user",
        content: combinedDiff,
      },
    ];
    return await this.chat(messages);
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }
}
```

- [ ] **Step 2: Verify type check**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/deepseek.ts && git commit -m "feat: add DeepSeek API client"
```

---

### Task 4: Git Core (isomorphic-git Wrapper)

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\git-core.ts`

- [ ] **Step 1: Implement GitCore class**

```typescript
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

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
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
    try {
      await git.getRemote({ fs, dir: this.dir, gitdir: this.gitdir, remote: "origin" });
    } catch {
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
      headers: this.authHeaders(),
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
    const filesToAdd: string[] = [];
    await Promise.all(
      status.map(([filepath, , worktreeStatus]) => {
        if (worktreeStatus) {
          filesToAdd.push(filepath);
        }
        return git.add({ fs, dir: this.dir, gitdir: this.gitdir, filepath });
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
      // Get diff between HEAD and index (staged changes)
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
      headers: this.authHeaders(),
    });
  }

  async clone(): Promise<void> {
    await git.clone({
      fs,
      http,
      dir: this.dir,
      gitdir: this.gitdir,
      url: this.remoteUrl,
      singleBranch: true,
      depth: 1,
      headers: this.authHeaders(),
    });
  }
}
```

- [ ] **Step 2: Verify type check**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: May show warnings about isomorphic-git types. Fix any errors.

- [ ] **Step 3: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/git-core.ts && git commit -m "feat: add isomorphic-git wrapper"
```

---

### Task 5: Syncer State Machine

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\syncer.ts`

- [ ] **Step 1: Implement Syncer class**

```typescript
import { GitCore } from "./git-core";
import { DeepSeekClient } from "./deepseek";
import { ConflictFile, SyncerCallback, SyncerEvent } from "./types";

export class Syncer {
  private git: GitCore;
  private llm: DeepSeekClient;
  private onEvent: SyncerCallback;
  private commitCounter: number = 0;
  private accumulatedDiffs: string[] = [];
  private llmCommitInterval: number;
  private running: boolean = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    git: GitCore,
    llm: DeepSeekClient,
    llmCommitInterval: number,
    onEvent: SyncerCallback
  ) {
    this.git = git;
    this.llm = llm;
    this.llmCommitInterval = llmCommitInterval;
    this.onEvent = onEvent;
  }

  private emit(event: SyncerEvent): void {
    this.onEvent(event);
  }

  async initRepo(): Promise<void> {
    const exists = await this.git.isRepo();
    if (!exists) {
      this.emit({ type: "pulling", message: "Cloning..." });
      await this.git.clone();
      this.emit({ type: "idle", message: "Cloned" });
      return;
    }
    await this.git.addRemote();
  }

  async sync(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // 1. Pull
      this.emit({ type: "pulling", message: "Pulling..." });
      const conflicts = await this.git.pullWithConflictDetection();

      // 2. Resolve conflicts
      if (conflicts.length > 0) {
        this.emit({ type: "conflict", message: `${conflicts.length} conflict(s)` });
        await this.resolveConflicts(conflicts);
      }

      // 3. Check local changes
      await this.git.addAll();
      const diff = await this.git.getStagedDiff();

      if (diff) {
        // 4. Commit
        this.emit({ type: "committing", message: "Committing..." });
        const message = await this.generateCommitMessage(diff);
        await this.git.commit(message);

        // 5. Push
        this.emit({ type: "pushing", message: "Pushing..." });
        await this.git.push();
      }

      this.emit({ type: "idle", message: "OK" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit({ type: "error", message: msg });
    } finally {
      this.running = false;
    }
  }

  private async resolveConflicts(conflicts: ConflictFile[]): Promise<void> {
    if (!this.llm.isConfigured()) {
      throw new Error("LLM not configured, cannot resolve conflicts");
    }

    for (const file of conflicts) {
      this.emit({ type: "merging", message: `Merging ${file.path}` });
      const markerPattern = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]+\n?/g;
      let match: RegExpExecArray | null;
      let result = file.content;

      while ((match = markerPattern.exec(file.content)) !== null) {
        const ours = match[1].trim();
        const theirs = match[2].trim();
        const merged = await this.llm.resolveConflict(ours, theirs);
        result = result.replace(match[0], merged + "\n");
      }

      this.git.writeFile(file.path, result);
    }
    await this.git.addAll();
  }

  private async generateCommitMessage(diff: string): Promise<string> {
    this.commitCounter++;
    this.accumulatedDiffs.push(diff);

    if (this.llm.isConfigured() && this.commitCounter >= this.llmCommitInterval) {
      const message = await this.llm.generateCommitMessage(this.accumulatedDiffs);
      this.commitCounter = 0;
      this.accumulatedDiffs = [];
      return message;
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return `[auto] update: ${ts}`;
  }

  startTimer(intervalMinutes: number): void {
    this.stopTimer();
    this.timer = setInterval(() => this.sync(), intervalMinutes * 60 * 1000);
  }

  stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
```

- [ ] **Step 2: Verify type check**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/syncer.ts && git commit -m "feat: add syncer state machine"
```

---

### Task 6: Settings UI

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\settings.ts`

- [ ] **Step 1: Implement SettingsTab**

```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import GitSyncPlugin from "./main";
import { DEFAULT_SETTINGS, SyncStrategy } from "./types";

export class GitSyncSettingTab extends PluginSettingTab {
  plugin: GitSyncPlugin;

  constructor(app: App, plugin: GitSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Git Sync Settings" });

    // --- Notes Repo Section ---
    containerEl.createEl("h3", { text: "Notes Repository" });

    new Setting(containerEl)
      .setName("Remote URL")
      .setDesc("Git remote for notes (Gitee/GitHub HTTPS URL)")
      .addText((text) =>
        text
          .setPlaceholder("https://gitee.com/user/notes.git")
          .setValue(this.plugin.settings.notesRepo.remoteUrl)
          .onChange(async (value) => {
            this.plugin.settings.notesRepo.remoteUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Token")
      .setDesc("Personal access token for notes repo")
      .addText((text) =>
        text
          .setPlaceholder("ghp_xxx or gitee token")
          .setValue(this.plugin.settings.notesRepo.token)
          .onChange(async (value) => {
            this.plugin.settings.notesRepo.token = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Config Repo Section ---
    containerEl.createEl("h3", { text: "Config Repository (.obsidian/)" });

    new Setting(containerEl)
      .setName("Enable config repo")
      .setDesc("Sync .obsidian/ separately (plugins, themes, settings)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.configRepo.enabled)
          .onChange(async (value) => {
            this.plugin.settings.configRepo.enabled = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.configRepo.enabled) {
      new Setting(containerEl)
        .setName("Config Remote URL")
        .setDesc("Git remote for .obsidian/ config")
        .addText((text) =>
          text
            .setPlaceholder("https://gitee.com/user/obsidian-config.git")
            .setValue(this.plugin.settings.configRepo.remoteUrl)
            .onChange(async (value) => {
              this.plugin.settings.configRepo.remoteUrl = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Config Token")
        .setDesc("Token for config repo")
        .addText((text) =>
          text
            .setPlaceholder("ghp_xxx or gitee token")
            .setValue(this.plugin.settings.configRepo.token)
            .onChange(async (value) => {
              this.plugin.settings.configRepo.token = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // --- Sync Strategy ---
    containerEl.createEl("h3", { text: "Sync Strategy" });

    new Setting(containerEl)
      .setName("Sync strategy")
      .setDesc("When to trigger sync")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "Manual only")
          .addOption("startup-shutdown", "On vault open/close")
          .addOption("timer", "Periodic timer")
          .addOption("all", "All triggers")
          .setValue(this.plugin.settings.syncStrategy)
          .onChange(async (value) => {
            this.plugin.settings.syncStrategy = value as SyncStrategy;
            await this.plugin.saveSettings();
            this.plugin.applySyncStrategy();
          })
      );

    new Setting(containerEl)
      .setName("Timer interval (minutes)")
      .setDesc("How often to auto-sync when timer strategy is active")
      .addSlider((slider) =>
        slider
          .setLimits(1, 120, 1)
          .setValue(this.plugin.settings.timerInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.timerInterval = value;
            await this.plugin.saveSettings();
            this.plugin.applySyncStrategy();
          })
      );

    // --- LLM Settings ---
    containerEl.createEl("h3", { text: "DeepSeek LLM" });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("DeepSeek API key")
      .addText((text) =>
        text
          .setPlaceholder("sk-xxx")
          .setValue(this.plugin.settings.deepseekApiKey)
          .onChange(async (value) => {
            this.plugin.settings.deepseekApiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API URL")
      .setDesc("DeepSeek API endpoint")
      .addText((text) =>
        text
          .setPlaceholder("https://api.deepseek.com")
          .setValue(this.plugin.settings.deepseekUrl)
          .onChange(async (value) => {
            this.plugin.settings.deepseekUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("LLM Commit Interval")
      .setDesc("1 = every commit; N = summarize every N commits")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.llmCommitInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.llmCommitInterval = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
```

- [ ] **Step 2: Verify type check**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/settings.ts && git commit -m "feat: add settings tab UI"
```

---

### Task 7: Status Bar

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\status-bar.ts`

- [ ] **Step 1: Implement StatusBarManager**

```typescript
import { SyncerEvent } from "./types";

export class StatusBarManager {
  private statusBarEl: HTMLElement;
  private prefix: string;

  constructor(statusBarEl: HTMLElement, prefix: string = "Git") {
    this.statusBarEl = statusBarEl;
    this.prefix = prefix;
    this.statusBarEl.addClass("git-sync-status-ok");
    this.statusBarEl.setText(`${this.prefix}: —`);
  }

  update(event: SyncerEvent): void {
    this.statusBarEl.removeClass(
      "git-sync-status-ok",
      "git-sync-status-error",
      "git-sync-status-syncing"
    );

    switch (event.type) {
      case "idle":
        this.statusBarEl.addClass("git-sync-status-ok");
        this.statusBarEl.setText(`${this.prefix}: ${event.message || "OK"}`);
        break;
      case "error":
        this.statusBarEl.addClass("git-sync-status-error");
        this.statusBarEl.setText(`${this.prefix}: ${event.message}`);
        break;
      case "pulling":
      case "pushing":
      case "merging":
      case "committing":
        this.statusBarEl.addClass("git-sync-status-syncing");
        this.statusBarEl.setText(`${this.prefix}: ${event.message}`);
        break;
      case "conflict":
        this.statusBarEl.addClass("git-sync-status-syncing");
        this.statusBarEl.setText(`${this.prefix}: ${event.message}`);
        break;
    }
  }
}
```

- [ ] **Step 2: Verify type check**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/status-bar.ts && git commit -m "feat: add status bar manager"
```

---

### Task 8: Plugin Entry Point

**Files:**
- Create: `D:\Code\obsidian-git-sync\src\main.ts`
- Create: `D:\Code\obsidian-git-sync\main.ts`

- [ ] **Step 1: Implement Plugin class (src/main.ts)**

```typescript
import { Plugin, Notice, Platform } from "obsidian";
import { GitCore } from "./git-core";
import { Syncer } from "./syncer";
import { DeepSeekClient } from "./deepseek";
import { GitSyncSettingTab } from "./settings";
import { StatusBarManager } from "./status-bar";
import { DEFAULT_SETTINGS, PluginSettings, SyncStrategy } from "./types";

export default class GitSyncPlugin extends Plugin {
  settings: PluginSettings;
  private notesSyncer: Syncer | null = null;
  private configSyncer: Syncer | null = null;
  private notesStatusBar: StatusBarManager | null = null;
  private configStatusBar: StatusBarManager | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Settings tab
    this.addSettingTab(new GitSyncSettingTab(this.app, this));

    // Manual sync command
    this.addCommand({
      id: "git-sync-now",
      name: "Sync now",
      callback: () => this.syncAll(),
    });

    // Apply sync strategy
    this.applySyncStrategy();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  applySyncStrategy(): void {
    this.stopAll();

    const strategy = this.settings.syncStrategy;
    if (strategy === "manual" || !this.isConfigured()) return;

    // Initialize syncers
    this.initSyncers();

    // Timer
    if (strategy === "timer" || strategy === "all") {
      this.notesSyncer?.startTimer(this.settings.timerInterval);
      this.configSyncer?.startTimer(this.settings.timerInterval);
    }

    // Startup — trigger immediately
    if (strategy === "startup-shutdown" || strategy === "all") {
      setTimeout(() => this.syncAll(), 2000);
    }

    // Shutdown (save on unload)
    if (strategy === "startup-shutdown" || strategy === "all") {
      this.registerEvent(
        new (this.app.workspace as any).on("quit", () => {
          this.syncAll();
        })
      );
    }
  }

  private initSyncers(): void {
    const vaultPath = (this.app.vault.adapter as any).getBasePath();

    // Notes repo
    if (this.settings.notesRepo.enabled && this.settings.notesRepo.remoteUrl && this.settings.notesRepo.token) {
      const notesGit = new GitCore(vaultPath, `${vaultPath}/.git`, this.settings.notesRepo.remoteUrl, this.settings.notesRepo.token);
      const notesLlm = new DeepSeekClient(this.settings.deepseekApiKey, this.settings.deepseekUrl);
      this.notesStatusBar = new StatusBarManager(this.addStatusBarItem(), "Notes");
      this.notesSyncer = new Syncer(notesGit, notesLlm, this.settings.llmCommitInterval, (event) => {
        this.notesStatusBar?.update(event);
      });
    }

    // Config repo
    if (this.settings.configRepo.enabled && this.settings.configRepo.remoteUrl && this.settings.configRepo.token) {
      const configDir = `${vaultPath}/.obsidian`;
      const configGit = new GitCore(configDir, `${configDir}/.git`, this.settings.configRepo.remoteUrl, this.settings.configRepo.token);
      const configLlm = new DeepSeekClient(this.settings.deepseekApiKey, this.settings.deepseekUrl);
      this.configStatusBar = new StatusBarManager(this.addStatusBarItem(), "Config");
      this.configSyncer = new Syncer(configGit, configLlm, this.settings.llmCommitInterval, (event) => {
        this.configStatusBar?.update(event);
      });
    }
  }

  private async syncAll(): Promise<void> {
    if (!this.isConfigured()) {
      new Notice("Git Sync: Please configure remote URL and token in settings");
      return;
    }

    // Lazy init if not already done
    if (!this.notesSyncer && !this.configSyncer) {
      this.initSyncers();
    }

    // Init repos on first sync
    if (this.notesSyncer) {
      try {
        await this.notesSyncer.initRepo();
      } catch (e) {
        new Notice(`Git Sync (notes): init failed - ${e}`);
      }
    }
    if (this.configSyncer) {
      try {
        await this.configSyncer.initRepo();
      } catch (e) {
        new Notice(`Git Sync (config): init failed - ${e}`);
      }
    }

    // Sync
    if (this.notesSyncer) {
      await this.notesSyncer.sync();
    }
    if (this.configSyncer) {
      await this.configSyncer.sync();
    }
  }

  private isConfigured(): boolean {
    return !!(
      this.settings.notesRepo.enabled &&
      this.settings.notesRepo.remoteUrl &&
      this.settings.notesRepo.token
    );
  }

  private stopAll(): void {
    this.notesSyncer?.stopTimer();
    this.configSyncer?.stopTimer();
    this.notesSyncer = null;
    this.configSyncer = null;
  }

  async onunload(): Promise<void> {
    // Attempt one final sync on unload
    if (this.settings.syncStrategy === "startup-shutdown" || this.settings.syncStrategy === "all") {
      await this.syncAll();
    }
    this.stopAll();
  }
}
```

- [ ] **Step 2: Create thin entry point (main.ts at project root)**

```typescript
import GitSyncPlugin from "./src/main";

export default GitSyncPlugin;
```

- [ ] **Step 3: Verify type check and build**

```bash
cd D:\Code\obsidian-git-sync && npx tsc --noEmit -skipLibCheck
```

Expected: No type errors.

```bash
cd D:\Code\obsidian-git-sync && npm run build
```

Expected: `main.js` generated at project root, no errors.

- [ ] **Step 4: Commit**

```bash
cd D:\Code\obsidian-git-sync && git add src/main.ts main.ts && git commit -m "feat: add plugin entry point"
```

---

### Task 9: Smoke Test & Final Polish

**Files:**
- No new files; verify the complete plugin.

- [ ] **Step 1: Verify build output**

```bash
cd D:\Code\obsidian-git-sync && npm run build
```

Expected: `main.js`, `main.js.map` generated. No errors.

- [ ] **Step 2: Verify all required output files exist**

```bash
cd D:\Code\obsidian-git-sync && ls -la main.js manifest.json styles.css
```

Expected: All three files exist.

- [ ] **Step 3: Manual install test (copy to test vault)**

```bash
# Create a test vault if needed
mkdir -p /tmp/test-vault/.obsidian/plugins/git-sync

# Copy built files
cp main.js manifest.json styles.css /tmp/test-vault/.obsidian/plugins/git-sync/

# Open test vault in Obsidian, enable "Git Sync" in Community Plugins
```

Expected: Plugin loads, settings tab visible, status bar shows "Notes: —" and "Config: —" (if enabled).

- [ ] **Step 4: Commit final changes**

```bash
cd D:\Code\obsidian-git-sync && git add -A && git commit -m "chore: finalize v0.1.0"
```

---

### Implementation Order Summary

| Order | Task | Depends On |
|-------|------|------------|
| 1 | Project Scaffolding | — |
| 2 | Type Definitions | 1 |
| 3 | DeepSeek Client | 2 |
| 4 | Git Core | 2 |
| 5 | Syncer | 3, 4 |
| 6 | Settings UI | 2 |
| 7 | Status Bar | 2 |
| 8 | Plugin Entry | 5, 6, 7 |
| 9 | Smoke Test | 8 |

Tasks 3, 4, 6, 7 can run in parallel after Task 2 is complete.
