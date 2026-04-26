// ─────────────────────────────────────────────────────────────
// Chat screen — orchestrates timeline + composer + empty state.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import {
  send,
  TimelineEvent,
  EditorContext,
  AuthMode,
  PermissionMode,
  ModelInfo,
  SkillInfo
} from "../../lib/rpc";
import type { CodeInsert } from "../../design/primitives";
import { Header } from "./Header";
import { Composer } from "./Composer";
import { ContextStrip } from "./ContextStrip";
import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { RewindModal } from "./RewindModal";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolCard } from "./ToolCard";

export interface ChatScreenProps {
  authMode: AuthMode | null;
  model: string;
  permissionMode: PermissionMode;
  events: TimelineEvent[];
  streaming: string;
  busy: boolean;
  input: string;
  error: string | null;
  editorContext: EditorContext | null;
  models: ReadonlyArray<ModelInfo>;
  skills: ReadonlyArray<SkillInfo>;
  composerFocusKey: number;
  pendingInsert: CodeInsert | null;
  onInserted: () => void;
  onInput: (v: string) => void;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onDismissError: () => void;
}

export function ChatScreen({
  authMode,
  model,
  permissionMode,
  events,
  streaming,
  busy,
  input,
  error,
  editorContext,
  models,
  skills,
  composerFocusKey,
  pendingInsert,
  onInserted,
  onInput,
  onSubmit,
  onCancel,
  onDismissError
}: ChatScreenProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  const [, force] = useState(0);
  const [pendingRewind, setPendingRewind] = useState<{
    turnId: string;
    messagesAfter: number;
  } | null>(null);

  const grouped = useMemo(() => groupEvents(events), [events]);

  useEffect(() => {
    if (userScrolled.current) return;
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [grouped, streaming]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolled.current = !nearBottom;
    force((n) => n + 1);
  };

  return (
    <>
      <Header authMode={authMode} permissionMode={permissionMode} busy={busy} />

      <div className="log" ref={logRef} onScroll={onScroll}>
        {grouped.length === 0 && !streaming && <EmptyState />}
        {grouped.map((g, i) =>
          renderGroup(g, i, grouped, (turnId, messagesAfter) =>
            setPendingRewind({ turnId, messagesAfter })
          )
        )}
        {streaming && <AssistantMessage text={streaming} streaming />}
        {error && <ErrorBanner text={error} onDismiss={onDismissError} />}
      </div>

      {pendingRewind && (
        <RewindModal
          messagesAfter={pendingRewind.messagesAfter}
          onCancel={() => setPendingRewind(null)}
          onConfirm={() => {
            send({ type: "rewindTo", turnId: pendingRewind.turnId });
            setPendingRewind(null);
          }}
        />
      )}

      {userScrolled.current && (
        <button
          type="button"
          className="scroll-fab"
          aria-label="Scroll to bottom"
          onClick={() => {
            userScrolled.current = false;
            const el = logRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            force((n) => n + 1);
          }}
        >
          ↓
        </button>
      )}

      <div className="composer-shell">
        <ContextStrip context={editorContext} />
        <Composer
          value={input}
          onChange={onInput}
          onSubmit={(text) => {
            userScrolled.current = false;
            onSubmit(text);
          }}
          onCancel={onCancel}
          busy={busy}
          authMode={authMode}
          model={model}
          permissionMode={permissionMode}
          models={models}
          skills={skills}
          focusKey={composerFocusKey}
          pendingInsert={pendingInsert}
          onInserted={onInserted}
        />
      </div>
    </>
  );
}

// ── Timeline grouping ────────────────────────────────────────

type Group =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; input: string; result?: string; isError?: boolean };

function groupEvents(events: TimelineEvent[]): Group[] {
  const groups: Group[] = [];
  const toolById = new Map<string, Extract<Group, { kind: "tool" }>>();

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
      const g: Extract<Group, { kind: "tool" }> = {
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

function renderGroup(
  g: Group,
  idx: number,
  all: Group[],
  onRewindRequest: (turnId: string, messagesAfter: number) => void
) {
  if (g.kind === "user") {
    const messagesAfter = all.length - idx - 1;
    return (
      <UserMessage
        key={g.id}
        id={g.id}
        text={g.text}
        canRewind
        messagesAfter={messagesAfter}
        onRewindRequest={onRewindRequest}
      />
    );
  }
  if (g.kind === "assistant") {
    // Only the first assistant block in a turn (i.e. since the most recent
    // user message) shows the avatar — follow-up text after tool calls in
    // the same turn is rendered as a plain continuation.
    let showAvatar = true;
    for (let i = idx - 1; i >= 0; i--) {
      if (all[i].kind === "user") break;
      if (all[i].kind === "assistant") {
        showAvatar = false;
        break;
      }
    }
    return <AssistantMessage key={g.id} text={g.text} showAvatar={showAvatar} />;
  }
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
