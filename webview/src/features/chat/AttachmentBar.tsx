// ─────────────────────────────────────────────────────────────
// Attachment chips. Renders @-mention files and Cmd+L selection
// snippets as visible pills above the textarea. Click to expand
// the inline preview, × to remove.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon, IconName } from "../../design/icons";
import type { Attachment } from "../../lib/rpc";

export interface AttachmentBarProps {
  attachments: ReadonlyArray<Attachment>;
  onRemove: (id: string) => void;
}

export function AttachmentBar({ attachments, onRemove }: AttachmentBarProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="attach-bar" role="list">
      {attachments.map((a) => (
        <AttachmentChip key={a.id} attachment={a} onRemove={() => onRemove(a.id)} />
      ))}
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isSelection = attachment.kind === "selection";
  const icon: IconName = isSelection ? "code" : attachment.kind === "snippet" ? "edit" : "file";

  // Selection chips read as `myflow.py:18–19` so the file + range is
  // immediately scannable; @-file chips use the basename + path subtitle.
  const range =
    isSelection && attachment.startLine !== undefined
      ? attachment.endLine && attachment.endLine !== attachment.startLine
        ? `${attachment.startLine}–${attachment.endLine}`
        : `${attachment.startLine}`
      : null;

  const primary = range ? `${attachment.label}:${range}` : attachment.label;
  const subtitle =
    !isSelection && attachment.path && attachment.path !== attachment.label
      ? attachment.path
      : null;

  return (
    <div
      className={`attach-chip attach-chip-${attachment.kind}${open ? " open" : ""}`}
      role="listitem"
    >
      <button
        type="button"
        className="attach-chip-head"
        onClick={() => setOpen((o) => !o)}
        title={attachment.path ?? attachment.label}
      >
        <Icon name={icon} size={11} />
        <span className="attach-chip-label">{primary}</span>
        {subtitle && <span className="attach-chip-sub">{subtitle}</span>}
        {attachment.text !== undefined && (
          <Icon name={open ? "chevronU" : "chevronD"} size={9} />
        )}
      </button>
      <button
        type="button"
        className="attach-chip-remove"
        onClick={onRemove}
        aria-label={`Remove ${primary}`}
        title="Remove"
      >
        <Icon name="x" size={10} />
      </button>
      {open && attachment.text !== undefined && (
        <pre className="attach-chip-preview" data-lang={attachment.language ?? "text"}>
          {attachment.text}
        </pre>
      )}
    </div>
  );
}
