import { useEffect } from "react";
import { Icon } from "../../design/icons";

interface RewindModalProps {
  messagesAfter: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RewindModal({ messagesAfter, onCancel, onConfirm }: RewindModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div className="modal-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <Icon name="history" size={20} />
        </div>
        <h2 className="modal-title">Rewind conversation?</h2>
        <p className="modal-body">
          {messagesAfter > 0
            ? `This will remove ${messagesAfter} message${messagesAfter !== 1 ? "s" : ""} after this point and restore any files that were changed.`
            : "This will rewind to this point and restore any files that were changed."}
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={onConfirm} autoFocus>
            Rewind
          </button>
        </div>
      </div>
    </div>
  );
}
