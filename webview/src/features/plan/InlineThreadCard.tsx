// ─────────────────────────────────────────────────────────────
// One inline-thread bubble — the actual UI rendered by
// InlineCommentThreads via React portal into a DOM slot
// adjacent to the commented line.
//
// Modes:
//   - default : header + quote + body + action toolbar
//   - editing : body replaced with a textarea + save/cancel
//   - replying: same body, reply textarea below the thread
//
// All mutations dispatch via the rpc layer. The host writes the
// resulting timeline event back, the webview reducer updates,
// and React re-renders this card with the new comment data.
// State here is purely UI-local (which textarea is open,
// what's being typed); nothing about the comment itself lives
// here.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Icon } from "../../design/icons";
import { send } from "../../lib/rpc";
import { formatRelativeTime } from "./summary";
import { truncate } from "./utils";
import type { PlanCommentView } from "./types";

interface Props {
  comment: PlanCommentView;
  pinNumber: number;
  /** When the parent revision is superseded, all controls disable. */
  locked: boolean;
}

export function InlineThreadCard({ comment, pinNumber, locked }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftEdit, setDraftEdit] = useState(comment.body);
  const [replying, setReplying] = useState(false);
  const [draftReply, setDraftReply] = useState("");

  const resolvedAuto = !!comment.resolvedInRevisionId;
  const resolvedManual = !!comment.resolvedAt;
  const resolved = resolvedAuto || resolvedManual;
  const editable = !locked && !resolvedAuto;

  // Re-sync the draft when the comment body changes externally — e.g.
  // the user edited the same comment via the sidebar list. Without this
  // an open inline editor would silently overwrite the sibling change.
  useEffect(() => {
    if (!editing) setDraftEdit(comment.body);
  }, [comment.body, editing]);

  const startEdit = () => {
    if (!editable) return;
    setDraftEdit(comment.body);
    setEditing(true);
    setReplying(false);
  };

  const saveEdit = () => {
    const body = draftEdit.trim();
    if (!body || body === comment.body.trim()) return;
    send({ type: "planEditComment", commentId: comment.commentId, body });
    setEditing(false);
  };

  const submitReply = () => {
    const body = draftReply.trim();
    if (!body || locked) return;
    send({
      type: "planReplyComment",
      revisionId: comment.revisionId,
      parentCommentId: comment.commentId,
      body
    });
    setDraftReply("");
    setReplying(false);
  };

  const toggleResolve = () => {
    if (locked) return;
    send({
      type: resolvedManual ? "planReopenComment" : "planResolveComment",
      commentId: comment.commentId
    });
  };

  const remove = () => {
    if (!editable) return;
    send({ type: "planDeleteComment", commentId: comment.commentId });
  };

  const className = [
    "plan-inline-thread",
    editing && "editing",
    replying && "replying",
    resolved && "resolved"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <header className="plan-inline-thread-head">
        <span className={`plan-inline-thread-pin${resolved ? " resolved" : ""}`}>
          {pinNumber}
        </span>
        <span className="plan-inline-thread-time">
          {comment.editedAt
            ? `edited ${formatRelativeTime(comment.editedAt)}`
            : formatRelativeTime(comment.ts)}
        </span>
        {resolvedAuto && (
          <span className="plan-inline-thread-status">addressed</span>
        )}
        {resolvedManual && !resolvedAuto && (
          <span className="plan-inline-thread-status">resolved</span>
        )}
      </header>

      {comment.quote && (
        <blockquote className="plan-inline-thread-quote" title={comment.quote}>
          {truncate(comment.quote, 200)}
        </blockquote>
      )}

      {!editing ? (
        <div
          className={`plan-inline-thread-body${resolvedManual ? " strike" : ""}`}
          onClick={() => editable && startEdit()}
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
        >
          {comment.body}
        </div>
      ) : (
        <ThreadEditor
          autoFocus
          rows={3}
          value={draftEdit}
          onChange={setDraftEdit}
          onSubmit={saveEdit}
          onCancel={() => {
            setEditing(false);
            setDraftEdit(comment.body);
          }}
          submitLabel="Save"
          submitDisabled={
            !draftEdit.trim() || draftEdit.trim() === comment.body.trim()
          }
        />
      )}

      {comment.replies.length > 0 && (
        <ul className="plan-inline-thread-replies">
          {comment.replies.map((r, i) => (
            <li key={r.eventId} className="plan-inline-thread-reply">
              <span
                className="plan-inline-thread-reply-rail"
                aria-hidden
              >
                {i === comment.replies.length - 1 ? "└" : "├"}
              </span>
              <div className="plan-inline-thread-reply-content">
                <div className="plan-inline-thread-reply-meta">
                  {formatRelativeTime(r.ts)}
                  {r.editedAt ? <span> · edited</span> : null}
                </div>
                <div className="plan-inline-thread-reply-body">{r.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {replying && (
        <ThreadEditor
          autoFocus
          rows={2}
          placeholder="Reply…"
          value={draftReply}
          onChange={setDraftReply}
          onSubmit={submitReply}
          onCancel={() => {
            setReplying(false);
            setDraftReply("");
          }}
          submitLabel="Reply"
          submitDisabled={!draftReply.trim() || locked}
        />
      )}

      {!editing && !replying && (
        <footer className="plan-inline-thread-foot">
          {!locked && (
            <FootBtn
              icon="dots"
              label="Reply"
              onClick={() => setReplying(true)}
            />
          )}
          {!locked && !resolvedAuto && (
            <FootBtn
              icon={resolvedManual ? "refresh" : "check"}
              label={resolvedManual ? "Reopen" : "Resolve"}
              onClick={toggleResolve}
              active={resolvedManual}
            />
          )}
          {editable && (
            <FootBtn icon="edit" label="Edit" onClick={startEdit} />
          )}
          <span className="plan-inline-thread-foot-spacer" />
          {editable && (
            <FootBtn
              icon="x"
              label=""
              onClick={remove}
              tone="danger"
              title="Delete"
            />
          )}
        </footer>
      )}
    </div>
  );
}

// ── Local helper components ──────────────────────────────────

interface ThreadEditorProps {
  autoFocus?: boolean;
  rows: number;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  submitDisabled: boolean;
}

function ThreadEditor({
  autoFocus,
  rows,
  value,
  placeholder,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  submitDisabled
}: ThreadEditorProps) {
  return (
    <div className="plan-inline-thread-edit">
      <textarea
        autoFocus={autoFocus}
        className="plan-inline-thread-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="plan-inline-thread-actions">
        <button type="button" className="plan-btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="plan-btn plan-btn-primary"
          onClick={onSubmit}
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

interface FootBtnProps {
  icon: import("../../design/icons").IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "default" | "danger";
  title?: string;
}

function FootBtn({ icon, label, onClick, active, tone, title }: FootBtnProps) {
  const className = [
    "plan-inline-thread-foot-btn",
    active && "active",
    tone === "danger" && "plan-inline-thread-foot-btn-danger"
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      title={title ?? label}
    >
      <Icon name={icon} size={9} />
      {label && <span>{label}</span>}
    </button>
  );
}
