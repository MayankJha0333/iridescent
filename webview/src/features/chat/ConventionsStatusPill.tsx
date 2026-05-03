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
      className="chip chip-conventions"
      onClick={handle}
      title={`Project conventions loaded from ${relativePath ?? path}. Click to open.`}
    >
      <span aria-hidden>📄</span>
      {label}
    </button>
  );
}
