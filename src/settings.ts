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

    containerEl.createEl("h2", { text: "Git 同步设置" });

    // --- Notes Repo Section ---
    containerEl.createEl("h3", { text: "笔记仓库" });

    new Setting(containerEl)
      .setName("远程地址")
      .setDesc("笔记的 Git 远程仓库地址（Gitee/GitHub HTTPS）")
      .addText((text) =>
        text
          .setPlaceholder("https://gitee.com/用户名/笔记.git")
          .setValue(this.plugin.settings.notesRepo.remoteUrl)
          .onChange(async (value) => {
            this.plugin.settings.notesRepo.remoteUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("访问令牌")
      .setDesc("笔记仓库的个人访问令牌（Token）")
      .addText((text) =>
        text
          .setPlaceholder("ghp_xxx 或 Gitee 令牌")
          .setValue(this.plugin.settings.notesRepo.token)
          .onChange(async (value) => {
            this.plugin.settings.notesRepo.token = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Config Repo Section ---
    containerEl.createEl("h3", { text: "配置仓库（.obsidian/）" });

    new Setting(containerEl)
      .setName("启用配置仓库")
      .setDesc("将 .obsidian/ 目录（插件、主题、设置）单独同步到另一个仓库")
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
        .setName("配置仓库远程地址")
        .setDesc("配置仓库的 Git 远程地址")
        .addText((text) =>
          text
            .setPlaceholder("https://gitee.com/用户名/obsidian-config.git")
            .setValue(this.plugin.settings.configRepo.remoteUrl)
            .onChange(async (value) => {
              this.plugin.settings.configRepo.remoteUrl = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("配置仓库访问令牌")
        .setDesc("配置仓库的个人访问令牌")
        .addText((text) =>
          text
            .setPlaceholder("ghp_xxx 或 Gitee 令牌")
            .setValue(this.plugin.settings.configRepo.token)
            .onChange(async (value) => {
              this.plugin.settings.configRepo.token = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // --- Sync Strategy ---
    containerEl.createEl("h3", { text: "同步策略" });

    new Setting(containerEl)
      .setName("同步方式")
      .setDesc("选择触发同步的时机")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("manual", "仅手动触发")
          .addOption("startup-shutdown", "打开/关闭仓库时")
          .addOption("timer", "定时同步")
          .addOption("all", "全部启用")
          .setValue(this.plugin.settings.syncStrategy)
          .onChange(async (value) => {
            this.plugin.settings.syncStrategy = value as SyncStrategy;
            await this.plugin.saveSettings();
            this.plugin.applySyncStrategy();
          })
      );

    new Setting(containerEl)
      .setName("定时间隔（分钟）")
      .setDesc("定时同步的间隔时间")
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
    containerEl.createEl("h3", { text: "DeepSeek 大模型" });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("DeepSeek API 密钥")
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
      .setName("API 地址")
      .setDesc("DeepSeek API 端点地址")
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
      .setName("LLM 提交间隔")
      .setDesc("1 = 每次提交都让 LLM 生成 commit 信息；N = 累积 N 次提交后总结一次")
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
