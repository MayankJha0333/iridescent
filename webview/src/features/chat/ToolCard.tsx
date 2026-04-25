// ─────────────────────────────────────────────────────────────
// Tool call card. Collapsed by default — header shows name + a
// short summary derived from the JSON input. Expanded view shows
// raw input and (split) bash stdout / stderr.
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
  const summary = summarize(name, input);
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

  return (
    <div className={`tool tool-${status}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className="tool-icon" aria-hidden>
          <Icon name={iconFor(name)} size={12} />
        </span>
        <span className="tool-name">{name}</span>
        <span className="tool-summary">{summary}</span>
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
          <Section label="Input">
            <pre className="tool-pre">{pretty(input)}</pre>
          </Section>
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

function summarize(name: string, rawInput: string): string {
  try {
    const obj = JSON.parse(rawInput) as Record<string, unknown>;
    if (/read|write|edit|view/i.test(name)) {
      return String(obj.path ?? obj.file_path ?? obj.filePath ?? "");
    }
    if (/bash|run/i.test(name)) {
      const cmd = String(obj.command ?? "");
      return cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd;
    }
    if (/grep|search|glob/i.test(name)) {
      return String(obj.pattern ?? obj.query ?? obj.glob ?? "");
    }
    const first = Object.values(obj)[0];
    return typeof first === "string"
      ? first.length > 100
        ? first.slice(0, 100) + "…"
        : first
      : "";
  } catch {
    return rawInput.length > 100 ? rawInput.slice(0, 100) + "…" : rawInput;
  }
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
