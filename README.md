# Git Sync - Obsidian 插件

基于 [isomorphic-git](https://isomorphic-git.org/) 的 Obsidian 跨平台 Git 同步插件，无需系统 Git 依赖，PC 和 Android 均可使用。集成 DeepSeek 大模型自动解决 Git 冲突和生成提交信息。

## 功能

- **纯 JS Git** — 不依赖系统 git，手机端也能用
- **双仓库同步** — 笔记和 `.obsidian/` 配置分离为两个独立仓库
- **LLM 冲突解决** — 拉取冲突时自动调用 DeepSeek 合并
- **LLM 提交信息** — 可配置间隔，让 DeepSeek 帮你总结 commit
- **多种同步策略** — 手动 / 开关仓库时 / 定时同步 / 全部启用
- **本地模式** — 不填令牌也可以做本地提交，需要远程同步时才填令牌

## 安装

### 方法一：BRAT
1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 在 BRAT 中添加 `dqxcj/git-sync`
3. 启用 "Git Sync" 插件

### 方法二：手动安装
1. 从 [Releases](https://github.com/dqxcj/git-sync/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 放入 `{你的仓库}/.obsidian/plugins/git-sync/`
3. 重启 Obsidian，启用插件

## 配置

| 设置 | 说明 | 必填 |
|------|------|------|
| 笔记仓库远程地址 | Gitee/GitHub HTTPS 地址 | 是 |
| 笔记仓库令牌 | Personal Access Token | 否（仅远程同步需要）|
| 配置仓库 | `.obsidian/` 目录单独同步 | 否 |
| 同步策略 | 手动 / 开关触发 / 定时 / 全部 | — |
| 定时间隔 | 定时同步间隔（分钟） | — |
| DeepSeek API Key | 用于冲突解决和提交信息 | 否（不填则用默认提交信息）|
| DeepSeek 模型 | `deepseek-v4-flash`（推荐）或 `deepseek-v4-pro` | — |
| LLM 提交间隔 | 1=每次总结，N=累积N次总结 | — |

### Gitee 创建令牌
1. 登录 Gitee → 设置 → [私人令牌](https://gitee.com/profile/personal_access_tokens)
2. 新建令牌，勾选 `projects` 权限
3. 复制令牌，填入插件设置

### GitHub 创建令牌
1. GitHub Settings → [Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. 新建令牌，勾选 `repo` 权限
3. 复制令牌，填入插件设置

## 使用

1. 在 Gitee/GitHub 创建空仓库
2. 在插件设置中填入远程地址和令牌
3. 启用定时同步或手动执行 `Ctrl+P → 立即同步`
4. 底部状态栏会显示同步状态

## 许可证

MIT
