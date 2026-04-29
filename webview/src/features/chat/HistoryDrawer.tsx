import { MouseEvent, useEffect, useState } from "react";
import { Icon } from "../../design/icons";
import { send, onMessage, HistoryEntry } from "../../lib/rpc";

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function HistoryDrawer({ open, onClose, onSelect }: HistoryDrawerProps) {
  const [sessions, setSessions] = useState<HistoryEntry[] | null>(null);

  // Subscribe once. Only request when the drawer becomes visible.
  useEffect(() => {
    return onMessage((m) => {
      if (m.type === "historyList") setSessions(m.sessions);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setSessions(null);
    send({ type: "requestHistory" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDelete = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    send({ type: "deleteHistoryEntry", id });
  };

  return (
    <div className="drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2 className="drawer-title">Chat history</h2>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="drawer-body">
          {sessions === null && (
            <p className="drawer-empty">Loading…</p>
          )}
          {sessions !== null && sessions.length === 0 && (
            <p className="drawer-empty">No previous chats yet.</p>
          )}
          {sessions !== null && sessions.length > 0 && (
            <ul className="history-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="history-item"
                    onClick={() => onSelect(s.id)}
                  >
                    <div className="history-item-main">
                      <span className="history-item-title">{s.title}</span>
                      <span className="history-item-meta">
                        {formatRelativeTime(s.updatedAt)} · {s.eventCount} event
                        {s.eventCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="history-item-delete"
                      onClick={(e) => handleDelete(e, s.id)}
                      aria-label="Delete session"
                      title="Delete"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "just now";
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}
