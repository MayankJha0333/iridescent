// ─────────────────────────────────────────────────────────────
// ToolGroupCard — collapsible chip wrapping 1+ tool calls of the
// same semantic bucket. Header reads "Read 3 files" or "Ran ls"
// (single-tool groups inline the target into the header so the
// chip is self-explanatory without expanding).
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon } from "../../design/icons";
import { ToolCard } from "./ToolCard";
import { ToolBucket, bucketMeta, bucketSummary } from "./tool-buckets";

export interface ToolGroupItem {
  id: string;
  name: string;
  input: string;
  result?: string;
  isError?: boolean;
}

interface ToolGroupCardProps {
  bucket: ToolBucket;
  items: ToolGroupItem[];
}

export function ToolGroupCard({ bucket, items }: ToolGroupCardProps) {
  const [open, setOpen] = useState(false);
  const meta = bucketMeta(bucket);
  const anyPending = items.some((i) => i.result === undefined && !i.isError);
  const anyError = items.some((i) => i.isError);
  const status = anyPending ? "pending" : anyError ? "error" : "ok";

  // Single-tool groups show the target inline in the header so users don't
  // need to expand to see what one happened. Multi-tool groups show the
  // count and let the user expand for details.
  const single = items.length === 1;
  const headerLabel = single
    ? `${meta.verb} ${shortTarget(items[0])}`
    : bucketSummary(bucket, items.length);

  return (
    <div className={`tool-group tool-group-${status}`}>
      <button
        type="button"
        className="tool-group-head"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tool-group-icon" aria-hidden>
          <Icon name={meta.icon} size={11} />
        </span>
        <span className="tool-group-label">{headerLabel}</span>
        <span className="tool-group-status">
          {status === "pending" && <span className="spinner" />}
          {status === "ok" && <span className="tool-group-ok">✓</span>}
          {status === "error" && <span className="tool-group-err">✕</span>}
        </span>
        <span className="tool-group-chev">
          <Icon name={open ? "chevronD" : "chevronR"} size={10} />
        </span>
      </button>
      {open && (
        <div className="tool-group-body">
          {items.map((it) => (
            <ToolCard
              key={it.id}
              name={it.name}
              input={it.input}
              result={it.result}
              isError={it.isError}
              pending={it.result === undefined && !it.isError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function shortTarget(item: ToolGroupItem): string {
  try {
    const obj = JSON.parse(item.input) as Record<string, unknown>;
    const path = obj.path ?? obj.file_path ?? obj.filePath;
    if (typeof path === "string" && path) return shortenPath(path);
    const cmd = obj.command;
    if (typeof cmd === "string" && cmd) return cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
    const pattern = obj.pattern ?? obj.query;
    if (typeof pattern === "string" && pattern) return pattern;
    const url = obj.url;
    if (typeof url === "string" && url) return url;
  } catch {
    /* fallthrough */
  }
  return item.name;
}

function shortenPath(p: string): string {
  if (p.length <= 50) return p;
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return parts.slice(0, 1).concat(["…"], parts.slice(-2)).join("/");
}
