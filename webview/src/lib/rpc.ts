// ─────────────────────────────────────────────────────────────
// Typed RPC layer between webview and the VS Code extension host.
// All messages flowing in either direction are enumerated here so
// every callsite gets full type-safety + autocomplete.
// ─────────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: <T = unknown>() => T | undefined;
  setState: <T = unknown>(s: T) => void;
};

const vscode = acquireVsCodeApi();

// ── Domain types ──────────────────────────────────────────────

export type AuthMode = "subscription" | "apikey";
export type PermissionMode = "default" | "auto" | "plan";

export interface TimelineEvent {
  id: string;
  ts: number;
  kind: "user" | "assistant" | "tool_call" | "tool_result" | string;
  title: string;
  body?: string;
  meta?: { id?: string };
}

export type Delta =
  | { type: "text"; text: string }
  | { type: "tool_use_start"; tool: { id: string; name: string } }
  | { type: "tool_use_input"; text?: string }
  | { type: "tool_use_end" }
  | { type: "done" }
  | { type: "error"; error: string };

export interface EditorContext {
  file: string;
  language: string;
  selection: { startLine: number; endLine: number } | null;
}

export type ModelGroup = "alias" | "version";

export interface ModelInfo {
  value: string;
  label: string;
  note: string;
  supportsTools: boolean;
  /**
   * UI grouping. `alias` = Claude Code CLI shorthands (`opus`, `sonnet`, …),
   * `version` = explicit Messages API model IDs. See model-config docs.
   */
  group: ModelGroup;
}

export interface SkillInfo {
  id: string;
  name: string;
  category: "tool" | "skill" | "integration";
  description: string;
  enabled: boolean;
  toggleable: boolean;
  external?: boolean;
  /** "user" or "project" for filesystem-discovered skills. */
  source?: "user" | "project";
}

export interface FileSearchResult {
  path: string;
  name: string;
}

// ── Marketplace ────────────────────────────────────────────

export interface MarketplaceSkill {
  id: string;
  name: string;
  /** "@author/repo/skill-name" — display + match key. */
  namespace: string;
  description: string;
  author: string;
  stars: number;
  installs: number;
  sourceUrl: string;
  repoOwner: string;
  repoName: string;
  directoryPath: string;
}

/** Subset needed to drive install. */
export interface MarketplaceInstallTarget {
  name: string;
  repoOwner: string;
  repoName: string;
  directoryPath: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  eventCount: number;
}

// ── Outbound (webview → extension) ────────────────────────────

export type Outbound =
  | { type: "refreshAuth" }
  | { type: "refreshEditorContext" }
  | { type: "prompt"; text: string }
  | { type: "cancel" }
  | { type: "newSession" }
  | { type: "setModel"; model: string }
  | { type: "setPermissionMode"; mode: PermissionMode }
  | { type: "authReset" }
  | { type: "rewindTo"; turnId: string }
  | { type: "authSubmitKey"; key: string }
  | { type: "authSubscription" }
  | { type: "openExternal"; url: string }
  | { type: "runTerminalCommand"; command: string }
  | { type: "requestModels" }
  | { type: "requestSkills" }
  | { type: "requestFileSearch"; id: string; query: string }
  | { type: "captureSelection" }
  | { type: "requestHistory" }
  | { type: "loadSession"; id: string }
  | { type: "deleteHistoryEntry"; id: string }
  | { type: "setSkillEnabled"; id: string; enabled: boolean }
  | { type: "requestMarketplace"; offset?: number; limit?: number; query?: string }
  | {
      type: "installMarketplaceSkill";
      target: MarketplaceInstallTarget;
      scope: "user" | "project";
    }
  | {
      type: "uninstallMarketplaceSkill";
      name: string;
      scope: "user" | "project";
    };

// ── Inbound (extension → webview) ─────────────────────────────

export type Inbound =
  | { type: "auth"; authed: boolean; mode?: AuthMode | null; model?: string; permissionMode?: PermissionMode }
  | { type: "authValidating" }
  | { type: "authResult"; ok: boolean; error?: string }
  | { type: "hello" }
  | { type: "reset" }
  | { type: "timeline"; event: TimelineEvent }
  | { type: "delta"; delta: Delta }
  | { type: "turnStart" }
  | { type: "turnEnd" }
  | { type: "error"; message: string }
  | { type: "editorContext"; context: EditorContext | null }
  | { type: "rewind"; events: TimelineEvent[] }
  | { type: "models"; models: ModelInfo[]; authMode: AuthMode | null }
  | { type: "skills"; skills: SkillInfo[] }
  | { type: "fileSearchResults"; id: string; results: FileSearchResult[] }
  | {
      type: "insertSelection";
      file: string;
      language: string;
      startLine: number;
      endLine: number;
      text: string;
    }
  | { type: "historyList"; sessions: HistoryEntry[] }
  | { type: "loadedSession"; events: TimelineEvent[]; title: string }
  | {
      type: "marketplaceList";
      skills: MarketplaceSkill[];
      total: number;
      offset: number;
      limit: number;
    }
  | { type: "marketplaceError"; message: string }
  | {
      type: "marketplaceInstallResult";
      action: "install" | "uninstall";
      name: string;
      ok: boolean;
      scope: "user" | "project";
      installPath?: string;
      filesWritten?: number;
      error?: string;
    };

// ── API ───────────────────────────────────────────────────────

export function send(msg: Outbound): void {
  vscode.postMessage(msg);
}

export function onMessage(handler: (m: Inbound) => void): () => void {
  const fn = (e: MessageEvent) => handler(e.data as Inbound);
  window.addEventListener("message", fn);
  return () => window.removeEventListener("message", fn);
}

export function saveState<T>(s: T): void {
  vscode.setState(s);
}

export function loadState<T>(): T | undefined {
  return vscode.getState<T>();
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 11);
}
