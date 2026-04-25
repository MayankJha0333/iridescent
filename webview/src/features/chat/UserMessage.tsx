import { useState } from "react";
import { send } from "../../lib/rpc";
import { Icon } from "../../design/icons";
import { renderMarkdown } from "./markdown";

interface UserMessageProps {
  id: string;
  text: string;
  canRewind?: boolean;
  messagesAfter?: number;
}

export function UserMessage({ id, text, canRewind, messagesAfter = 0 }: UserMessageProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    send({ type: "rewindTo", turnId: id });
    setConfirming(false);
  };

  return (
    <div className={`msg msg-user${confirming ? " msg-rewinding" : ""}`}>
      <div className="msg-avatar">Y</div>
      <div className="msg-body md">
        {renderMarkdown(text)}
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
