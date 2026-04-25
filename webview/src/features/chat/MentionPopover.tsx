// ─────────────────────────────────────────────────────────────
// @-mention popover. Listens to the extension's file search RPC
// and shows the matching files inline above the textarea. Handles
// keyboard navigation (↑/↓ to move, ↵ to pick, Esc to dismiss).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { send, onMessage, newId, FileSearchResult } from "../../lib/rpc";
import { Icon } from "../../design/icons";

export interface MentionPopoverProps {
  /** Current query (text after the `@` up to the cursor). */
  query: string;
  open: boolean;
  onPick: (result: FileSearchResult) => void;
  onClose: () => void;
}

export function MentionPopover({ query, open, onPick, onClose }: MentionPopoverProps) {
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const requestId = useRef<string>("");

  // Debounced file search whenever the query changes.
  useEffect(() => {
    if (!open) return;
    const id = newId();
    requestId.current = id;
    const t = setTimeout(() => send({ type: "requestFileSearch", id, query }), 60);
    return () => clearTimeout(t);
  }, [query, open]);

  // Receive search results, clamping the highlight.
  useEffect(() => {
    if (!open) return;
    return onMessage((m) => {
      if (m.type === "fileSearchResults" && m.id === requestId.current) {
        setResults(m.results);
        setActive(0);
      }
    });
  }, [open]);

  // Keyboard navigation when the popover is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (results.length > 0) {
          e.preventDefault();
          onPick(results[active]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, results, active, onPick, onClose]);

  if (!open) return null;

  return (
    <div className="mention-popover" role="listbox" aria-label="File suggestions">
      <div className="mention-popover-head">
        <Icon name="at" size={11} />
        <span>{query ? `Files matching "${query}"` : "Mention a file"}</span>
        <span className="mention-popover-hint">↑↓ navigate · ↵ select · Esc</span>
      </div>
      {results.length === 0 ? (
        <div className="mention-popover-empty">No matches</div>
      ) : (
        <div className="mention-popover-list">
          {results.map((r, i) => (
            <button
              key={r.path}
              role="option"
              aria-selected={i === active}
              type="button"
              className={`mention-popover-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault();
                onPick(r);
              }}
            >
              <Icon name="file" size={12} />
              <span className="mention-popover-name">{r.name}</span>
              <span className="mention-popover-path">
                {r.path.length > 56 ? "…" + r.path.slice(-55) : r.path}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
