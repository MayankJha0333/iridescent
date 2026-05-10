// ─────────────────────────────────────────────────────────────
// TurnHeader — small "Worked for Xm Ys" banner shown above each
// assistant turn. Antigravity-style. Click to collapse the entire
// turn body.
// ─────────────────────────────────────────────────────────────

import { Icon } from "../../design/icons";
import { formatDuration } from "./tool-buckets";

interface TurnHeaderProps {
  workedMs?: number;
  collapsed: boolean;
  onToggle: () => void;
}

export function TurnHeader({ workedMs, collapsed, onToggle }: TurnHeaderProps) {
  const label =
    workedMs === undefined ? "Working…" : `Worked for ${formatDuration(workedMs)}`;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-1 py-0.5 mb-0.5 bg-transparent border-0 rounded-[3px] cursor-pointer text-t3 font-[inherit] text-[11px] tracking-[0.1px] transition-colors duration-[120ms] hover:text-t2"
      onClick={onToggle}
    >
      <span>{label}</span>
      <span className="inline-flex opacity-50">
        <Icon name={collapsed ? "chevronR" : "chevronD"} size={10} />
      </span>
    </button>
  );
}
