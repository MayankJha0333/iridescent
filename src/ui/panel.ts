import * as vscode from "vscode";
import { Session } from "../core/session.js";
import { Orchestrator } from "../core/orchestrator.js";
import { defaultTools } from "../tools/index.js";
import { createGate } from "../core/permissions.js";
import { PermissionMode, StreamDelta } from "../core/types.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
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
    this.session.onEvent((e) => this.post({ type: "timeline", event: e }));
    this.session.onUserTurn(async (eventId) => {
      if (this.checkpoints) {
        await this.checkpoints.captureBefore(eventId);
      }
    });
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
    }
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

    this.orchestrator = new Orchestrator(this.session, {
      provider: providerInstance,
      model,
      maxTokens,
      systemPrompt: SYSTEM_PROMPT,
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
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`
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

export type { AuthMode };
