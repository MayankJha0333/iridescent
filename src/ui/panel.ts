import * as vscode from "vscode";
import { Session } from "../core/session.js";
import { Orchestrator } from "../core/orchestrator.js";
import { defaultTools } from "../tools/index.js";
import { createGate } from "../core/permissions.js";
import { PermissionMode, StreamDelta } from "../core/types.js";
import { buildSystemPrompt } from "./system-prompt.js";
import {
  getApiKey,
  storeApiKey,
  deleteApiKey,
  validateAnthropicKey,
  getAuthMode,
  setAuthMode,
  clearAuthMode
} from "../secrets.js";
import { AuthMode, createProvider } from "../providers/factory.js";
import { detectClaudeCli, quickCheckCliBinary } from "../services/claude-cli-detect.js";
import { CheckpointService } from "../services/checkpoint.js";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "iridescent.chat";

  private view?: vscode.WebviewView;
  private session!: Session;
  private orchestrator?: Orchestrator;
  private resumeId?: string;
  private checkpoints?: CheckpointService;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.initSession();
  }

  private initSession() {
    this.session = new Session();
    this.session.onEvent((e) => {
      this.post({ type: "timeline", event: e });
      this.trackFileForCheckpoint(e);
    });
    this.session.onUserTurn(async (eventId) => {
      if (this.checkpoints) {
        await this.checkpoints.captureBefore(eventId);
      }
    });
  }

  /**
   * When the agent (or the Claude CLI agent) calls a write/edit tool, snapshot
   * the file's *current* content into the latest checkpoint so rewind can
   * restore it. This fires synchronously before the tool actually runs (we
   * see the tool_call event right before fs.writeFile / CLI Write executes).
   */
  private trackFileForCheckpoint(e: { kind: string; body?: string; meta?: Record<string, unknown> }) {
    if (!this.checkpoints) return;
    if (e.kind !== "tool_call") return;
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(e.body ?? "{}");
    } catch {
      return;
    }
    const rel = String(input.path ?? input.file_path ?? input.filePath ?? "");
    if (!rel) return;
    const name = String(e.meta?.name ?? "").toLowerCase();
    // fs_write (api-key flow) + Claude CLI's Write/Edit/MultiEdit/NotebookEdit/Update.
    if (
      name === "fs_write" ||
      /^(write|edit|multiedit|notebookedit|update|create|str_replace_editor)/.test(name)
    ) {
      void this.checkpoints.addFileToLatest(rel);
    }
  }

  private ensureCheckpoints(workspaceRoot: string) {
    if (!this.checkpoints) {
      this.checkpoints = new CheckpointService(workspaceRoot, this.session.id);
    }
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "webview", "dist")]
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    this.post({ type: "hello", sessionId: this.session.id });
    void this.broadcastAuthState();
    this.replayTimeline();
    this.wireEditorContext();
  }

  private wireEditorContext() {
    const broadcast = () => this.broadcastEditorContext();
    this.ctx.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(broadcast),
      vscode.window.onDidChangeTextEditorSelection(broadcast)
    );
    broadcast();
  }

  private broadcastEditorContext() {
    const ed = vscode.window.activeTextEditor;
    if (!ed) {
      this.post({ type: "editorContext", context: null });
      return;
    }
    const rel = vscode.workspace.asRelativePath(ed.document.uri);
    const sel = ed.selection;
    this.post({
      type: "editorContext",
      context: {
        file: rel,
        language: ed.document.languageId,
        selection: sel.isEmpty
          ? null
          : { startLine: sel.start.line + 1, endLine: sel.end.line + 1 }
      }
    });
  }

  async broadcastAuthState() {
    const cfg = vscode.workspace.getConfiguration("iridescent");
    const mode = getAuthMode(this.ctx);
    const model = cfg.get<string>("model", "claude-sonnet-4-6");
    const permissionMode = cfg.get<PermissionMode>("permissionMode", "default");

    let authed = false;
    if (mode === "apikey") {
      authed = !!(await getApiKey(this.ctx, "anthropic"));
    } else if (mode === "subscription") {
      const bin = await quickCheckCliBinary();
      authed = !!bin.path;
    }

    this.post({
      type: "auth",
      authed,
      mode: mode ?? null,
      model,
      permissionMode
    });
    if (authed) {
      await this.broadcastModels();
      this.broadcastSkills();
    }
  }

  reveal() {
    this.view?.show?.(true);
  }

  newSession() {
    this.initSession();
    this.resumeId = undefined;
    this.checkpoints?.clear();
    this.checkpoints = undefined;
    this.orchestrator?.cancel();
    this.orchestrator = undefined;
    this.post({ type: "reset", sessionId: this.session.id });
  }

  async sendUserMessage(text: string) {
    this.reveal();
    await this.handlePrompt(text);
  }

  /**
   * Cmd+L: pull the active editor's selection (or current line if no
   * selection) and surface it inside the composer as a clean attachment.
   * Strips stray slash prefixes and other formatting artifacts.
   */
  sendSelectionToChat() {
    const ed = vscode.window.activeTextEditor;
    if (!ed) {
      vscode.window.showInformationMessage("Iridescent: open a file first.");
      return;
    }
    const sel = ed.selection;
    const range = sel.isEmpty ? ed.document.lineAt(sel.active.line).range : sel;
    const raw = ed.document.getText(range);
    const cleaned = cleanSelection(raw);
    if (!cleaned) {
      vscode.window.showInformationMessage("Iridescent: selection is empty.");
      return;
    }
    this.reveal();
    this.post({
      type: "insertSelection",
      file: vscode.workspace.asRelativePath(ed.document.uri),
      language: ed.document.languageId,
      startLine: range.start.line + 1,
      endLine: range.end.line + 1,
      text: cleaned
    });
  }

  private replayTimeline() {
    for (const e of this.session.timeline) this.post({ type: "timeline", event: e });
  }

  private async onMessage(msg: { type: string; [k: string]: unknown }) {
    switch (msg.type) {
      case "prompt":
        await this.handlePrompt(String(msg.text ?? ""));
        break;
      case "cancel":
        this.orchestrator?.cancel();
        break;
      case "newSession":
        this.newSession();
        break;
      case "authSubmitKey":
        await this.onAuthSubmitKey(String(msg.key ?? ""));
        break;
      case "authSubscription":
        await this.onAuthSubscription();
        break;
      case "checkClaudeCli":
        await this.sendCliStatus();
        break;
      case "authReset":
        await deleteApiKey(this.ctx, "anthropic");
        await clearAuthMode(this.ctx);
        await this.broadcastAuthState();
        break;
      case "refreshAuth":
        await this.broadcastAuthState();
        break;
      case "openExternal":
        if (typeof msg.url === "string") await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      case "runTerminalCommand":
        if (typeof msg.command === "string") {
          const term =
            vscode.window.terminals.find((t) => t.name === "Iridescent Setup") ??
            vscode.window.createTerminal({ name: "Iridescent Setup" });
          term.show(true);
          term.sendText(msg.command, true);
        }
        break;
      case "setModel":
        if (typeof msg.model === "string") {
          await vscode.workspace
            .getConfiguration("iridescent")
            .update("model", msg.model, vscode.ConfigurationTarget.Global);
          await this.broadcastAuthState();
        }
        break;
      case "setPermissionMode":
        if (typeof msg.mode === "string") {
          await vscode.workspace
            .getConfiguration("iridescent")
            .update("permissionMode", msg.mode, vscode.ConfigurationTarget.Global);
          await this.broadcastAuthState();
        }
        break;
      case "rewindTo":
        if (typeof msg.turnId === "string") {
          await this.rewindTo(msg.turnId);
        }
        break;
      case "refreshEditorContext":
        this.broadcastEditorContext();
        break;
      case "requestModels":
        await this.broadcastModels();
        break;
      case "requestSkills":
        this.broadcastSkills();
        break;
      case "requestFileSearch":
        await this.handleFileSearch(
          String(msg.query ?? ""),
          typeof msg.id === "string" ? msg.id : ""
        );
        break;
      case "captureSelection":
        this.sendSelectionToChat();
        break;
    }
  }

  // ── Models / skills / search ─────────────────────────────────

  private async broadcastModels() {
    const mode = getAuthMode(this.ctx);
    this.post({
      type: "models",
      models: availableModels(mode),
      authMode: mode ?? null
    });
  }

  private broadcastSkills() {
    const mode = getAuthMode(this.ctx);
    this.post({ type: "skills", skills: availableSkills(mode) });
  }

  private async handleFileSearch(query: string, id: string) {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      this.post({ type: "fileSearchResults", id, results: [] });
      return;
    }
    const glob = query ? `**/*${escapeGlob(query)}*` : "**/*";
    const found = await vscode.workspace.findFiles(
      new vscode.RelativePattern(root, glob),
      "**/{node_modules,.git,dist,build,out,.next,.venv,__pycache__}/**",
      40
    );
    const q = query.toLowerCase();
    const results = found
      .map((u) => ({
        path: vscode.workspace.asRelativePath(u),
        name: u.path.split("/").pop() ?? ""
      }))
      .sort((a, b) => {
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        if (q) {
          const aMatch = an.startsWith(q) ? 0 : an.includes(q) ? 1 : 2;
          const bMatch = bn.startsWith(q) ? 0 : bn.includes(q) ? 1 : 2;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }
        return a.path.localeCompare(b.path);
      })
      .slice(0, 12);
    this.post({ type: "fileSearchResults", id, results });
  }

  private async rewindTo(turnId: string) {
    if (!this.checkpoints) {
      this.post({ type: "error", message: "No checkpoint for this message." });
      return;
    }
    if (!this.checkpoints.hasCheckpoint(turnId)) {
      this.post({ type: "error", message: "No checkpoint for this message." });
      return;
    }
    this.orchestrator?.cancel();
    const { restored, deleted } = await this.checkpoints.restore(turnId);
    const surviving = this.session.truncateAt(turnId);
    this.resumeId = undefined;
    this.post({
      type: "rewind",
      turnId,
      restored,
      deleted,
      events: surviving
    });
    vscode.window.setStatusBarMessage(
      `Iridescent: rewound ${restored} files restored, ${deleted} deleted`,
      3000
    );
  }

  private async sendCliStatus() {
    const cli = await detectClaudeCli();
    this.post({ type: "cliStatus", cli });
  }

  private async onAuthSubscription() {
    this.post({ type: "authValidating" });
    const cli = await detectClaudeCli();
    if (!cli.installed) {
      this.post({
        type: "authResult",
        ok: false,
        error: "Claude CLI not found. Install it first (see Subscription tab)."
      });
      this.post({ type: "cliStatus", cli });
      return;
    }
    if (!cli.loggedIn) {
      this.post({
        type: "authResult",
        ok: false,
        error: "Claude CLI found but not logged in. Run `claude login` in the terminal."
      });
      this.post({ type: "cliStatus", cli });
      return;
    }
    await setAuthMode(this.ctx, "subscription");
    this.post({ type: "authResult", ok: true });
    await this.broadcastAuthState();
  }

  private async onAuthSubmitKey(key: string) {
    const trimmed = key.trim();
    if (!trimmed) {
      this.post({ type: "authResult", ok: false, error: "Key is empty." });
      return;
    }
    this.post({ type: "authValidating" });
    const v = await validateAnthropicKey(trimmed);
    if (!v.ok) {
      this.post({ type: "authResult", ok: false, error: v.error ?? "Validation failed." });
      return;
    }
    await storeApiKey(this.ctx, "anthropic", trimmed);
    await setAuthMode(this.ctx, "apikey");
    this.post({ type: "authResult", ok: true });
    await this.broadcastAuthState();
  }

  private async handlePrompt(text: string) {
    if (!text.trim()) return;
    const cfg = vscode.workspace.getConfiguration("iridescent");
    const model = cfg.get<string>("model", "claude-sonnet-4-6");
    const maxTokens = cfg.get<number>("maxTokens", 4096);
    const permMode = cfg.get<PermissionMode>("permissionMode", "default");
    const bashAllowlist = cfg.get<string[]>("allowedBashPatterns", []);

    const mode = getAuthMode(this.ctx);
    if (!mode) {
      await this.broadcastAuthState();
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.post({ type: "error", message: "Open a folder to use Iridescent." });
      return;
    }

    this.ensureCheckpoints(workspaceRoot);

    let providerInstance;
    let externalToolExecution = false;
    try {
      if (mode === "subscription") {
        const bin = await quickCheckCliBinary();
        if (!bin.path) {
          this.post({
            type: "error",
            message: "Claude CLI not found on PATH. Logout and reconnect."
          });
          return;
        }
        providerInstance = createProvider({
          authMode: "subscription",
          claudeBinary: bin.path,
          cwd: workspaceRoot,
          permissionMode: permMode,
          allowedBashPatterns: bashAllowlist,
          getResumeSessionId: () => this.resumeId,
          setResumeSessionId: (id) => {
            this.resumeId = id;
          }
        });
        externalToolExecution = true;
      } else {
        const apiKey = await getApiKey(this.ctx, "anthropic");
        if (!apiKey) {
          await this.broadcastAuthState();
          return;
        }
        providerInstance = createProvider({
          authMode: "apikey",
          apiKey,
          cwd: workspaceRoot
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.post({ type: "error", message: msg });
      return;
    }

    const gate = createGate(permMode, bashAllowlist);
    const tools = defaultTools();

    // Per-turn prompt — pulls in the current workspace root and active editor
    // so the agent knows it's sitting *inside* the user's project rather
    // than treating the conversation as a generic chat.
    const systemPrompt = buildSystemPrompt({
      workspaceRoot,
      activeFile: vscode.window.activeTextEditor
        ? vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri)
        : undefined,
      workspaceName: vscode.workspace.workspaceFolders?.[0]?.name
    });

    this.orchestrator = new Orchestrator(this.session, {
      provider: providerInstance,
      model,
      maxTokens,
      systemPrompt,
      tools,
      gate,
      approve: async (req) => {
        const label = req.destructive ? `⚠ DESTRUCTIVE: ${req.summary}` : req.summary;
        const pick = await vscode.window.showInformationMessage(
          label,
          { modal: false },
          "Allow once",
          "Always",
          "Deny"
        );
        if (pick === "Allow once") return "once";
        if (pick === "Always") return "always";
        return "deny";
      },
      ctx: {
        workspaceRoot,
        sessionId: this.session.id,
        emit: (e) => this.post({ type: "timeline", event: e })
      },
      onDelta: (d: StreamDelta) => this.post({ type: "delta", delta: d }),
      externalToolExecution
    });

    this.post({ type: "turnStart" });
    try {
      await this.orchestrator.turn(text);
    } finally {
      this.post({ type: "turnEnd" });
    }
  }

  private post(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private html(webview: vscode.Webview): string {
    const distRoot = vscode.Uri.joinPath(this.ctx.extensionUri, "webview", "dist");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "main.css"));
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource} https://fonts.gstatic.com`,
      `connect-src https://fonts.googleapis.com https://fonts.gstatic.com`
    ].join("; ");
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${styleUri}">
<title>Iridescent</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function makeNonce() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let n = "";
  for (let i = 0; i < 32; i++) n += chars[Math.floor(Math.random() * chars.length)];
  return n;
}

/** Strip stray slash prefixes and trailing whitespace from a captured selection. */
function cleanSelection(raw: string): string {
  // Drop a leading line that is purely a slash command (e.g. "/explain").
  const lines = raw.split(/\r?\n/);
  if (lines.length && /^\s*\/\S/.test(lines[0]) && !lines[0].includes("//")) {
    lines.shift();
  }
  // Trim trailing blank lines but keep interior whitespace.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}

function escapeGlob(s: string): string {
  return s.replace(/[\[\]{}*?!()]/g, "\\$&");
}

// ── Models / skills catalogs ─────────────────────────────────

export type ModelGroup = "alias" | "version";

export interface ModelInfo {
  value: string;
  label: string;
  note: string;
  supportsTools: boolean;
  group: ModelGroup;
}

/**
 * Models surfaced in the picker, sourced from Claude Code's model-config docs.
 *
 * Two groups:
 *  - **alias**   — Claude Code CLI shorthands (`opus`, `sonnet`, `haiku`,
 *                  `opusplan`, `default`). Subscription mode only.
 *  - **version** — pinned IDs the Messages API accepts directly. Includes
 *                  `[1m]` variants for the two models with 1M context.
 *
 * Aliases are a CLI convention (rejected by the raw Messages API), so they're
 * gated to subscription mode. The `[1m]` suffix is also a CLI convention —
 * the Messages API uses the `context-1m-2025-08-07` beta header instead — so
 * those variants only show in subscription mode.
 *
 * Reference: https://code.claude.com/docs/en/model-config
 */
function availableModels(authMode: AuthMode | undefined): ModelInfo[] {
  if (authMode !== "subscription") {
    // api-key mode → canonical Messages API IDs only, no aliases, no [1m].
    return [
      { value: "claude-opus-4-7",   label: "Opus 4.7",   note: "best reasoning",     supportsTools: true, group: "version" },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "balanced",           supportsTools: true, group: "version" },
      { value: "claude-haiku-4-5",  label: "Haiku 4.5",  note: "fastest · low cost", supportsTools: true, group: "version" }
    ];
  }

  // Subscription (Claude Code CLI). Aliases first (the recommended path),
  // then explicit versions including the two 1M-context variants.
  return [
    { value: "default",  label: "Default",     note: "your plan's recommended model",                supportsTools: true, group: "alias" },
    { value: "opus",     label: "Opus",        note: "latest Opus · complex reasoning",              supportsTools: true, group: "alias" },
    { value: "sonnet",   label: "Sonnet",      note: "latest Sonnet · daily coding",                 supportsTools: true, group: "alias" },
    { value: "haiku",    label: "Haiku",       note: "latest Haiku · simple tasks",                  supportsTools: true, group: "alias" },
    { value: "opusplan", label: "Opus + Plan", note: "Opus while planning, Sonnet while executing",  supportsTools: true, group: "alias" },

    { value: "claude-opus-4-7",        label: "Opus 4.7",        note: "current Opus",      supportsTools: true, group: "version" },
    { value: "claude-opus-4-7[1m]",    label: "Opus 4.7 · 1M",   note: "Opus 4.7 + 1M context window",   supportsTools: true, group: "version" },
    { value: "claude-sonnet-4-6",      label: "Sonnet 4.6",      note: "current Sonnet",    supportsTools: true, group: "version" },
    { value: "claude-sonnet-4-6[1m]",  label: "Sonnet 4.6 · 1M", note: "Sonnet 4.6 + 1M context window", supportsTools: true, group: "version" },
    { value: "claude-haiku-4-5",       label: "Haiku 4.5",       note: "current Haiku",     supportsTools: true, group: "version" }
  ];
}

export interface SkillInfo {
  id: string;
  name: string;
  category: "tool" | "skill" | "integration";
  description: string;
  enabled: boolean;
  toggleable: boolean;
  external?: boolean;
}

/** Skills surfaced in the chat composer. Mirrors Claude Code's tool taxonomy. */
function availableSkills(authMode: AuthMode | undefined): SkillInfo[] {
  // Always-on tools shipped by Iridescent.
  const tools: SkillInfo[] = [
    { id: "fs_read",  name: "Read",  category: "tool", description: "Read files in the workspace", enabled: true,  toggleable: false },
    { id: "fs_write", name: "Write", category: "tool", description: "Create and edit files",        enabled: true,  toggleable: false },
    { id: "bash",    name: "Bash",  category: "tool", description: "Run shell commands",           enabled: true,  toggleable: false }
  ];

  // Capabilities surfaced by Claude Code itself when running in subscription
  // (CLI) mode. Marked `external` because they execute inside the CLI agent.
  const claudeCode: SkillInfo[] = authMode === "subscription"
    ? [
        { id: "Glob",       name: "Glob",       category: "skill", description: "Find files by glob pattern", enabled: true, toggleable: false, external: true },
        { id: "Grep",       name: "Grep",       category: "skill", description: "Search file contents",        enabled: true, toggleable: false, external: true },
        { id: "Edit",       name: "Edit",       category: "skill", description: "Targeted in-file edits",       enabled: true, toggleable: false, external: true },
        { id: "WebFetch",   name: "WebFetch",   category: "skill", description: "Fetch and read URLs",          enabled: true, toggleable: false, external: true },
        { id: "Task",       name: "Sub-agents", category: "skill", description: "Spawn parallel sub-agents",    enabled: true, toggleable: false, external: true }
      ]
    : [];

  // Optional integrations (placeholder — not yet wired).
  const integrations: SkillInfo[] = [
    { id: "mcp", name: "MCP Servers", category: "integration", description: "Model Context Protocol servers (configure to enable)", enabled: false, toggleable: false }
  ];

  return [...tools, ...claudeCode, ...integrations];
}

export type { AuthMode };
