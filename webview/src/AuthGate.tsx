import { useEffect, useState, KeyboardEvent } from "react";
import { send, onMessage } from "./rpc";

type Tab = "subscription" | "apikey" | "cloud";

interface CliStatus {
  installed: boolean;
  loggedIn: boolean;
  version?: string;
  path?: string;
  error?: string;
}

interface Props {
  validating: boolean;
  error: string | null;
}

export function AuthGate({ validating, error }: Props) {
  const [tab, setTab] = useState<Tab>("subscription");
  const [cli, setCli] = useState<CliStatus | null>(null);
  const [cliChecking, setCliChecking] = useState(false);
  const [key, setKey] = useState("");

  useEffect(() => {
    setCliChecking(true);
    send({ type: "checkClaudeCli" });
    const off = onMessage<{ type: string; cli?: CliStatus }>((m) => {
      if (m.type === "cliStatus" && m.cli) {
        setCli(m.cli);
        setCliChecking(false);
      }
    });
    return off;
  }, []);

  const recheck = () => {
    setCliChecking(true);
    send({ type: "checkClaudeCli" });
  };

  const submitKey = () => {
    if (!key.trim() || validating) return;
    send({ type: "authSubmitKey", key: key.trim() });
  };

  const connectSubscription = () => send({ type: "authSubscription" });

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitKey();
    }
  };

  const openExternal = (url: string) => send({ type: "openExternal", url });
  const runCmd = (cmd: string) => send({ type: "runTerminalCommand", command: cmd });

  const detected = detectTokenType(key);

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-logo">✦</div>
        <h1 className="auth-title">Welcome to Iridescent</h1>
        <p className="auth-sub">Agentic coding assistant for VS Code. Sign in to start.</p>
      </div>

      <div className="auth-tabs" role="tablist">
        <button
          role="tab"
          className={`auth-tab ${tab === "subscription" ? "active" : ""}`}
          onClick={() => setTab("subscription")}
        >
          Subscription
        </button>
        <button
          role="tab"
          className={`auth-tab ${tab === "apikey" ? "active" : ""}`}
          onClick={() => setTab("apikey")}
        >
          API key
        </button>
        <button
          role="tab"
          className={`auth-tab ${tab === "cloud" ? "active" : ""}`}
          onClick={() => setTab("cloud")}
        >
          Cloud
        </button>
      </div>

      <div className="auth-panel">
        {tab === "subscription" && (
          <SubscriptionPanel
            cli={cli}
            checking={cliChecking}
            validating={validating}
            onRecheck={recheck}
            onConnect={connectSubscription}
            onRunCmd={runCmd}
            onOpen={openExternal}
          />
        )}

        {tab === "apikey" && (
          <>
            <p className="auth-desc">
              Bring your own <strong>Anthropic Console</strong> API key. Pre-paid credits required.
              Works with any model and has higher programmatic limits than subscriptions.
            </p>
            <ol className="auth-steps">
              <li>
                <button
                  className="inline-btn"
                  onClick={() => openExternal("https://console.anthropic.com/settings/keys")}
                >
                  Open console.anthropic.com ↗
                </button>
              </li>
              <li>Create a new key (starts with <code>sk-ant-api03-…</code>).</li>
              <li>Paste below.</li>
            </ol>
            <div className="auth-field">
              <input
                type="password"
                autoFocus
                placeholder="sk-ant-api03-…"
                value={key}
                onChange={(e) => setKey(e.target.value.replace(/\s+/g, ""))}
                onKeyDown={onKey}
                disabled={validating}
                spellCheck={false}
              />
              {key && (
                <div className={`auth-detect ${detected.kind}`}>
                  {detected.kind === "api" && "✓ Console API key"}
                  {detected.kind === "oauth" &&
                    "⚠ This is a subscription OAuth token. Use the Subscription tab instead — OAuth tokens don't work on the Messages API."}
                  {detected.kind === "unknown" &&
                    "⚠ Unrecognized format — should start with sk-ant-api03-"}
                </div>
              )}
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button
              className="auth-primary"
              onClick={submitKey}
              disabled={!key.trim() || validating || detected.kind !== "api"}
            >
              {validating ? "Validating…" : "Connect"}
            </button>
          </>
        )}

        {tab === "cloud" && (
          <div className="auth-cloud">
            <div className="auth-cloud-badge">Coming soon</div>
            <p className="auth-desc">
              Run Iridescent on <strong>Amazon Bedrock</strong>, <strong>Google Vertex AI</strong>, or{" "}
              <strong>Microsoft Foundry</strong> with your enterprise credentials.
            </p>
            <p className="auth-desc muted">
              For now, use subscription or API key.
            </p>
          </div>
        )}
      </div>

      <div className="auth-foot">
        <span>Credentials stored in VS Code SecretStorage (OS keychain).</span>
      </div>
    </div>
  );
}

function SubscriptionPanel({
  cli,
  checking,
  validating,
  onRecheck,
  onConnect,
  onRunCmd,
  onOpen
}: {
  cli: CliStatus | null;
  checking: boolean;
  validating: boolean;
  onRecheck: () => void;
  onConnect: () => void;
  onRunCmd: (cmd: string) => void;
  onOpen: (url: string) => void;
}) {
  if (checking || !cli) {
    return (
      <>
        <p className="auth-desc">Checking for Claude CLI…</p>
      </>
    );
  }

  if (!cli.installed) {
    return (
      <>
        <p className="auth-desc">
          Iridescent uses your <strong>Claude Pro / Max / Team / Enterprise</strong> subscription via
          the official Claude CLI. This avoids API-key billing and bypasses the 429 errors that
          OAuth tokens get on the Messages API.
        </p>
        <div className="auth-status bad">
          <span className="status-dot" /> Claude CLI: not installed
        </div>
        <p className="auth-desc muted">Install it (macOS/Linux):</p>
        <button
          className="inline-btn wide"
          onClick={() => onRunCmd("curl -fsSL https://claude.ai/install.sh | bash")}
        >
          Run <code>curl -fsSL https://claude.ai/install.sh | bash</code>
        </button>
        <p className="auth-desc muted" style={{ marginTop: 10 }}>Or with Homebrew:</p>
        <button className="inline-btn wide" onClick={() => onRunCmd("brew install --cask claude-code")}>
          Run <code>brew install --cask claude-code</code>
        </button>
        <div style={{ marginTop: 12 }}>
          <button className="inline-btn" onClick={onRecheck}>
            Re-check
          </button>
          <button
            className="inline-btn"
            style={{ marginLeft: 6 }}
            onClick={() => onOpen("https://code.claude.com/docs/en/quickstart")}
          >
            Install docs ↗
          </button>
        </div>
      </>
    );
  }

  if (!cli.loggedIn) {
    return (
      <>
        <p className="auth-desc">
          Claude CLI found. You need to log in with your Anthropic account.
        </p>
        <div className="auth-status neutral">
          <span className="status-dot" /> Claude CLI v{cli.version} · not logged in
        </div>
        <button className="inline-btn wide" onClick={() => onRunCmd("claude login")}>
          Run <code>claude login</code>
        </button>
        {cli.error && <div className="auth-error">{cli.error}</div>}
        <div style={{ marginTop: 12 }}>
          <button className="inline-btn" onClick={onRecheck}>
            Re-check after login
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="auth-desc">
        Ready to use your <strong>Claude subscription</strong>. Iridescent runs the Claude CLI
        locally — no token needed.
      </p>
      <div className="auth-status good">
        <span className="status-dot" /> Claude CLI v{cli.version} · logged in
      </div>
      <button className="auth-primary" onClick={onConnect} disabled={validating}>
        {validating ? "Connecting…" : "Use my subscription"}
      </button>
      <div style={{ marginTop: 10 }}>
        <button className="inline-btn" onClick={onRecheck}>
          Re-check CLI
        </button>
      </div>
    </>
  );
}

function detectTokenType(token: string): { kind: "oauth" | "api" | "unknown" | "empty" } {
  const t = token.trim();
  if (!t) return { kind: "empty" };
  if (t.startsWith("sk-ant-oat")) return { kind: "oauth" };
  if (t.startsWith("sk-ant-api")) return { kind: "api" };
  return { kind: "unknown" };
}
