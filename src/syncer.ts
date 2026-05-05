import { GitCore } from "./git-core";
import { DeepSeekClient } from "./deepseek";
import { ConflictFile, SyncerCallback, SyncerEvent } from "./types";
import { debugLog } from "./logger";

export class Syncer {
  private git: GitCore;
  private llm: DeepSeekClient;
  private onEvent: SyncerCallback;
  private hasRemote: boolean;
  private debug: boolean;
  private commitCounter: number = 0;
  private accumulatedDiffs: string[] = [];
  private llmCommitInterval: number;
  private running: boolean = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    git: GitCore,
    llm: DeepSeekClient,
    llmCommitInterval: number,
    onEvent: SyncerCallback,
    hasRemote: boolean = true,
    debug: boolean = false
  ) {
    this.git = git;
    this.llm = llm;
    this.llmCommitInterval = llmCommitInterval;
    this.onEvent = onEvent;
    this.hasRemote = hasRemote;
    this.debug = debug;
  }

  private emit(event: SyncerEvent): void {
    this.onEvent(event);
  }

  private log(msg: string): void {
    debugLog(this.debug, msg);
  }

  async initRepo(): Promise<void> {
    this.log("initRepo: 开始");
    const exists = await this.git.isRepo();
    this.log(`initRepo: isRepo=${exists}`);

    if (!exists) {
      this.emit({ type: "pulling", message: "正在初始化..." });
    }
    const conflicts = await this.git.initAndPull();
    this.log(`initRepo: initAndPull完成, conflicts=${conflicts.length}`);
    if (conflicts.length > 0) {
      this.emit({ type: "conflict", message: `${conflicts.length} 个冲突` });
      await this.resolveConflicts(conflicts);
    }
    this.emit({ type: "idle", message: exists ? "就绪" : "初始化完成" });
    this.log(`initRepo: 完成`);
  }

  async sync(): Promise<void> {
    if (this.running) {
      this.log("sync: 跳过, 上一次同步仍在运行");
      return;
    }
    this.running = true;
    this.log("sync: ====== 开始 ======");
    this.log(`sync: hasRemote=${this.hasRemote}, debug=${this.debug}`);

    let pullError: string | null = null;

    // Pull (best-effort, failure should not block local commit)
    if (this.hasRemote) {
      try {
        this.emit({ type: "pulling", message: "正在拉取..." });
        this.log("sync: 开始 pull");
        const conflicts = await this.git.pullWithConflictDetection();
        this.log(`sync: pull完成, conflicts=${conflicts.length}`);

        if (conflicts.length > 0) {
          this.emit({ type: "conflict", message: `${conflicts.length} 个冲突` });
          this.log("sync: 开始解决冲突");
          await this.resolveConflicts(conflicts);
          this.log("sync: 冲突已解决");
        }
      } catch (err: unknown) {
        pullError = err instanceof Error ? err.message : String(err);
        this.log(`sync: pull失败 (继续本地操作): ${pullError}`);
      }
    } else {
      this.log("sync: 跳过pull (无远程认证)");
    }

    // Commit (always run, even if pull failed)
    try {
      this.emit({ type: "committing", message: "检查变更..." });
      this.log("sync: 开始 addAll");
      await this.git.addAll();
      const diff = await this.git.getStagedDiff();
      this.log(`sync: diff长度=${diff.length}`);

      if (diff) {
        this.log(`sync: 有变更, diff预览: ${diff.substring(0, 200)}`);
        this.emit({ type: "committing", message: "正在提交..." });
        const message = await this.generateCommitMessage(diff);
        this.log(`sync: commit message: ${message}`);
        const sha = await this.git.commit(message);
        this.log(`sync: commit完成, sha=${sha}`);

        // Push (best-effort)
        if (this.hasRemote) {
          try {
            this.emit({ type: "pushing", message: "正在推送..." });
            this.log("sync: 开始 push");
            await this.git.push();
            this.log("sync: push完成");
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log(`sync: push失败: ${msg}`);
          }
        } else {
          this.log("sync: 跳过push (无远程认证)");
        }
      } else {
        this.log("sync: 无变更, 跳过commit");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`sync: commit/push异常! ${err instanceof Error ? err.stack : String(err)}`);
      this.emit({ type: "error", message: msg });
    }

    this.emit({ type: "idle", message: pullError ? "拉取失败，本地已提交" : "就绪" });
    this.log("sync: ====== 结束 ======");
    this.running = false;
  }

  private async resolveConflicts(conflicts: ConflictFile[]): Promise<void> {
    if (!this.llm.isConfigured()) {
      throw new Error("未配置 LLM，无法解决冲突");
    }

    for (const file of conflicts) {
      this.log(`resolveConflicts: 处理 ${file.path}`);
      this.emit({ type: "merging", message: `正在合并 ${file.path}` });
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
      this.log(`generateCommitMessage: 调用LLM, counter=${this.commitCounter}`);
      const message = await this.llm.generateCommitMessage(this.accumulatedDiffs);
      this.commitCounter = 0;
      this.accumulatedDiffs = [];
      return message;
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return `自动同步: ${ts}`;
  }

  startTimer(intervalMinutes: number): void {
    this.stopTimer();
    this.log(`startTimer: ${intervalMinutes}分钟`);
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
