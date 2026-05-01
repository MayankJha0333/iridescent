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
import { HistoryDrawer } from "./HistoryDrawer";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolCard } from "./ToolCard";
import { PlanCard, foldPlanState, looksLikePlanFile } from "../plan";
import type { PlanRevisionView } from "../plan";

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
  const [historyOpen, setHistoryOpen] = useState(false);

  const grouped = useMemo(() => groupEvents(events), [events]);
  const planContext = useMemo(
    () => ({ views: grouped.views, ordered: grouped.ordered }),
    [grouped]
  );

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
      <Header
        authMode={authMode}
        permissionMode={permissionMode}
        busy={busy}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <div className="log" ref={logRef} onScroll={onScroll}>
        {grouped.groups.length === 0 && !streaming && <EmptyState />}
        {grouped.groups.map((g, i) =>
          renderGroup(g, i, grouped.groups, planContext, (turnId, messagesAfter) =>
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

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => {
          send({ type: "loadSession", id });
          setHistoryOpen(false);
        }}
      />

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
  | { kind: "tool"; id: string; name: string; input: string; result?: string; isError?: boolean }
  | { kind: "plan"; id: string; revisionId: string };

/**
 * Tool names whose tool_use blocks are rendered via PlanCard rather than
 * ToolCard. Filter applies even on historic sessions saved before plan
 * interception was wired (defensive — orchestrator already suppresses live).
 */
const PLAN_TOOL_NAMES = new Set(["ExitPlanMode", "TodoWrite", "AskUserQuestion"]);
const WRITE_TOOL_NAMES = new Set([
  "Write",
  "Create",
  "Edit",
  "MultiEdit",
  "fs_write",
  "str_replace_editor"
]);

function isPlanFileWriteEvent(name: string, body: string | undefined): boolean {
  if (!WRITE_TOOL_NAMES.has(name)) return false;
  try {
    const input = JSON.parse(body ?? "{}") as Record<string, unknown>;
    const path = String(input.path ?? input.file_path ?? input.filePath ?? "");
    return looksLikePlanFile(path);
  } catch {
    return false;
  }
}

interface GroupingResult {
  groups: Group[];
  views: Map<string, PlanRevisionView>;
  ordered: PlanRevisionView[];
}

function groupEvents(events: TimelineEvent[]): GroupingResult {
  const groups: Group[] = [];
  const toolById = new Map<string, Extract<Group, { kind: "tool" }>>();
  const ordered = foldPlanState(events);
  const views = new Map<string, PlanRevisionView>();
  for (const v of ordered) views.set(v.meta.revisionId, v);
  /** Tool-use ids whose tool_call we suppressed (plan-file writes). Their
   * tool_result events should be hidden too. */
  const suppressedToolUseIds = new Set<string>();

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
      if (PLAN_TOOL_NAMES.has(name)) continue;
      // Back-fill: a Write to a plan file in a session saved before the
      // backend interceptor existed shows up as a synthetic plan view
      // keyed `synth-<eventId>`. Render it as a PlanCard in place.
      const synthId = `synth-${e.id}`;
      if (views.has(synthId)) {
        const tid = (e.meta as { id?: string } | undefined)?.id;
        if (tid) suppressedToolUseIds.add(tid);
        groups.push({ kind: "plan", id: e.id, revisionId: synthId });
        continue;
      }
      // Defensive: even without a synthetic view, hide a Write to a plan
      // file when we can detect the path — we'll have a real plan_revision
      // event for it elsewhere (live-streaming case).
      if (isPlanFileWriteEvent(name, e.body)) {
        const tid = (e.meta as { id?: string } | undefined)?.id;
        if (tid) suppressedToolUseIds.add(tid);
        continue;
      }
      const g: Extract<Group, { kind: "tool" }> = {
        kind: "tool",
        id: e.id,
        name,
        input: e.body ?? "{}"
      };
      groups.push(g);
      const tid = (e.meta as { id?: string } | undefined)?.id;
      if (tid) toolById.set(tid, g);
    } else if (e.kind === "tool_result") {
      const tid = (e.meta as { id?: string } | undefined)?.id;
      if (tid && suppressedToolUseIds.has(tid)) continue;
      const target = tid ? toolById.get(tid) : undefined;
      if (target) {
        target.result = e.body ?? "";
        target.isError = e.title === "Tool Error";
      } else if (!tid || !PLAN_TOOL_NAMES.has(target?.name ?? "")) {
        groups.push({
          kind: "tool",
          id: e.id,
          name: "result",
          input: "{}",
          result: e.body ?? "",
          isError: e.title === "Tool Error"
        });
      }
    } else if (e.kind === "plan_revision") {
      const meta = e.meta as { revisionId?: string } | undefined;
      if (meta?.revisionId) {
        groups.push({ kind: "plan", id: e.id, revisionId: meta.revisionId });
      }
    }
    // plan_question / plan_comment / plan_answer events do not produce
    // their own groups — they are folded into the PlanRevisionView.
  }
  return { groups, views, ordered };
}

function renderGroup(
  g: Group,
  idx: number,
  all: Group[],
  ctx: { views: Map<string, PlanRevisionView>; ordered: PlanRevisionView[] },
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
  if (g.kind === "plan") {
    const view = ctx.views.get(g.revisionId);
    if (!view) return null;
    const ordinal = ctx.ordered.indexOf(view) + 1;
    const previous = ordinal > 1 ? ctx.ordered[ordinal - 2] : undefined;
    const isLatest = ordinal === ctx.ordered.length;
    return (
      <PlanCard
        key={g.id}
        view={view}
        previous={previous}
        isLatest={isLatest}
        ordinal={ordinal}
      />
    );
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
