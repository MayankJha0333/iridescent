import { useState } from "react";
import { send } from "../rpc";

interface Props {
  id: string;
  text: string;
  canRewind?: boolean;
  messagesAfter?: number;
}

export function UserMessage({ id, text, canRewind, messagesAfter = 0 }: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    send({ type: "rewindTo", turnId: id });
    setConfirming(false);
  };

  return (
    <div className={`msg msg-user ${confirming ? "msg-rewinding" : ""}`}>
      <div className="msg-avatar">You</div>
      <div className="msg-body">
        <div className="msg-text">{text}</div>
        {canRewind && !confirming && (
          <button
            className="msg-rewind"
            onClick={() => setConfirming(true)}
            title="Rewind conversation to here"
          >
            <RewindIcon />
            Rewind
          </button>
        )}
        {confirming && (
          <div className="rewind-confirm">
            <span className="rewind-confirm-icon">
              <RewindIcon />
            </span>
            <span className="rewind-confirm-text">
              {messagesAfter > 0
                ? `Remove ${messagesAfter} message${messagesAfter !== 1 ? "s" : ""} after this and restore files?`
                : "Rewind to here and restore files?"}
            </span>
            <div className="rewind-confirm-actions">
              <button className="rewind-cancel" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="rewind-ok" onClick={handleConfirm}>
                Rewind
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RewindIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}
