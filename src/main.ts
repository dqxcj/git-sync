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
      name: "立即同步",
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
    if (strategy === "manual") return;
    if (!this.settings.notesRepo.enabled) return;

    // Initialize syncers (works without token for local-only commits)
    this.initSyncers();

    // Timer
    if (strategy === "timer" || strategy === "all") {
      this.notesSyncer?.startTimer(this.settings.timerInterval);
      this.configSyncer?.startTimer(this.settings.timerInterval);
    }

    // Always trigger initial sync (cold start: init repo, pull from remote, or push local content)
    setTimeout(() => this.syncAll(), 2000);

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
    if (this.settings.notesRepo.enabled && this.settings.notesRepo.remoteUrl) {
      const notesGit = new GitCore(vaultPath, `${vaultPath}/.git`, this.settings.notesRepo.remoteUrl, this.settings.notesRepo.token);
      const notesLlm = new DeepSeekClient(this.settings.deepseekApiKey, this.settings.deepseekUrl, this.settings.deepseekModel);
      this.notesStatusBar = new StatusBarManager(this.addStatusBarItem(), "笔记");
      this.notesSyncer = new Syncer(notesGit, notesLlm, this.settings.llmCommitInterval, (event) => {
        this.notesStatusBar?.update(event);
      }, this.hasRemoteAuth());
    }

    // Config repo
    if (this.settings.configRepo.enabled && this.settings.configRepo.remoteUrl) {
      const configDir = `${vaultPath}/.obsidian`;
      const configGit = new GitCore(configDir, `${configDir}/.git`, this.settings.configRepo.remoteUrl, this.settings.configRepo.token);
      const configLlm = new DeepSeekClient(this.settings.deepseekApiKey, this.settings.deepseekUrl, this.settings.deepseekModel);
      this.configStatusBar = new StatusBarManager(this.addStatusBarItem(), "配置");
      this.configSyncer = new Syncer(configGit, configLlm, this.settings.llmCommitInterval, (event) => {
        this.configStatusBar?.update(event);
      }, !!(this.settings.configRepo.token));
    }
  }

  private async syncAll(): Promise<void> {
    if (!this.settings.notesRepo.enabled) {
      new Notice("Git 同步：请先在设置中启用笔记仓库并填写远程地址");
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
        new Notice(`Git 同步（笔记）：初始化失败 - ${e}`);
      }
    }
    if (this.configSyncer) {
      try {
        await this.configSyncer.initRepo();
      } catch (e) {
        new Notice(`Git 同步（配置）：初始化失败 - ${e}`);
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

  private hasRemoteAuth(): boolean {
    return !!(this.settings.notesRepo.token);
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
