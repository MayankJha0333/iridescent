// ─────────────────────────────────────────────────────────────
// Sign-in screen. Two tabs: subscription (Claude CLI, default)
// and api key (Anthropic Console, advanced).
// ─────────────────────────────────────────────────────────────

import { KeyboardEvent, useState } from "react";
import { motion } from "framer-motion";
import { Orb } from "../../design/primitives";
import { send } from "../../lib/rpc";

type Tab = "subscription" | "apikey";
type TokenKind = "oauth" | "api" | "unknown" | "empty";

export interface AuthGateProps {
  validating: boolean;
  error: string | null;
}

const PRIMARY =
  "w-full bg-accent text-white border-0 px-3 py-[11px] rounded-lg cursor-pointer text-[13px] font-bold tracking-[-0.1px] transition-all duration-150 mt-1 font-[inherit] hover:not-[:disabled]:bg-accent-deep disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none";

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
    <motion.div
      className="flex-1 overflow-y-auto px-[22px] pt-8 pb-[18px] flex flex-col bg-s0"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="text-center mb-[22px] flex flex-col items-center">
        <Orb size={64} />
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] m-0 mb-1.5 text-t1">
          Welcome to Iridescent
        </h1>
        <p className="text-[13px] text-t3 m-0 leading-[1.5]">
          Agentic coding assistant for VS Code. Sign in to start.
        </p>
      </div>

      <div className="flex gap-[3px] p-[3px] bg-s1 rounded-[10px] border border-b1 mb-3.5" role="tablist">
        <TabButton id="subscription" active={tab} onClick={setTab}>Subscription</TabButton>
        <TabButton id="apikey" active={tab} onClick={setTab}>API key</TabButton>
      </div>

      <div className="bg-s1 border border-b1 rounded-xl p-[18px] mb-3">
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

      <div className="text-center text-[11px] text-t4 mt-auto pt-3">
        <span>Credentials stored in VS Code SecretStorage (OS keychain).</span>
      </div>
    </motion.div>
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
  const isActive = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`flex-1 bg-transparent border-0 text-t3 px-2.5 py-2 rounded-[7px] cursor-pointer text-[12px] font-semibold transition-colors duration-[140ms] whitespace-nowrap font-[inherit] hover:text-t1 ${
        isActive
          ? "bg-s3 text-t1 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
          : ""
      }`}
      onClick={() => onClick(id)}
    >
      {children}
    </button>
  );
}

interface SubscriptionPanelProps {
  validating: boolean;
}

function SubscriptionPanel({ validating }: SubscriptionPanelProps) {
  const runCmd = (command: string) => send({ type: "runTerminalCommand", command });
  const [signedIn, setSignedIn] = useState(false);

  const onClick = () => {
    runCmd("claude login");
    setSignedIn(true);
    send({ type: "authSubscription" });
  };

  return (
    <>
      <p className="text-[13px] leading-[1.55] m-0 mb-3 text-t2">
        Sign in once with your <strong className="text-accent-glow font-bold">Claude</strong> account. Works with Pro, Max, Team, or
        Enterprise — no API key needed.
      </p>
      <button
        type="button"
        className={PRIMARY}
        style={{ boxShadow: "0 2px 12px var(--accent-shadow)" }}
        onClick={onClick}
        disabled={validating || signedIn}
      >
        {signedIn ? "Connecting…" : "Sign in with Claude"}
      </button>
      {signedIn && (
        <p className="text-[13px] leading-[1.55] mt-2.5 mb-0 text-t3">
          Complete the sign-in in the terminal/browser. You can start chatting as soon as it's done.
        </p>
      )}
    </>
  );
}

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
  const detectClass =
    detected === "api"
      ? "text-ok"
      : detected === "oauth" || detected === "unknown"
        ? "text-warn"
        : "text-t3";

  return (
    <>
      <p className="text-[13px] leading-[1.55] m-0 mb-3 text-t2">
        Bring your own <strong className="text-accent-glow font-bold">Anthropic Console</strong> API key. Pre-paid credits required.
        Works with any model and has higher programmatic limits than subscriptions.
      </p>
      <ol className="pl-[18px] m-0 mb-3.5 text-[12.5px] leading-[1.7] text-t2 list-decimal">
        <li className="mb-1">
          <button
            type="button"
            className="bg-transparent border border-accent-mid text-accent-glow px-2.5 py-1 rounded-md cursor-pointer text-[12px] font-semibold font-[inherit] transition-colors duration-[120ms] hover:bg-accent-soft hover:border-accent hover:text-t1"
            onClick={() => open("https://console.anthropic.com/settings/keys")}
          >
            Open console.anthropic.com ↗
          </button>
        </li>
        <li className="mb-1">
          Create a new key (starts with{" "}
          <code className="inline-block bg-s2 border border-b1 px-1.5 py-px rounded-[4px] font-mono text-[11.5px] text-accent-glow">
            sk-ant-api03-…
          </code>
          ).
        </li>
        <li className="mb-1">Paste below.</li>
      </ol>
      <div className="my-2">
        <input
          type="password"
          autoFocus
          placeholder="sk-ant-api03-…"
          value={keyVal}
          onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
          onKeyDown={onKeyDown}
          disabled={validating}
          spellCheck={false}
          className="w-full bg-s2 text-t1 border border-b2 rounded-lg px-3 py-2.5 font-mono text-[12px] focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
        />
        {keyVal && (
          <div className={`mt-1.5 text-[11px] font-medium ${detectClass}`}>
            {detected === "api" && "✓ Console API key"}
            {detected === "oauth" &&
              "⚠ This is a subscription OAuth token. Use the Subscription tab instead."}
            {detected === "unknown" &&
              "⚠ Unrecognized format — should start with sk-ant-api03-"}
          </div>
        )}
      </div>
      {error && (
        <div className="bg-err-soft text-err border border-[rgba(248,113,113,0.35)] rounded-lg px-3 py-2.5 text-[12px] my-2.5 leading-[1.45]">
          {error}
        </div>
      )}
      <button
        type="button"
        className={PRIMARY}
        style={{ boxShadow: "0 2px 12px var(--accent-shadow)" }}
        onClick={onSubmit}
        disabled={!keyVal.trim() || validating || detected !== "api"}
      >
        {validating ? "Validating…" : "Connect"}
      </button>
    </>
  );
}

function detectTokenKind(token: string): TokenKind {
  const t = token.trim();
  if (!t) return "empty";
  if (t.startsWith("sk-ant-oat")) return "oauth";
  if (t.startsWith("sk-ant-api")) return "api";
  return "unknown";
}
