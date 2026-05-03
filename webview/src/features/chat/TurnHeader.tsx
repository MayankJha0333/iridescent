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
    <button type="button" className="turn-header" onClick={onToggle}>
      <span className="turn-header-label">{label}</span>
      <span className="turn-header-chev">
        <Icon name={collapsed ? "chevronR" : "chevronD"} size={10} />
      </span>
    </button>
  );
}
