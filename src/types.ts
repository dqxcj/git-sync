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
  deepseekModel: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  notesRepo: { remoteUrl: "", token: "", enabled: true },
  configRepo: { remoteUrl: "", token: "", enabled: false },
  syncStrategy: "timer",
  timerInterval: 30,
  llmCommitInterval: 1,
  deepseekApiKey: "",
  deepseekUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-v4-flash",
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
