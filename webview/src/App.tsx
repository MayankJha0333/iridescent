// ─────────────────────────────────────────────────────────────
// App shell — owns auth state, timeline, and shared composer state
// (models, skills, attachments). Delegates to <AuthGate> or
// <ChatScreen> based on auth status.
// ─────────────────────────────────────────────────────────────

import { useEffect, useReducer, useState } from "react";
import {
  send,
  onMessage,
  saveState,
  loadState,
  newId,
  AuthMode,
  PermissionMode,
  TimelineEvent,
  EditorContext,
  Attachment,
  ModelInfo,
  SkillInfo
} from "./lib/rpc";
import { Spinner } from "./design/primitives";
import { AuthGate } from "./features/auth/AuthGate";
import { ChatScreen } from "./features/chat";
import { FALLBACK_MODELS } from "./features/chat/constants";

// ── Auth state ───────────────────────────────────────────────

type AuthState =
  | { status: "loading" }
  | { status: "unauthed"; mode: AuthMode | null; error: string | null; validating: boolean }
  | { status: "authed"; mode: AuthMode; model: string; permissionMode: PermissionMode };

interface Persisted {
  events?: TimelineEvent[];
  input?: string;
}

// ── Timeline reducer ─────────────────────────────────────────

type TimelineAction =
  | { type: "reset" }
  | { type: "append"; event: TimelineEvent }
  | { type: "replace"; events: TimelineEvent[] };

function timelineReducer(state: TimelineEvent[], action: TimelineAction): TimelineEvent[] {
  switch (action.type) {
    case "reset":
      return [];
    case "append":
      return state.some((e) => e.id === action.event.id) ? state : [...state, action.event];
    case "replace":
      return action.events;
  }
}

// ── Attachments reducer ──────────────────────────────────────

type AttachAction =
  | { type: "add"; attachment: Attachment }
  | { type: "update"; id: string; patch: Partial<Attachment> }
  | { type: "remove"; id: string }
  | { type: "clear" };

function attachmentsReducer(state: Attachment[], action: AttachAction): Attachment[] {
  switch (action.type) {
    case "add":
      return state.some((a) => a.id === action.attachment.id) ? state : [...state, action.attachment];
    case "update":
      return state.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a));
    case "remove":
      return state.filter((a) => a.id !== action.id);
    case "clear":
      return [];
  }
}

// ── Component ────────────────────────────────────────────────

export function App() {
  const initial = loadState<Persisted>() ?? {};

  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [events, dispatchTimeline] = useReducer(timelineReducer, initial.events ?? []);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState(initial.input ?? "");
  const [error, setError] = useState<string | null>(null);
  const [editorContext, setEditorContext] = useState<EditorContext | null>(null);
  const [rewind, setRewind] = useState<{ restored: number; deleted: number } | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([...FALLBACK_MODELS]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [attachments, dispatchAttachments] = useReducer(attachmentsReducer, []);
  const [composerFocusKey, setComposerFocusKey] = useState(0);

  // Persist non-volatile UI state.
  useEffect(() => {
    saveState<Persisted>({ events, input });
  }, [events, input]);

  // Single inbound message handler.
  useEffect(() => {
    const off = onMessage((m) => {
      switch (m.type) {
        case "auth": {
          if (m.authed && m.mode && m.model) {
            setAuth({
              status: "authed",
              mode: m.mode,
              model: m.model,
              permissionMode: m.permissionMode ?? "default"
            });
            send({ type: "requestModels" });
            send({ type: "requestSkills" });
          } else {
            setAuth({
              status: "unauthed",
              mode: m.mode ?? null,
              error: null,
              validating: false
            });
          }
          break;
        }
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
          dispatchTimeline({ type: "reset" });
          dispatchAttachments({ type: "clear" });
          setStreaming("");
          setError(null);
          break;
        case "timeline":
          dispatchTimeline({ type: "append", event: m.event });
          if (m.event.kind === "assistant") setStreaming("");
          break;
        case "delta": {
          const d = m.delta;
          if (d.type === "text") setStreaming((s) => s + d.text);
          else if (d.type === "error") setError(d.error);
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
          dispatchTimeline({ type: "replace", events: m.events });
          setStreaming("");
          setError(null);
          setRewind({ restored: m.restored, deleted: m.deleted });
          break;
        case "models":
          if (m.models.length) setModels(m.models);
          break;
        case "skills":
          setSkills(m.skills);
          break;
        case "fileSnippet":
          if (m.ok && m.text !== undefined) {
            dispatchAttachments({
              type: "update",
              id: m.id,
              patch: { text: m.text }
            });
          } else if (!m.ok) {
            // Failed to read — drop the attachment so the user isn't confused.
            dispatchAttachments({ type: "remove", id: m.id });
            if (m.error) setError(m.error);
          }
          break;
        case "insertSelection": {
          // Cmd+L → add a code-snippet chip to the composer's attachment
          // bar (rendered above the textarea). The chip carries the
          // selected text so the user sees it as a discrete block instead
          // of raw markdown in their prompt.
          const att: Attachment = {
            id: newId(),
            kind: "selection",
            label: m.file.split("/").pop() ?? m.file,
            path: m.file,
            language: m.language,
            startLine: m.startLine,
            endLine: m.endLine,
            text: m.text
          };
          dispatchAttachments({ type: "add", attachment: att });
          setComposerFocusKey((k) => k + 1);
          break;
        }
        case "cliStatus":
        case "fileSearchResults":
          // Consumed by the AuthGate / MentionPopover via their own subscriptions.
          break;
      }
    });
    send({ type: "refreshAuth" });
    send({ type: "refreshEditorContext" });
    return off;
  }, []);

  if (auth.status === "loading") {
    return (
      <div className="app">
        <div className="loading">
          <Spinner size={48} />
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

  return (
    <div className="app">
      <ChatScreen
        authMode={auth.mode}
        model={auth.model}
        permissionMode={auth.permissionMode}
        events={events}
        streaming={streaming}
        busy={busy}
        input={input}
        error={error}
        editorContext={editorContext}
        rewind={rewind}
        models={models}
        skills={skills}
        attachments={attachments}
        composerFocusKey={composerFocusKey}
        onInput={setInput}
        onSubmit={(text, atts) => {
          send({ type: "prompt", text, attachments: atts });
          setInput("");
        }}
        onCancel={() => send({ type: "cancel" })}
        onDismissError={() => setError(null)}
        onDismissRewind={() => setRewind(null)}
        onAddAttachment={(a) => dispatchAttachments({ type: "add", attachment: a })}
        onRemoveAttachment={(id) => dispatchAttachments({ type: "remove", id })}
        onClearAttachments={() => dispatchAttachments({ type: "clear" })}
      />
    </div>
  );
}
