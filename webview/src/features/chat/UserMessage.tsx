import { useMemo, useState } from "react";
import { send } from "../../lib/rpc";
import { Icon } from "../../design/icons";
import { renderMarkdown } from "./markdown";

interface UserMessageProps {
  id: string;
  text: string;
  canRewind?: boolean;
  messagesAfter?: number;
}

/**
 * Splits a user turn into the typed prose and the auto-appended context
 * trailer that the extension produces when there are attachments
 * (`composeUserMessage` writes a `\n\n---\nContext attached:` separator
 * followed by fenced blocks). The trailer renders as proper code chips,
 * the prose stays as plain text so user-typed `**bold**` doesn't surprise.
 */
function splitUserTurn(text: string): { prose: string; context: string | null } {
  const idx = text.indexOf("\n\n---\nContext attached:");
  if (idx === -1) return { prose: text, context: null };
  return { prose: text.slice(0, idx).trimEnd(), context: text.slice(idx).trimStart() };
}

export function UserMessage({ id, text, canRewind, messagesAfter = 0 }: UserMessageProps) {
  const [confirming, setConfirming] = useState(false);
  const { prose, context } = useMemo(() => splitUserTurn(text), [text]);

  const handleConfirm = () => {
    send({ type: "rewindTo", turnId: id });
    setConfirming(false);
  };

  return (
    <div className={`msg msg-user${confirming ? " msg-rewinding" : ""}`}>
      <div className="msg-avatar">Y</div>
      <div className="msg-body">
        {prose && <div className="msg-text">{prose}</div>}
        {context && (
          <div className="msg-context md">
            {renderMarkdown(stripContextHeader(context))}
          </div>
        )}
        {canRewind && !confirming && (
          <button
            type="button"
            className="msg-rewind"
            onClick={() => setConfirming(true)}
            title="Rewind conversation to here"
          >
            <Icon name="history" size={11} />
            Rewind
          </button>
        )}
        {confirming && (
          <div className="rewind-confirm">
            <span className="rewind-confirm-icon">
              <Icon name="history" size={13} />
            </span>
            <span className="rewind-confirm-text">
              {messagesAfter > 0
                ? `Remove ${messagesAfter} message${messagesAfter !== 1 ? "s" : ""} after this and restore files?`
                : "Rewind to here and restore files?"}
            </span>
            <div className="rewind-confirm-actions">
              <button type="button" className="rewind-cancel" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="rewind-ok" onClick={handleConfirm}>
                Rewind
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Drop the leading `---` rule and the "Context attached:" line from the
 * trailer so the renderer doesn't emit a noisy hr + heading. Each
 * attachment in the trailer becomes a bold filename header followed by a
 * fenced block — both markdown-rendered as a clean code-chip stack.
 */
function stripContextHeader(s: string): string {
  return s
    .replace(/^---\s*\n?/, "")
    .replace(/^Context attached:\s*\n?/, "");
}
