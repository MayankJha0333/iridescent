// ─────────────────────────────────────────────────────────────
// @-mention popover. Listens to the extension's file search RPC
// and shows the matching files inline above the textarea. Handles
// keyboard navigation (↑/↓ to move, ↵ to pick, Esc to dismiss).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { send, onMessage, newId, FileSearchResult } from "../../lib/rpc";
import { Icon } from "../../design/icons";

export interface MentionPopoverProps {
  query: string;
  open: boolean;
  onPick: (result: FileSearchResult) => void;
  onClose: () => void;
}

export function MentionPopover({ query, open, onPick, onClose }: MentionPopoverProps) {
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const requestId = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    const id = newId();
    requestId.current = id;
    const t = setTimeout(() => send({ type: "requestFileSearch", id, query }), 60);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    return onMessage((m) => {
      if (m.type === "fileSearchResults" && m.id === requestId.current) {
        setResults(m.results);
        setActive(0);
      }
    });
  }, [open]);

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="mention-popover absolute left-2 right-2 bottom-full mb-1.5 bg-glass border border-glass-border rounded-[10px] shadow-[0_16px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)_inset] z-50 overflow-hidden"
          style={{
            backdropFilter: "blur(16px) saturate(1.4)",
            WebkitBackdropFilter: "blur(16px) saturate(1.4)"
          }}
          role="listbox"
          aria-label="File suggestions"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-b1 text-t3 text-[11px] font-semibold">
            <Icon name="at" size={11} />
            <span>{query ? `Files matching "${query}"` : "Mention a file"}</span>
            <span className="ml-auto text-t4 text-[10.5px] font-normal">
              ↑↓ navigate · ↵ select · Esc
            </span>
          </div>
          {results.length === 0 ? (
            <div className="px-3 py-3 text-t3 text-[12px]">No matches</div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto py-1">
              {results.map((r, i) => (
                <button
                  key={r.path}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  className={`flex items-center gap-2 w-full px-3 py-1.5 bg-transparent border-0 text-left cursor-pointer font-[inherit] text-[12.5px] text-t1 transition-colors duration-[100ms] ${
                    i === active ? "bg-accent-soft text-accent-glow" : "hover:bg-s3"
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => {
                    e.preventDefault();
                    onPick(r);
                  }}
                >
                  <Icon name="file" size={12} />
                  <span className="font-semibold flex-shrink-0">{r.name}</span>
                  <span className="text-t3 text-[11px] font-mono truncate">
                    {r.path.length > 56 ? "…" + r.path.slice(-55) : r.path}
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
