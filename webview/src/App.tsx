import { useEffect, useMemo, useRef, useState } from "react";
import { send, onMessage, saveState, loadState } from "./rpc";
import { AuthGate } from "./AuthGate";
import { Header } from "./components/Header";
import { Composer } from "./components/Composer";
import { UserMessage } from "./components/UserMessage";
import { AssistantMessage } from "./components/AssistantMessage";
import { ToolCard } from "./components/ToolCard";
import { ContextStrip, EditorContext } from "./components/ContextStrip";

interface TimelineEvent {
  id: string;
  ts: number;
  kind: string;
  title: string;
  body?: string;
  meta?: { id?: string };
}

interface Delta {
  type: "text" | "tool_use_start" | "tool_use_input" | "tool_use_end" | "done" | "error";
  text?: string;
  tool?: { id: string; name: string };
  error?: string;
}

type AuthState =
  | { status: "loading" }
  | { status: "unauthed"; mode: string | null; error: string | null; validating: boolean }
  | { status: "authed"; mode: string; model: string; permissionMode: string };

interface Persisted {
  events?: TimelineEvent[];
  input?: string;
}

interface RewindInfo {
  restored: number;
  deleted: number;
}

export function App() {
  const initial = loadState<Persisted>() ?? {};
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [events, setEvents] = useState<TimelineEvent[]>(initial.events ?? []);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState(initial.input ?? "");
  const [error, setError] = useState<string | null>(null);
  const [editorContext, setEditorContext] = useState<EditorContext | null>(null);
  const [lastRewind, setLastRewind] = useState<RewindInfo | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);

  useEffect(() => {
    saveState<Persisted>({ events, input });
  }, [events, input]);

  useEffect(() => {
    const off = onMessage<any>((m) => {
      switch (m.type) {
        case "auth":
          setAuth(
            m.authed
              ? {
                  status: "authed",
                  mode: m.mode,
                  model: m.model,
                  permissionMode: m.permissionMode ?? "default"
                }
              : { status: "unauthed", mode: m.mode ?? null, error: null, validating: false }
          );
          break;
        case "authValidating":
          setAuth((a) =>
            a.status === "unauthed" ? { ...a, validating: true, error: null } : a
          );
          break;
        case "authResult":
          setAuth((a) =>
            a.status === "unauthed"
              ? { ...a, validating: false, error: m.ok ? null : m.error ?? "Failed." }
              : a
          );
          break;
        case "hello":
          setStreaming("");
          setError(null);
          break;
        case "reset":
          setEvents([]);
          setStreaming("");
          setError(null);
          userScrolled.current = false;
          break;
        case "timeline":
          setEvents((prev) =>
            prev.some((e) => e.id === m.event.id) ? prev : [...prev, m.event]
          );
          if (m.event.kind === "assistant") setStreaming("");
          break;
        case "delta": {
          const d: Delta = m.delta;
          if (d.type === "text" && d.text) setStreaming((s) => s + d.text);
          if (d.type === "error") setError(d.error ?? "error");
          break;
        }
        case "turnStart":
          setBusy(true);
          setStreaming("");
          setError(null);
          break;
        case "turnEnd":
          setBusy(false);
          setStreaming("");
          break;
        case "error":
          setError(m.message);
          setBusy(false);
          break;
        case "editorContext":
          setEditorContext(m.context ?? null);
          break;
        case "rewind":
          setEvents(m.events ?? []);
          setStreaming("");
          setError(null);
          userScrolled.current = false;
          setLastRewind({ restored: m.restored ?? 0, deleted: m.deleted ?? 0 });
          break;
      }
    });
    send({ type: "refreshAuth" });
    send({ type: "refreshEditorContext" });
    return off;
  }, []);

  useEffect(() => {
    if (userScrolled.current) return;
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events, streaming]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolled.current = !nearBottom;
  };

  const grouped = useMemo(() => groupEvents(events), [events]);

  if (auth.status === "loading") {
    return (
      <div className="app">
        <div className="loading">
          <div className="loading-pulse">✦</div>
        </div>
      </div>
    );
  }

  if (auth.status === "unauthed") {
    return (
      <div className="app">
        <AuthGate validating={auth.validating} error={auth.error} />
      </div>
    );
  }

  const submit = () => {
    const t = input.trim();
    if (!t || busy) return;
    send({ type: "prompt", text: t });
    setInput("");
    userScrolled.current = false;
  };

  return (
    <div className="app">
      <Header
        mode={auth.mode}
        model={auth.model}
        permissionMode={auth.permissionMode}
        busy={busy}
      />

      <div className="log" ref={logRef} onScroll={onScroll}>
        {grouped.length === 0 && !streaming && <EmptyState />}
        {grouped.map((g, i) => renderGroup(g, i, grouped))}
        {lastRewind && (
          <RewindMarker
            restored={lastRewind.restored}
            deleted={lastRewind.deleted}
            onDismiss={() => setLastRewind(null)}
          />
        )}
        {streaming && <AssistantMessage text={streaming} streaming />}
        {error && <ErrorBanner text={error} onDismiss={() => setError(null)} />}
      </div>

      {userScrolled.current && (
        <button
          className="scroll-fab"
          onClick={() => {
            userScrolled.current = false;
            logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
          }}
        >
          ↓
        </button>
      )}

      <div className="composer-shell">
        <ContextStrip context={editorContext} />
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          onCancel={() => send({ type: "cancel" })}
          busy={busy}
          mode={auth.mode}
        />
      </div>
    </div>
  );
}

type Group =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; input: string; result?: string; isError?: boolean };

function groupEvents(events: TimelineEvent[]): Group[] {
  const groups: Group[] = [];
  const toolById = new Map<string, Group & { kind: "tool" }>();

  for (const e of events) {
    if (e.kind === "user") {
      groups.push({ kind: "user", id: e.id, text: e.body ?? "" });
    } else if (e.kind === "assistant") {
      const last = groups[groups.length - 1];
      if (last && last.kind === "assistant") {
        last.text += "\n\n" + (e.body ?? "");
      } else {
        groups.push({ kind: "assistant", id: e.id, text: e.body ?? "" });
      }
    } else if (e.kind === "tool_call") {
      const name = e.title.replace(/^Tool:\s*/, "");
      const g: Group & { kind: "tool" } = {
        kind: "tool",
        id: e.id,
        name,
        input: e.body ?? "{}"
      };
      groups.push(g);
      const tid = e.meta?.id;
      if (tid) toolById.set(tid, g);
    } else if (e.kind === "tool_result") {
      const tid = e.meta?.id;
      const target = tid ? toolById.get(tid) : undefined;
      if (target) {
        target.result = e.body ?? "";
        target.isError = e.title === "Tool Error";
      } else {
        groups.push({
          kind: "tool",
          id: e.id,
          name: "result",
          input: "{}",
          result: e.body ?? "",
          isError: e.title === "Tool Error"
        });
      }
    }
  }
  return groups;
}

function renderGroup(g: Group, idx: number, all: Group[]) {
  if (g.kind === "user") {
    const messagesAfter = all.length - idx - 1;
    return (
      <UserMessage
        key={g.id}
        id={g.id}
        text={g.text}
        canRewind
        messagesAfter={messagesAfter}
      />
    );
  }
  if (g.kind === "assistant") return <AssistantMessage key={g.id} text={g.text} />;
  return (
    <ToolCard
      key={g.id}
      name={g.name}
      input={g.input}
      result={g.result}
      isError={g.isError}
      pending={g.result === undefined}
    />
  );
}

function RewindMarker({
  restored,
  deleted,
  onDismiss
}: {
  restored: number;
  deleted: number;
  onDismiss: () => void;
}) {
  return (
    <div className="rewind-marker">
      <div className="rewind-marker-line" />
      <div className="rewind-marker-body">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
        </svg>
        <span>
          Rewound —{" "}
          {restored > 0 && `${restored} file${restored !== 1 ? "s" : ""} restored`}
          {restored > 0 && deleted > 0 && ", "}
          {deleted > 0 && `${deleted} deleted`}
          {restored === 0 && deleted === 0 && "no file changes"}
        </span>
        <button className="rewind-marker-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
      <div className="rewind-marker-line" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-logo">✦</div>
      <div className="empty-title">How can I help?</div>
      <div className="empty-suggestions">
        <Suggestion text="Explain this codebase" />
        <Suggestion text="Find and fix a bug" />
        <Suggestion text="Write tests for the selected file" />
        <Suggestion text="Refactor for clarity" />
      </div>
    </div>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <button className="suggestion" onClick={() => send({ type: "prompt", text })}>
      {text}
    </button>
  );
}

function ErrorBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const isRateLimit = /429|rate.?limit/i.test(text);
  const isAuth = /401|403|auth rejected/i.test(text);
  return (
    <div className="error-banner">
      <div className="error-head">
        <span className="error-icon">{isRateLimit ? "⏱" : isAuth ? "🔒" : "⚠"}</span>
        <span className="error-title">
          {isRateLimit ? "Rate limited" : isAuth ? "Authentication failed" : "Error"}
        </span>
        <button className="error-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
      <div className="error-body">{text}</div>
      {(isAuth || isRateLimit) && (
        <div className="error-actions">
          <button onClick={() => send({ type: "authReset" })}>
            {isRateLimit ? "Switch auth" : "Logout & Reconnect"}
          </button>
        </div>
      )}
    </div>
  );
}
