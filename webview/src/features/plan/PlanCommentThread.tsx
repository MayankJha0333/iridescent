// ─────────────────────────────────────────────────────────────
// Flat (non-nested) comment thread anchored to a single task in
// a plan revision. Renders existing comments + a textarea for
// adding another. The "Update plan" button lives on PlanCard,
// not here — comments accumulate locally and are bundled on
// resubmit.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon } from "../../design/icons";
import { send } from "../../lib/rpc";
import type { PlanCommentMeta } from "./types";

interface Props {
  revisionId: string;
  taskId: string;
  comments: Array<PlanCommentMeta & { eventId: string; ts: number }>;
  /** Locked once the revision has been superseded — read-only mode. */
  locked: boolean;
}

export function PlanCommentThread({ revisionId, taskId, comments, locked }: Props) {
  const [draft, setDraft] = useState("");
  const own = comments.filter((c) => c.taskId === taskId);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    send({ type: "planComment", revisionId, taskId, body });
    setDraft("");
  };

  return (
    <div className="plan-thread">
      {own.length > 0 && (
        <ul className="plan-thread-list">
          {own.map((c) => (
            <li key={c.eventId} className={c.resolvedInRevisionId ? "plan-comment resolved" : "plan-comment"}>
              <div className="plan-comment-meta">
                <Icon name="user" size={11} />
                <span className="plan-comment-time">{formatTime(c.ts)}</span>
                {c.resolvedInRevisionId && (
                  <span className="plan-comment-tag">addressed</span>
                )}
              </div>
              <div className="plan-comment-body">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <div className="plan-thread-compose">
          <textarea
            className="plan-thread-input"
            placeholder="Add a comment on this step…"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            className="plan-thread-submit"
            onClick={submit}
            disabled={!draft.trim()}
          >
            Comment
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
