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
