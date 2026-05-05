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
