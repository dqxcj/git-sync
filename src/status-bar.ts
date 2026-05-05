import { SyncerEvent } from "./types";

export class StatusBarManager {
  private statusBarEl: HTMLElement;
  private prefix: string;

  constructor(statusBarEl: HTMLElement, prefix: string = "同步") {
    this.statusBarEl = statusBarEl;
    this.prefix = prefix;
    this.statusBarEl.addClass("git-sync-status-ok");
    this.statusBarEl.setText(`${this.prefix}: 就绪`);
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
        this.statusBarEl.setText(`${this.prefix}: ${event.message || "就绪"}`);
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
