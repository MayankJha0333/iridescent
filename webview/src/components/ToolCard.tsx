import { useEffect, useState } from "react";

interface Props {
  name: string;
  input: string;
  result?: string;
  isError?: boolean;
  pending?: boolean;
}

export function ToolCard({ name, input, result, isError, pending }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const summary = summarize(name, input);
  const status = pending ? "pending" : isError ? "error" : result ? "ok" : "pending";
  const Icon = toolIcon(name);
  const exitCode = extractExitCode(result);
  const isBash = /bash|run|shell|exec/i.test(name);

  useEffect(() => {
    if (isError) setOpen(true);
  }, [isError]);

  const copyResult = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!result) return;
    const text = isBash ? parseBashResult(result).stdout + (parseBashResult(result).stderr ? "\n" + parseBashResult(result).stderr : "") : result;
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
      <button className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className="tool-icon" aria-hidden>
          <Icon />
        </span>
        <span className="tool-name">{name}</span>
        <span className="tool-summary">{summary}</span>
        {exitCode !== null && (
          <span className={`tool-exit ${exitCode === 0 ? "exit-ok" : "exit-bad"}`}>
            exit {exitCode}
          </span>
        )}
        <span className={`tool-status tool-status-${status}`}>
          {status === "pending" && <span className="spinner" />}
          {status === "ok" && "✓"}
          {status === "error" && "✕"}
        </span>
        <span className="tool-chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="tool-body">
          <Section label="Input">
            <pre className="tool-pre">{pretty(input)}</pre>
          </Section>
          {result !== undefined && (
            isBash
              ? <BashOutput result={result} isError={isError} onCopy={copyResult} copied={copied} />
              : (
                <Section
                  label={isError ? "Error" : "Output"}
                  error={isError}
                  action={
                    <button className="tool-copy" onClick={copyResult}>
                      {copied ? "✓ copied" : "copy"}
                    </button>
                  }
                >
                  <pre className="tool-pre">{truncate(result, 8000)}</pre>
                </Section>
              )
          )}
        </div>
      )}
    </div>
  );
}

interface BashOutputProps {
  result: string;
  isError?: boolean;
  onCopy: (e: React.MouseEvent) => void;
  copied: boolean;
}

function BashOutput({ result, isError, onCopy, copied }: BashOutputProps) {
  const parsed = parseBashResult(result);

  return (
    <>
      {parsed.stdout && parsed.stdout !== "(no output)" && (
        <Section
          label="Output"
          error={false}
          action={
            <button className="tool-copy" onClick={onCopy}>
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
        <Section label="Stderr" error={true}>
          <pre className="tool-pre bash-stderr">{truncate(stripAnsi(parsed.stderr), 4000)}</pre>
        </Section>
      )}
      {isError && parsed.errorMsg && !parsed.stdout && !parsed.stderr && (
        <Section label="Error" error={true}>
          <pre className="tool-pre bash-stderr">{truncate(parsed.errorMsg, 4000)}</pre>
        </Section>
      )}
    </>
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
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="tool-section">
      <div className="tool-section-head">
        <span className={`tool-label ${error ? "err" : ""}`}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function toolIcon(name: string) {
  const n = name.toLowerCase();
  if (/read|view|open/.test(n)) return FileIcon;
  if (/write|edit|create/.test(n)) return EditIcon;
  if (/bash|run|shell|exec/.test(n)) return TerminalIcon;
  if (/grep|search|find|glob/.test(n)) return SearchIcon;
  return GenericIcon;
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
function TerminalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function GenericIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function summarize(name: string, rawInput: string): string {
  try {
    const obj = JSON.parse(rawInput);
    if (/read|write|edit|view/i.test(name))
      return String(obj.path ?? obj.file_path ?? obj.filePath ?? "");
    if (/bash|run/i.test(name)) {
      const cmd = String(obj.command ?? "");
      return cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd;
    }
    if (/grep|search|glob/i.test(name))
      return String(obj.pattern ?? obj.query ?? obj.glob ?? "");
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
  // Error path: starts with "exit N\n"
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
    // No section markers — entire body is error message
    return { stdout: "", stderr: null, errorMsg: body.trim() };
  }

  // Success path: stdout [\n[stderr]\n stderr]
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

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

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
