import { motion } from "framer-motion";
import { Icon } from "../../design/icons";
import type { EditorContext } from "../../lib/rpc";

export function ContextStrip({ context }: { context: EditorContext | null }) {
  if (!context) return null;
  const fileName = context.file.split("/").pop() ?? context.file;
  const sel = context.selection;
  return (
    <motion.div
      className="flex flex-wrap gap-1.5 px-3 pt-1.5 pb-1"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
    >
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-[3px] bg-s2 border border-b1 rounded-md text-[11px] text-t1 font-mono"
        title={context.file}
      >
        <Icon name="file" size={12} className="text-t3" />
        <span className="font-semibold text-t1">{fileName}</span>
        <span className="text-t3 text-[10.5px] border-l border-b1 ml-0.5 pl-1.5">
          {context.language}
        </span>
      </span>
      {sel && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-[3px] bg-accent-soft border border-accent-mid rounded-md text-[11px] text-accent-glow font-mono">
          L{sel.startLine}
          {sel.endLine !== sel.startLine && `–${sel.endLine}`}
        </span>
      )}
    </motion.div>
  );
}
