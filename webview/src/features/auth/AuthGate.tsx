// ─────────────────────────────────────────────────────────────
// Sign-in screen. Three tabs: subscription (Claude CLI),
// api key (Anthropic Console), and cloud (placeholder).
// ─────────────────────────────────────────────────────────────

import { KeyboardEvent, useEffect, useState } from "react";
import { Orb } from "../../design/primitives";
import { send, onMessage, CliStatus } from "../../lib/rpc";

type Tab = "subscription" | "apikey" | "cloud";
type TokenKind = "oauth" | "api" | "unknown" | "empty";

export interface AuthGateProps {
  validating: boolean;
  error: string | null;
}

export function AuthGate({ validating, error }: AuthGateProps) {
  const [tab, setTab] = useState<Tab>("subscription");
  const [cli, setCli] = useState<CliStatus | null>(null);
  const [cliChecking, setCliChecking] = useState(false);
  const [key, setKey] = useState("");

  useEffect(() => {
    setCliChecking(true);
    send({ type: "checkClaudeCli" });
    return onMessage((m) => {
      if (m.type === "cliStatus") {
        setCli(m.cli);
        setCliChecking(false);
      }
    });
  }, []);

  const recheck = () => {
    setCliChecking(true);
    send({ type: "checkClaudeCli" });
  };

  const submitKey = () => {
    const trimmed = key.trim();
    if (!trimmed || validating) return;
    send({ type: "authSubmitKey", key: trimmed });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitKey();
    }
  };

  const detected = detectTokenKind(key);

  return (
    <div className="auth">
      <div className="auth-hero">
        <Orb size={64} />
        <h1 className="auth-title">Welcome to Iridescent</h1>
        <p className="auth-sub">Agentic coding assistant for VS Code. Sign in to start.</p>
      </div>

      <div className="auth-tabs" role="tablist">
        <TabButton id="subscription" active={tab} onClick={setTab}>Subscription</TabButton>
        <TabButton id="apikey"        active={tab} onClick={setTab}>API key</TabButton>
        <TabButton id="cloud"         active={tab} onClick={setTab}>Cloud</TabButton>
      </div>

      <div className="auth-panel">
        {tab === "subscription" && (
          <SubscriptionPanel
            cli={cli}
            checking={cliChecking}
            validating={validating}
            onRecheck={recheck}
          />
        )}
        {tab === "apikey" && (
          <ApiKeyPanel
            keyVal={key}
            onChange={setKey}
            onSubmit={submitKey}
            onKeyDown={onKey}
            validating={validating}
            error={error}
            detected={detected}
          />
        )}
        {tab === "cloud" && <CloudPanel />}
      </div>

      <div className="auth-foot">
        <span>Credentials stored in VS Code SecretStorage (OS keychain).</span>
      </div>
    </div>
  );
}

function TabButton({
  id,
  active,
  onClick,
  children
}: {
  id: Tab;
  active: Tab;
  onClick: (t: Tab) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      className={`auth-tab${active === id ? " active" : ""}`}
      onClick={() => onClick(id)}
    >
      {children}
    </button>
  );
}

// ── Subscription panel ───────────────────────────────────────

interface SubscriptionPanelProps {
  cli: CliStatus | null;
  checking: boolean;
  validating: boolean;
  onRecheck: () => void;
}

function SubscriptionPanel({ cli, checking, validating, onRecheck }: SubscriptionPanelProps) {
  const openExternal = (url: string) => send({ type: "openExternal", url });
  const runCmd = (command: string) => send({ type: "runTerminalCommand", command });
  const connect = () => send({ type: "authSubscription" });

  if (checking || !cli) {
    return <p className="auth-desc">Checking for Claude CLI…</p>;
  }

  if (!cli.installed) {
    return (
      <>
        <p className="auth-desc">
          Iridescent uses your <strong>Claude Pro / Max / Team / Enterprise</strong> subscription
          via the official Claude CLI. This avoids API-key billing and bypasses 429s on the
          Messages API.
        </p>
        <div className="auth-status bad">
          <span className="status-dot" /> Claude CLI: not installed
        </div>
        <p className="auth-desc muted">Install it (macOS/Linux):</p>
        <button
          type="button"
          className="inline-btn wide"
          onClick={() => runCmd("curl -fsSL https://claude.ai/install.sh | bash")}
        >
          Run <code>curl -fsSL https://claude.ai/install.sh | bash</code>
        </button>
        <p className="auth-desc muted" style={{ marginTop: 10 }}>
          Or with Homebrew:
        </p>
        <button
          type="button"
          className="inline-btn wide"
          onClick={() => runCmd("brew install --cask claude-code")}
        >
          Run <code>brew install --cask claude-code</code>
        </button>
        <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
          <button type="button" className="inline-btn" onClick={onRecheck}>
            Re-check
          </button>
          <button
            type="button"
            className="inline-btn"
            onClick={() => openExternal("https://code.claude.com/docs/en/quickstart")}
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
        <button
          type="button"
          className="inline-btn wide"
          onClick={() => runCmd("claude login")}
        >
          Run <code>claude login</code>
        </button>
        {cli.error && <div className="auth-error">{cli.error}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="inline-btn" onClick={onRecheck}>
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
      <button
        type="button"
        className="auth-primary"
        onClick={connect}
        disabled={validating}
      >
        {validating ? "Connecting…" : "Use my subscription"}
      </button>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="inline-btn" onClick={onRecheck}>
          Re-check CLI
        </button>
      </div>
    </>
  );
}

// ── API key panel ────────────────────────────────────────────

interface ApiKeyPanelProps {
  keyVal: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  validating: boolean;
  error: string | null;
  detected: TokenKind;
}

function ApiKeyPanel({
  keyVal,
  onChange,
  onSubmit,
  onKeyDown,
  validating,
  error,
  detected
}: ApiKeyPanelProps) {
  const open = (url: string) => send({ type: "openExternal", url });
  return (
    <>
      <p className="auth-desc">
        Bring your own <strong>Anthropic Console</strong> API key. Pre-paid credits required.
        Works with any model and has higher programmatic limits than subscriptions.
      </p>
      <ol className="auth-steps">
        <li>
          <button
            type="button"
            className="inline-btn"
            onClick={() => open("https://console.anthropic.com/settings/keys")}
          >
            Open console.anthropic.com ↗
          </button>
        </li>
        <li>
          Create a new key (starts with <code>sk-ant-api03-…</code>).
        </li>
        <li>Paste below.</li>
      </ol>
      <div className="auth-field">
        <input
          type="password"
          autoFocus
          placeholder="sk-ant-api03-…"
          value={keyVal}
          onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
          onKeyDown={onKeyDown}
          disabled={validating}
          spellCheck={false}
        />
        {keyVal && (
          <div className={`auth-detect ${detected}`}>
            {detected === "api" && "✓ Console API key"}
            {detected === "oauth" &&
              "⚠ This is a subscription OAuth token. Use the Subscription tab instead."}
            {detected === "unknown" &&
              "⚠ Unrecognized format — should start with sk-ant-api03-"}
          </div>
        )}
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button
        type="button"
        className="auth-primary"
        onClick={onSubmit}
        disabled={!keyVal.trim() || validating || detected !== "api"}
      >
        {validating ? "Validating…" : "Connect"}
      </button>
    </>
  );
}

// ── Cloud panel ──────────────────────────────────────────────

function CloudPanel() {
  return (
    <div className="auth-cloud">
      <div className="auth-cloud-badge">Coming soon</div>
      <p className="auth-desc">
        Run Iridescent on <strong>Amazon Bedrock</strong>, <strong>Google Vertex AI</strong>, or{" "}
        <strong>Microsoft Foundry</strong> with your enterprise credentials.
      </p>
      <p className="auth-desc muted">For now, use subscription or API key.</p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function detectTokenKind(token: string): TokenKind {
  const t = token.trim();
  if (!t) return "empty";
  if (t.startsWith("sk-ant-oat")) return "oauth";
  if (t.startsWith("sk-ant-api")) return "api";
  return "unknown";
}
