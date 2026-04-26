// ─────────────────────────────────────────────────────────────
// Tool call row. Collapsed by default — Antigravity-style:
// "<verb> <ext-badge> <path-or-target> <meta> <count?>".
// Expanded view shows raw input and (split) bash stdout / stderr.
// ─────────────────────────────────────────────────────────────

import { ReactNode, MouseEvent, useEffect, useState } from "react";
import { Icon, IconName } from "../../design/icons";

export interface ToolCardProps {
  name: string;
  input: string;
  result?: string;
  isError?: boolean;
  pending?: boolean;
}

type Status = "pending" | "ok" | "error";

export function ToolCard({ name, input, result, isError, pending }: ToolCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const status: Status = pending ? "pending" : isError ? "error" : result !== undefined ? "ok" : "pending";
  const exitCode = extractExitCode(result);
  const isBash = /bash|run|shell|exec/i.test(name);

  useEffect(() => {
    if (isError) setOpen(true);
  }, [isError]);

  const copyResult = async (e: MouseEvent) => {
    e.stopPropagation();
    if (result === undefined) return;
    const parsed = isBash ? parseBashResult(result) : null;
    const text = parsed
      ? parsed.stdout + (parsed.stderr ? "\n" + parsed.stderr : "")
      : result;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const head = describe(name, input, result);

  return (
    <div className={`tool tool-${status}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className="tool-verb">{head.verb}</span>
        {head.badge ? (
          <span
            className={`file-badge file-badge-${head.badge.kind}`}
            style={head.badge.color ? { color: head.badge.color } : undefined}
          >
            {head.badge.kind === "folder" ? (
              <Icon name="folder" size={11} />
            ) : (
              head.badge.label
            )}
          </span>
        ) : (
          <span className="tool-icon" aria-hidden>
            <Icon name={iconFor(name)} size={11} />
          </span>
        )}
        <span className="tool-target">{head.target}</span>
        {head.meta && <span className="tool-meta">{head.meta}</span>}
        {head.count !== undefined && (
          <span className="tool-pill">{head.count} results</span>
        )}
        {exitCode !== null && (
          <span className={`tool-exit ${exitCode === 0 ? "exit-ok" : "exit-bad"}`}>
            exit {exitCode}
          </span>
        )}
        <StatusGlyph status={status} />
        <span className="tool-chev">
          <Icon name={open ? "chevronD" : "chevronR"} size={10} />
        </span>
      </button>
      {open && (
        <div className="tool-body">
          {isBash ? (
            <BashCommand input={input} />
          ) : (
            <Section label="Input">
              <pre className="tool-pre">{pretty(input)}</pre>
            </Section>
          )}
          {result !== undefined &&
            (isBash ? (
              <BashOutput result={result} isError={isError} onCopy={copyResult} copied={copied} />
            ) : (
              <Section
                label={isError ? "Error" : "Output"}
                error={isError}
                action={
                  <button type="button" className="tool-copy" onClick={copyResult}>
                    {copied ? "✓ copied" : "copy"}
                  </button>
                }
              >
                <pre className="tool-pre">{truncate(result, 8000)}</pre>
              </Section>
            ))}
        </div>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: Status }) {
  return (
    <span className={`tool-status tool-status-${status}`}>
      {status === "pending" && <span className="spinner" />}
      {status === "ok" && "✓"}
      {status === "error" && "✕"}
    </span>
  );
}

function Section({
  label,
  error,
  action,
  children
}: {
  label: string;
  error?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="tool-section">
      <div className="tool-section-head">
        <span className={`tool-label${error ? " err" : ""}`}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function BashCommand({ input }: { input: string }) {
  // Try strict JSON first; fall back to a forgiving extractor so streamed /
  // partial JSON (e.g. "{\"command\": \"ls -la") still shows the command
  // instead of just an opening brace.
  const { command, description } = parseBashInput(input);
  if (!command) {
    return (
      <Section label="Input">
        <pre className="tool-pre">{input || "(empty)"}</pre>
      </Section>
    );
  }
  return (
    <Section
      label="Command"
      action={
        description ? <span className="tool-bash-desc">{description}</span> : undefined
      }
    >
      <pre className="tool-pre tool-bash-cmd">{command}</pre>
    </Section>
  );
}

function parseBashInput(raw: string): { command: string; description: string } {
  if (!raw) return { command: "", description: "" };
  try {
    const obj = JSON.parse(raw) as { command?: unknown; description?: unknown };
    return {
      command: typeof obj.command === "string" ? obj.command : "",
      description: typeof obj.description === "string" ? obj.description : ""
    };
  } catch {
    // Best-effort: pull "command" string out of partial JSON.
    const m = raw.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (!m) return { command: "", description: "" };
    let cmd = m[1];
    try {
      cmd = JSON.parse('"' + cmd + '"');
    } catch {
      cmd = cmd.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return { command: cmd, description: "" };
  }
}

interface BashOutputProps {
  result: string;
  isError?: boolean;
  onCopy: (e: MouseEvent) => void;
  copied: boolean;
}

function BashOutput({ result, isError, onCopy, copied }: BashOutputProps) {
  const parsed = parseBashResult(result);
  return (
    <>
      {parsed.stdout && parsed.stdout !== "(no output)" && (
        <Section
          label="Output"
          action={
            <button type="button" className="tool-copy" onClick={onCopy}>
              {copied ? "✓ copied" : "copy"}
            </button>
          }
        >
          <pre className="tool-pre bash-stdout">{truncate(stripAnsi(parsed.stdout), 8000)}</pre>
        </Section>
      )}
      {parsed.stdout === "(no output)" && !parsed.stderr && (
        <Section label="Output">
          <span className="tool-empty">(no output)</span>
        </Section>
      )}
      {parsed.stderr && (
        <Section label="Stderr" error>
          <pre className="tool-pre bash-stderr">{truncate(stripAnsi(parsed.stderr), 4000)}</pre>
        </Section>
      )}
      {isError && parsed.errorMsg && !parsed.stdout && !parsed.stderr && (
        <Section label="Error" error>
          <pre className="tool-pre bash-stderr">{truncate(parsed.errorMsg, 4000)}</pre>
        </Section>
      )}
    </>
  );
}

function iconFor(name: string): IconName {
  const n = name.toLowerCase();
  if (/read|view|open/.test(n)) return "file";
  if (/write|edit|create/.test(n)) return "edit";
  if (/bash|run|shell|exec/.test(n)) return "terminal";
  if (/grep|search|find|glob/.test(n)) return "search";
  return "code";
}

// Antigravity-style row metadata: a leading verb, a file/extension badge,
// and a target string (path, command, or pattern), with optional meta
// (e.g. "#L1-77") and a result count pill.
interface RowDescription {
  verb: string;
  badge: FileBadge | null;
  target: string;
  meta?: string;
  count?: number;
}

interface FileBadge {
  kind: "ext" | "folder";
  label: string;
  color?: string;
}

function describe(name: string, rawInput: string, result?: string): RowDescription {
  const n = name.toLowerCase();
  const obj = safeParse(rawInput);

  if (/bash|run|shell|exec/.test(n)) {
    const cmd = String(obj?.command ?? "").trim();
    return { verb: "Ran", badge: null, target: cmd || "(no command)" };
  }

  if (/grep|search|find/.test(n)) {
    const pattern = String(obj?.pattern ?? obj?.query ?? "");
    const path = obj?.path ? String(obj.path) : "";
    const count = parseSearchCount(result);
    return {
      verb: "Searched",
      badge: null,
      target: pattern || path || "(no pattern)",
      meta: path && pattern ? homeShort(path) : undefined,
      count
    };
  }

  if (/glob/.test(n)) {
    const pattern = String(obj?.pattern ?? obj?.glob ?? "");
    return {
      verb: "Globbed",
      badge: null,
      target: pattern || "(no pattern)",
      count: parseSearchCount(result)
    };
  }

  if (/^todowrite$|todo/i.test(name)) {
    const todos = Array.isArray(obj?.todos) ? obj.todos : [];
    return {
      verb: "Updated",
      badge: null,
      target: "todos",
      meta: todos.length ? `${todos.length} item${todos.length === 1 ? "" : "s"}` : undefined
    };
  }

  if (/^ls$|listdir|list_dir/.test(n)) {
    const path = String(obj?.path ?? "");
    return {
      verb: "Analyzed",
      badge: { kind: "folder", label: "" },
      target: homeShort(path) || "(folder)"
    };
  }

  if (/read|view|open|cat/.test(n)) {
    const path = String(obj?.path ?? obj?.file_path ?? obj?.filePath ?? "");
    const start = Number(obj?.offset ?? obj?.start_line ?? obj?.startLine);
    const limit = Number(obj?.limit ?? obj?.lines);
    const meta = lineRange(start, limit);
    return { verb: "Analyzed", badge: badgeForPath(path), target: homeShort(path), meta };
  }

  if (/write|create/.test(n)) {
    const path = String(obj?.path ?? obj?.file_path ?? obj?.filePath ?? "");
    return { verb: "Wrote", badge: badgeForPath(path), target: homeShort(path) };
  }

  if (/edit|replace|patch/.test(n)) {
    const path = String(obj?.path ?? obj?.file_path ?? obj?.filePath ?? "");
    return { verb: "Edited", badge: badgeForPath(path), target: homeShort(path) };
  }

  // Generic fallback: just show the tool name + first input value.
  const firstStr =
    obj && typeof obj === "object"
      ? String(Object.values(obj).find((v) => typeof v === "string") ?? "")
      : "";
  return { verb: name, badge: null, target: firstStr };
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// `/Users/apple/OpenSource/foo` → `~/OpenSource/foo`. Macs and Linux only;
// Windows paths are left alone.
function homeShort(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, "~");
}

function lineRange(start: number, limit: number): string | undefined {
  if (!Number.isFinite(start) && !Number.isFinite(limit)) return undefined;
  const a = Number.isFinite(start) ? start : 1;
  const b = Number.isFinite(limit) ? a + limit - 1 : undefined;
  return b ? `#L${a}-${b}` : `#L${a}`;
}

function parseSearchCount(result?: string): number | undefined {
  if (!result) return undefined;
  const lines = result.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0 || lines.length > 5000) return undefined;
  return lines.length;
}

const EXT_COLORS: Record<string, string> = {
  ts: "#3b82f6", tsx: "#3b82f6",
  js: "#eab308", jsx: "#eab308",
  py: "#22c55e",
  rs: "#f97316",
  go: "#06b6d4",
  json: "#eab308",
  md: "#60a5fa",
  css: "#ec4899",
  html: "#ef4444",
  c: "#60a5fa", h: "#60a5fa", cpp: "#60a5fa", hpp: "#60a5fa",
  java: "#f97316",
  rb: "#ef4444",
  sh: "#a3a3a3",
  yml: "#a3a3a3", yaml: "#a3a3a3",
  toml: "#a3a3a3",
  sql: "#06b6d4"
};

function badgeForPath(path: string): FileBadge | null {
  if (!path) return null;
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return { kind: "ext", label: "···" };
  const ext = m[1].toLowerCase();
  return {
    kind: "ext",
    label: ext.length > 4 ? ext.slice(0, 4).toUpperCase() : ext.toUpperCase(),
    color: EXT_COLORS[ext]
  };
}

function extractExitCode(result?: string): number | null {
  if (!result) return null;
  const m = result.match(/^exit\s+(-?\d+)\n/);
  return m ? parseInt(m[1], 10) : null;
}

interface ParsedBash {
  stdout: string;
  stderr: string | null;
  errorMsg: string | null;
}

function parseBashResult(result: string): ParsedBash {
  const exitMatch = result.match(/^exit\s+(-?\d+)\n/);
  if (exitMatch) {
    const body = result.slice(exitMatch[0].length);
    const stdoutTag = "[stdout]\n";
    const stderrTag = "[stderr]\n";
    const siStdout = body.indexOf(stdoutTag);
    const siStderr = body.indexOf(stderrTag);

    if (siStdout !== -1 || siStderr !== -1) {
      let stdout = "";
      let stderr: string | null = null;
      if (siStdout !== -1) {
        const start = siStdout + stdoutTag.length;
        const end = siStderr !== -1 && siStderr > siStdout ? siStderr : body.length;
        stdout = body.slice(start, end).trimEnd();
      }
      if (siStderr !== -1) {
        const start = siStderr + stderrTag.length;
        const end = siStdout !== -1 && siStdout > siStderr ? siStdout : body.length;
        stderr = body.slice(start, end).trimEnd();
      }
      return { stdout, stderr, errorMsg: null };
    }
    return { stdout: "", stderr: null, errorMsg: body.trim() };
  }

  const stderrSep = "\n[stderr]\n";
  const idx = result.indexOf(stderrSep);
  if (idx !== -1) {
    return {
      stdout: result.slice(0, idx).trimEnd(),
      stderr: result.slice(idx + stderrSep.length).trimEnd(),
      errorMsg: null
    };
  }
  return { stdout: result, stderr: null, errorMsg: null };
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[mGKHFJsu]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[()][AB012]|\r/g;
const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s;
}
