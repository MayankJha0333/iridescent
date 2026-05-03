// ─────────────────────────────────────────────────────────────
// ThoughtBlock — collapsible "Thought for Xs" wrapper around the
// model's pre-tool reasoning text. Open by default the first time;
// the user can click to collapse.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon } from "../../design/icons";
import { formatDuration } from "./tool-buckets";
import { renderMarkdown } from "./markdown";

interface ThoughtBlockProps {
  text: string;
  durationMs?: number;
}

export function ThoughtBlock({ text, durationMs }: ThoughtBlockProps) {
  const [open, setOpen] = useState(true);
  if (!text.trim()) return null;
  const label =
    durationMs === undefined ? "Thinking…" : `Thought for ${formatDuration(durationMs)}`;
  return (
    <div className={`thought ${open ? "thought-open" : "thought-closed"}`}>
      <button
        type="button"
        className="thought-head"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="thought-label">{label}</span>
        <span className="thought-chev">
          <Icon name={open ? "chevronD" : "chevronR"} size={10} />
        </span>
      </button>
      {open && (
        <div className="thought-body">{renderMarkdown(text)}</div>
      )}
    </div>
  );
}
