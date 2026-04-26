// ─────────────────────────────────────────────────────────────
// Sign-in screen. Two tabs: subscription (Claude CLI, default)
// and api key (Anthropic Console, advanced).
// ─────────────────────────────────────────────────────────────

import { KeyboardEvent, useState } from "react";
import { Orb } from "../../design/primitives";
import { send } from "../../lib/rpc";

type Tab = "subscription" | "apikey";
type TokenKind = "oauth" | "api" | "unknown" | "empty";

export interface AuthGateProps {
  validating: boolean;
  error: string | null;
}

export function AuthGate({ validating, error }: AuthGateProps) {
  const [tab, setTab] = useState<Tab>("subscription");
  const [key, setKey] = useState("");

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
      </div>

      <div className="auth-panel">
        {tab === "subscription" && <SubscriptionPanel validating={validating} />}
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
  validating: boolean;
}

function SubscriptionPanel({ validating }: SubscriptionPanelProps) {
  const runCmd = (command: string) => send({ type: "runTerminalCommand", command });
  const [signedIn, setSignedIn] = useState(false);

  // Click flow: open `claude login` in a terminal so the user can authorize
  // in their browser, and immediately mark subscription mode active. If the
  // user doesn't actually finish login, the first chat message will surface
  // the auth error — at which point they can rerun login from the terminal.
  const onClick = () => {
    runCmd("claude login");
    setSignedIn(true);
    send({ type: "authSubscription" });
  };

  return (
    <>
      <p className="auth-desc">
        Sign in once with your <strong>Claude</strong> account. Works with Pro, Max, Team, or
        Enterprise — no API key needed.
      </p>
      <button
        type="button"
        className="auth-primary"
        onClick={onClick}
        disabled={validating || signedIn}
      >
        {signedIn ? "Connecting…" : "Sign in with Claude"}
      </button>
      {signedIn && (
        <p className="auth-desc muted" style={{ marginTop: 10 }}>
          Complete the sign-in in the terminal/browser. You can start chatting as soon as it's done.
        </p>
      )}
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

// ── Helpers ──────────────────────────────────────────────────

function detectTokenKind(token: string): TokenKind {
  const t = token.trim();
  if (!t) return "empty";
  if (t.startsWith("sk-ant-oat")) return "oauth";
  if (t.startsWith("sk-ant-api")) return "api";
  return "unknown";
}
