import { randomUUID } from "node:crypto";
import { Session } from "./session.js";
import {
  PlanQuestionEntry,
  PlanQuestionOption,
  PlanRevisionMeta,
  PlanTask,
  PlanTaskFileRef,
  TimelineEvent
} from "./types.js";

export const PLAN_TOOL_NAMES = new Set(["ExitPlanMode", "TodoWrite", "AskUserQuestion"]);

/**
 * Tool names that write file content. The CLI's plan-mode workflow writes
 * the plan markdown to a file *before* calling ExitPlanMode, so we sniff
 * these to recover the plan body. Names cover both api-key (fs_write) and
 * Claude CLI (Write/Create/Edit/MultiEdit) shapes.
 */
const WRITE_TOOL_NAMES = new Set([
  "Write",
  "Create",
  "Edit",
  "MultiEdit",
  "fs_write",
  "str_replace_editor"
]);

/** Heuristic: true if `path` looks like the CLI's plan-mode markdown file. */
function looksLikePlanFile(p: string): boolean {
  if (!p) return false;
  if (!/\.(md|markdown)$/i.test(p)) return false;
  // ~/.claude/plans/*.md  or anything under a /plans/ directory.
  return /(^|\/)\.claude\/plans\//.test(p) || /(^|\/)plans\//.test(p);
}

interface PendingPlan {
  body?: string;
  tasks?: PlanTask[];
  toolUseId?: string;
  planFilePath?: string;
}

/**
 * Folds CLI-emitted ExitPlanMode + TodoWrite tool_use blocks into structured
 * `plan_revision` timeline events, and AskUserQuestion blocks into
 * `plan_question` events. One instance per orchestrator turn — call
 * `consume(name, id, input)` from `tool_use_end`, `flush()` after the stream
 * ends. Intercepted tool ids are tracked so the orchestrator can suppress
 * duplicate `tool_call` / `tool_result` timeline emissions.
 */
export class PlanInterceptor {
  private pending: PendingPlan = {};
  /** Plan-file writes seen this turn, by toolUseId, in arrival order. */
  private planFileWrites: Array<{ toolUseId: string; path: string; content: string }> = [];
  readonly interceptedToolIds = new Set<string>();

  constructor(private session: Session) {}

  /** Returns true if this tool_use was a plan-related event we handled. */
  consume(name: string, toolUseId: string, input: Record<string, unknown>): boolean {
    // Snoop plan-file writes so ExitPlanMode can recover the plan body
    // from the file the CLI just wrote (its actual plan-mode workflow).
    if (WRITE_TOOL_NAMES.has(name)) {
      const path = String(input.path ?? input.file_path ?? input.filePath ?? "");
      if (looksLikePlanFile(path)) {
        const content = readWriteContent(input);
        if (content) {
          this.planFileWrites.push({ toolUseId, path, content });
          this.interceptedToolIds.add(toolUseId);
          // Emit the revision immediately so the PlanCard appears in
          // place of the Write card, not deferred to the end of the
          // stream (where it would land below the summary text).
          this.emitFileBackedRevision(path, content, toolUseId);
          return true;
        }
      }
      return false;
    }
    switch (name) {
      case "ExitPlanMode": {
        this.interceptedToolIds.add(toolUseId);
        const body = typeof input.plan === "string" ? input.plan : "";
        if (body) {
          // Legacy ExitPlanMode shape that carries the plan in `input.plan`.
          // Emit a revision (or pair with an upcoming TodoWrite).
          this.pending.body = body;
          this.pending.toolUseId = toolUseId;
          if (this.pending.tasks) this.flushRevision();
        }
        // When body is empty, the plan-file Write that preceded this call
        // has already produced a plan_revision via emitFileBackedRevision —
        // ExitPlanMode is just the "I'm done planning" signal. No-op here.
        return true;
      }
      case "TodoWrite": {
        const tasks = parseTasks(input);
        this.pending.tasks = tasks;
        if (this.pending.body !== undefined) {
          this.flushRevision();
        } else {
          this.flushRevision(/* taskOnly */ true);
        }
        this.interceptedToolIds.add(toolUseId);
        return true;
      }
      case "AskUserQuestion": {
        const questions = parseQuestions(input);
        if (questions.length === 0) return false;
        this.session.emitPlanQuestion({
          questionId: randomUUID(),
          toolUseId,
          revisionId: latestRevisionId(this.session.timeline),
          questions
        });
        this.interceptedToolIds.add(toolUseId);
        return true;
      }
      default:
        return false;
    }
  }

  /** Flush a leftover plan body (no paired TodoWrite) at end-of-stream. */
  flush(): void {
    if (this.pending.body !== undefined && this.pending.tasks === undefined) {
      this.flushRevision();
    }
  }

  /**
   * Emit a plan_revision built from a plan-file Write call, in place. Used
   * for the CLI's actual plan-mode workflow where the body lives in the
   * file and ExitPlanMode (when called) carries no plan field.
   */
  private emitFileBackedRevision(planFilePath: string, body: string, toolUseId: string): void {
    const prior = priorRevision(this.session.timeline);
    const meta: PlanRevisionMeta = {
      revisionId: randomUUID(),
      parentRevisionId: prior?.revisionId,
      toolUseId,
      body,
      tasks: prior?.tasks ?? [],
      bodyChanged: body !== (prior?.body ?? ""),
      planFilePath
    };
    this.session.emitPlanRevision(meta);
  }

  private flushRevision(taskOnly = false): void {
    const prior = priorRevision(this.session.timeline);
    const body = this.pending.body ?? prior?.body ?? "";
    const tasks = this.pending.tasks ?? prior?.tasks ?? [];
    const meta: PlanRevisionMeta = {
      revisionId: randomUUID(),
      parentRevisionId: prior?.revisionId,
      toolUseId: this.pending.toolUseId,
      body,
      tasks,
      bodyChanged: !taskOnly && body !== (prior?.body ?? ""),
      planFilePath: this.pending.planFilePath ?? prior?.planFilePath
    };
    this.session.emitPlanRevision(meta);
    this.pending = {};
  }
}

/** Pull the new file content out of a Write/Edit/Create input shape. */
function readWriteContent(input: Record<string, unknown>): string {
  const candidates = [
    input.content,
    input.file_text,
    input.text,
    input.new_str,
    input.body
  ];
  for (const c of candidates) {
    if (typeof c === "string") return c;
  }
  return "";
}

function parseTasks(input: Record<string, unknown>): PlanTask[] {
  const todos = Array.isArray(input.todos) ? input.todos : [];
  return todos.map((t, i) => {
    const obj = (t ?? {}) as Record<string, unknown>;
    const content = String(obj.content ?? "");
    const activeForm = String(obj.activeForm ?? content);
    const fileRefs = extractFileRefs(`${content} ${activeForm}`);
    return {
      id: String(obj.id ?? `t${i + 1}`),
      content,
      activeForm,
      status: normalizeStatus(obj.status),
      ...(fileRefs.length > 0 ? { fileRefs } : {})
    };
  });
}

/**
 * Pull file/range references out of free-form task text. Supports:
 *
 *   foo/bar.ts                 → { path, startLine: 1, endLine: 1 }
 *   foo/bar.ts:42              → { path, startLine: 42, endLine: 42 }
 *   foo/bar.ts:42-58           → { path, startLine: 42, endLine: 58 }
 *   [Click me](foo/bar.ts)     → { path, label: "Click me" }
 *   `foo/bar.ts`               → strip backticks, then any of the above
 *
 * Filters extensions to a known programming/markup set so we don't catch
 * stray "phase 1.0" or version numbers. Dedupes by path+range.
 */
const FILE_EXT = "(?:ts|tsx|js|jsx|mjs|cjs|json|md|markdown|rs|py|go|java|kt|c|h|cc|hh|cpp|hpp|cs|rb|php|swift|sh|bash|yml|yaml|toml|html|css|scss|less|sql|graphql|gql|proto|tf|env|gitignore|dockerfile)";
const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BARE_RE = new RegExp(
  `(?:^|[\\s\`(\\[])((?:[\\w./-]+/)?[\\w.-]+\\.${FILE_EXT})(?::(\\d+)(?:[\\u2013\\u2014-](\\d+))?)?`,
  "gi"
);

export function extractFileRefs(text: string): PlanTaskFileRef[] {
  if (!text) return [];
  const out: PlanTaskFileRef[] = [];
  const seen = new Set<string>();

  // First: markdown links — they may carry a useful label.
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_RE.exec(text))) {
    const label = m[1].trim();
    const target = m[2];
    const ref = parseRef(target, label);
    if (ref && addUnique(seen, ref)) out.push(ref);
  }

  // Then: bare paths (markdown links above already pulled a portion of the
  // string out of consideration, but BARE_RE is permissive enough that the
  // dedupe key catches re-matches).
  while ((m = BARE_RE.exec(text))) {
    const path = m[1];
    const start = m[2] ? parseInt(m[2], 10) : 1;
    const end = m[3] ? parseInt(m[3], 10) : start;
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const ref: PlanTaskFileRef = { path, startLine: start, endLine: end };
    if (addUnique(seen, ref)) out.push(ref);
  }

  return out;
}

function parseRef(target: string, label?: string): PlanTaskFileRef | null {
  // Path may be "foo/bar.ts" or "foo/bar.ts:42-58"
  const cleaned = target.replace(/^`+|`+$/g, "");
  const m = cleaned.match(
    new RegExp(`^((?:[\\w./-]+/)?[\\w.-]+\\.${FILE_EXT})(?::(\\d+)(?:-(\\d+))?)?$`, "i")
  );
  if (!m) return null;
  const start = m[2] ? parseInt(m[2], 10) : 1;
  const end = m[3] ? parseInt(m[3], 10) : start;
  return { path: m[1], startLine: start, endLine: end, ...(label ? { label } : {}) };
}

function addUnique(seen: Set<string>, ref: PlanTaskFileRef): boolean {
  const key = `${ref.path}:${ref.startLine}-${ref.endLine}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

function normalizeStatus(s: unknown): PlanTask["status"] {
  if (s === "in_progress" || s === "completed" || s === "pending") return s;
  return "pending";
}

function parseQuestions(input: Record<string, unknown>): PlanQuestionEntry[] {
  const qs = Array.isArray(input.questions) ? input.questions : [];
  return qs
    .map((raw): PlanQuestionEntry | null => {
      const q = (raw ?? {}) as Record<string, unknown>;
      const question = String(q.question ?? "").trim();
      if (!question) return null;
      const opts = Array.isArray(q.options) ? q.options : [];
      const options: PlanQuestionOption[] = opts.map((o) => {
        const obj = (o ?? {}) as Record<string, unknown>;
        return {
          label: String(obj.label ?? ""),
          description: typeof obj.description === "string" ? obj.description : undefined
        };
      });
      return {
        question,
        header: typeof q.header === "string" ? q.header : undefined,
        options,
        multiSelect: q.multiSelect === true
      };
    })
    .filter((x): x is PlanQuestionEntry => x !== null);
}

function priorRevision(timeline: TimelineEvent[]): PlanRevisionMeta | undefined {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const e = timeline[i];
    if (e.kind === "plan_revision" && e.meta) {
      return e.meta as unknown as PlanRevisionMeta;
    }
  }
  return undefined;
}

function latestRevisionId(timeline: TimelineEvent[]): string | undefined {
  return priorRevision(timeline)?.revisionId;
}
