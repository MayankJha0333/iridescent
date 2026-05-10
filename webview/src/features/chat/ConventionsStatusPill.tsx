// ─────────────────────────────────────────────────────────────
// Status pill — visible in the header when a project conventions
// file (CLAUDE.md / AGENTS.md / etc.) is loaded for the workspace.
// Click opens the file in the editor.
// ─────────────────────────────────────────────────────────────

import { send, ConventionsSource } from "../../lib/rpc";

interface ConventionsStatusPillProps {
  source: ConventionsSource | null;
  path: string | null;
  relativePath: string | null;
}

const LABEL: Record<ConventionsSource, string> = {
  "claude-root": "CLAUDE.md",
  "claude-dotfolder": ".claude/CLAUDE.md",
  agents: "AGENTS.md",
  copilot: "copilot-instructions.md",
  cursor: ".cursorrules",
  cline: ".clinerules"
};

export function ConventionsStatusPill({
  source,
  path,
  relativePath
}: ConventionsStatusPillProps) {
  if (!source || !path) return null;
  const label = LABEL[source];
  const handle = (): void => {
    send({ type: "openConventionsFile", path });
  };
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[11px] font-semibold tracking-[0.1px] tabular-nums whitespace-nowrap font-[inherit] border bg-s2 border-b2 text-t2 cursor-pointer transition-colors duration-[120ms] hover:bg-s1 hover:text-t1"
      onClick={handle}
      title={`Project conventions loaded from ${relativePath ?? path}. Click to open.`}
    >
      <span aria-hidden>📄</span>
      {label}
    </button>
  );
}
