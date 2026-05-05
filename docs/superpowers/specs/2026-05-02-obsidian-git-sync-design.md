# Obsidian Git Sync — Design Spec

**Date**: 2026-05-02
**Status**: Draft

---

## 1. Overview

一个跨平台 Obsidian 插件，基于 isomorphic-git 实现纯 JavaScript 的 Git 同步，无需系统 git 依赖，可在 PC 和 Android 上运行。集成 DeepSeek API 用于自动解决 Git 冲突和生成 commit message。

### 核心目标

- 桌面端和手机端都能自动同步 Obsidian vault
- 笔记和 `.obsidian/` 配置分离为两个独立 Git 仓库
- Git 冲突由 LLM 自动解决，不阻断同步流程
- Commit message 由 LLM 按可配置的间隔自动总结生成

---

## 2. Repository Model

```
vault/
├── .git/                  → notes repo (remote: notes remote)
├── 笔记.md
├── .gitignore             → 排除 .obsidian/
└── .obsidian/
    ├── .git/              → config repo (nested, optional)
    └── ...
```

| Device | Notes Repo | Config Repo |
|--------|-----------|-------------|
| Desktop | ✅ | ✅ |
| Android | ✅ | ❌ |
| New device restore | ✅ | ✅ |

---

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│                  Plugin (src/main.ts)          │
│                                                │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Settings │  │ Syncer   │  │ StatusBar   │  │
│  │ (UI)     │◄─┤ (Controller)├─►(UI)        │  │
│  └──────────┘  └────┬─────┘  └────────────┘  │
│                     │                         │
│          ┌──────────┼──────────┐              │
│     ┌────▼────┐ ┌───▼────┐     │              │
│     │git-core │ │deepseek│     │              │
│     │(isomor- │ │(API)   │     │              │
│     │phic-git)│ │        │     │              │
│     └─────────┘ └────────┘     │              │
└────────────────────────────────┘              │
```

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **Plugin** | `src/main.ts` | 生命周期、注册命令、初始化各模块 |
| **Syncer** | `src/syncer.ts` | 同步状态机，协调 pull/push/conflict/commit 流程 |
| **GitCore** | `src/git-core.ts` | isomorphic-git 封装：clone/pull/push/status/diff |
| **DeepSeek** | `src/deepseek.ts` | DeepSeek API 调用：冲突合并 + commit 总结 |
| **Settings** | `src/settings.ts` | `PluginSettingTab` 原生 UI，配置所有参数 |
| **StatusBar** | `src/status-bar.ts` | 底部状态栏：显示同步状态 |

---

## 4. Syncer State Machine

```
         ┌──────────┐
         │  IDLE     │
         └─────┬─────┘
               │ trigger (manual/timer/vault-open)
         ┌─────▼─────┐
         │  PULLING   │
         └─────┬─────┘
               │
      ┌────────┼────────┐
      │ OK     │ CONFLICT│
      ▼        ▼         │
  ┌──────┐ ┌──────────┐ │
  │ CHECK│ │ LLM      │ │
  │ LOCAL│ │ MERGE    │ │
  │DIFF  │ └────┬─────┘ │
  └──┬───┘      │       │
     │          ▼       │
     │    ┌──────────┐  │
     │    │ GIT ADD  │  │
     │    │ MERGED   │  │
     │    └────┬─────┘  │
     │         │         │
     └────┬────┘         │
          ▼              │
    ┌──────────┐         │
    │ DIFF > 0?│◄────────┘
    └────┬─────┘
         │ YES
    ┌────▼──────┐
    │ COMMIT    │
    │ (LLM/N)   │
    └────┬──────┘
         │
    ┌────▼──────┐
    │  PUSHING  │
    └────┬──────┘
         │
    ┌────▼──────┐
    │  IDLE     │ (update status bar)
    └───────────┘
```

---

## 5. Configuration

### Settings Tab (Obsidian PluginSettingTab)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Notes Remote URL** | `string` | — | Gitee/GitHub repo for notes |
| **Notes Token** | `string` (password) | — | HTTPS personal access token |
| **Config Remote URL** | `string` | — | Optional repo for `.obsidian/` |
| **Config Token** | `string` (password) | — | Token for config repo |
| **Sync Strategy** | `dropdown` | `timer` | `manual` / `startup-shutdown` / `timer` / `all` |
| **Timer Interval** | `number` | `30` | Minutes between auto-syncs |
| **LLM Commit Interval** | `number` | `1` | 1=every commit; N=summarize every N commits |
| **DeepSeek API Key** | `string` (password) | — | |
| **DeepSeek URL** | `string` | `https://api.deepseek.com` | Customizable endpoint |

### Data Storage

Settings stored via Obsidian `Plugin.loadData()` / `Plugin.saveData()` API, persisted in vault's `.obsidian/` data.json.

API keys and tokens stored in Obsidian's encrypted storage (no plaintext in files).

---

## 6. DeepSeek Integration

### 6.1 Commit Message Generation

**When `interval == 1`**: Send `git diff --staged` to DeepSeek for each commit.

**When `interval > 1`**: Accumulate diffs from N commits, send all at once:
```
Prompt: "Summarize the following N git diffs into ONE commit message in Chinese (max 50 chars):"
```

**Fallback**: If DeepSeek fails, use `"[auto] update: YYYY-MM-DD HH:mm"`.

### 6.2 Conflict Resolution

**Input**: Files with `<<<<<<<` / `=======` / `>>>>>>>` conflict markers.

**Prompt**:
```
Merge the following Git conflict. Preserve all meaningful changes from both sides.
Output ONLY the merged file content, no explanations.

<<<<<<< HEAD
(content A)
=======
(content B)
>>>>>>> remote
```

**Output**: Merged content written directly to file, then `git add` the resolved file.

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| No network | Skip sync, show ⚠️ in status bar |
| Token invalid | Show notice, stop auto-sync until token updated |
| DeepSeek API error | Fallback to standard commit message; conflicts: leave unresolved, show error |
| isomorphic-git error | Log error, show notice |
| Nested git in `.obsidian/` | Detect `.gitmodules` or check `.obsidian/.git`, handle independently |
| Remote unreachable | Retry with exponential backoff (max 3 attempts) |

---

## 8. Testing Strategy

| Level | What | How |
|-------|------|-----|
| Unit | git-core.ts | Mock isomorphic-git, test clone/pull/push logic |
| Unit | deepseek.ts | Mock HTTP, test prompt construction |
| Unit | syncer.ts | Inject mock git + llm, test state machine transitions |
| Integration | End-to-end sync | Local bare repo as remote, real isomorphic-git operations |

---

## 9. Known Limitations

- isomorphic-git has known issues with very large files (>100MB). Not a problem for Markdown vaults.
- DeepSeek API rate limiting: plugin will throttle if responses indicate rate limits.
- On Android, background sync may be killed by OS battery optimization. Timer sync best-effort.
- SSH not supported. HTTPS + Token only.

---

## 10. Project Files

```
D:\Code\obsidian-git-sync\
├── main.ts                   # Thin entry, re-exports Plugin class
├── src/
│   ├── main.ts               # Plugin class (extends obsidian.Plugin)
│   ├── git-core.ts           # isomorphic-git CRUD
│   ├── syncer.ts             # Sync state machine
│   ├── deepseek.ts           # LLM API client
│   ├── settings.ts           # PluginSettingTab
│   ├── status-bar.ts         # StatusBarItem
│   └── types.ts              # TypeScript interfaces
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── styles.css
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-02 | Initial spec |
