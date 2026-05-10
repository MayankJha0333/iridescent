// ─────────────────────────────────────────────────────────────
// ThoughtBlock — collapsible "Thought for Xs" wrapper around the
// model's pre-tool reasoning text. Open by default the first time;
// the user can click to collapse.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
    <div className="bg-transparent border-0">
      <button
        type="button"
        className="inline-flex items-center gap-1 px-1 py-0.5 bg-transparent border-0 cursor-pointer text-t3 font-[inherit] text-[11px] tracking-[0.1px] transition-colors duration-[120ms] hover:text-t2"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <span className="inline-flex opacity-50">
          <Icon name={open ? "chevronD" : "chevronR"} size={10} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="px-1 pl-4 pt-1 pb-1.5 text-t2 text-[12.5px] leading-[1.5] border-l border-b1 ml-1.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {renderMarkdown(text)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
