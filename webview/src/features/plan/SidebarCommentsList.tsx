// ─────────────────────────────────────────────────────────────
// Compact comments list for the PlanModal sidebar. Shows every
// non-deleted comment on the current revision (whole-plan and
// inline-quoted alike) so the user always has a visible record
// of feedback they've added — the Review dropdown alone left
// whole-plan comments invisible after submission.
//
// Each row supports in-place edit: tap to expand into a
// textarea + Save / Cancel / Delete row. Inline-quoted comments
// also expose a "jump to passage" action that scrolls and
// flashes the matching highlight in the rendered markdown.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../design/icons";
import { Chip } from "../../design/primitives";
import { send } from "../../lib/rpc";
import { formatRelativeTime } from "./summary";
import { truncate } from "./utils";
import type { PlanCommentMeta, PlanCommentView } from "./types";

interface SidebarComment extends PlanCommentMeta {
  eventId: string;
  ts: number;
  replies?: PlanCommentView[];
}

interface Props {
  comments: SidebarComment[];
  locked: boolean;
  /** Scroll the highlight matching `commentId` into view + flash it. */
  onJumpToHighlight: (commentId: string) => void;
}

export function SidebarCommentsList({ comments, locked, onJumpToHighlight }: Props) {
  // Inline-anchored comments now render directly inside the document via
  // InlineCommentThreads — show only whole-plan comments here so the
  // sidebar isn't a redundant duplicate. Whole-plan comments don't have
  // a doc anchor, so they need a home.
  const visible = comments.filter((c) => !c.deleted && !c.quote);

  if (visible.length === 0) {
    // Hide the section entirely when there's nothing to show. The header
    // dropdown (Review ▾) is the entry point for adding whole-plan comments.
    return null;
  }

  const ordered = visible;

  return (
    <section className="plan-modal-section">
      <div className="plan-modal-section-head">
        <Icon name="at" size={11} />
        <span>Comments</span>
        <Chip tone="warn">{visible.length}</Chip>
      </div>
      <ul className="plan-comments-list">
        {ordered.map((c) => (
          <CommentRow
            key={c.eventId}
            comment={c}
            locked={locked}
            onJumpToHighlight={onJumpToHighlight}
          />
        ))}
      </ul>
    </section>
  );
}

interface RowProps {
  comment: SidebarComment;
  locked: boolean;
  onJumpToHighlight: (commentId: string) => void;
}

function CommentRow({ comment, locked, onJumpToHighlight }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInline = !!comment.quote;
  const isResolvedAuto = !!comment.resolvedInRevisionId;
  const isResolvedManual = !!comment.resolvedAt;
  const isResolved = isResolvedAuto || isResolvedManual;
  const editable = !locked && !isResolvedAuto;
  const replies = comment.replies ?? [];

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = el.value.length;
        }
      });
    }
  }, [editing]);

  // External edits (e.g. via the doc-highlight popover) refresh our draft
  // when the row isn't actively editing.
  useEffect(() => {
    if (!editing) setDraft(comment.body);
  }, [comment.body, editing]);

  const dirty = draft.trim() !== comment.body.trim();
  const valid = draft.trim().length > 0;

  const save = () => {
    if (!valid || !dirty || !editable) return;
    send({ type: "planEditComment", commentId: comment.commentId, body: draft.trim() });
    setEditing(false);
  };

  const remove = () => {
    if (!editable) return;
    send({ type: "planDeleteComment", commentId: comment.commentId });
  };

  const submitReply = () => {
    const body = replyDraft.trim();
    if (!body || locked) return;
    send({
      type: "planReplyComment",
      revisionId: comment.revisionId,
      parentCommentId: comment.commentId,
      body
    });
    setReplyDraft("");
    setReplyOpen(false);
  };

  const toggleResolve = () => {
    if (locked) return;
    if (isResolvedManual) {
      send({ type: "planReopenComment", commentId: comment.commentId });
    } else {
      send({ type: "planResolveComment", commentId: comment.commentId });
    }
  };

  return (
    <li
      className={`plan-comment-row${isInline ? " inline" : " general"}${
        isResolved ? " resolved" : ""
      }${editing ? " editing" : ""}`}
    >
      <div className="plan-comment-row-head">
        {isInline ? (
          <Chip tone="info">passage</Chip>
        ) : (
          <Chip tone="default">whole-plan</Chip>
        )}
        <span className="plan-comment-row-time">
          {comment.editedAt
            ? `edited ${formatRelativeTime(comment.editedAt)}`
            : formatRelativeTime(comment.ts)}
        </span>
        {isResolvedAuto && <span className="plan-comment-tag">addressed</span>}
        {isResolvedManual && !isResolvedAuto && (
          <span className="plan-comment-tag">resolved</span>
        )}
      </div>

      {comment.quote && (
        <button
          type="button"
          className="plan-comment-row-quote"
          onClick={() => onJumpToHighlight(comment.commentId)}
          title="Jump to passage in plan"
        >
          “{truncate(comment.quote, 100)}”
        </button>
      )}

      {!editing && (
        <div className="plan-comment-row-body" onClick={() => editable && setEditing(true)}>
          {comment.body}
        </div>
      )}

      {editing && (
        <>
          <textarea
            ref={textareaRef}
            className="plan-comment-row-edit"
            value={draft}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setDraft(comment.body);
              }
            }}
          />
          <div className="plan-comment-row-actions">
            <button
              type="button"
              className="plan-hl-delete"
              onClick={remove}
              disabled={!editable}
              title="Delete this comment"
            >
              <Icon name="x" size={10} />
              Delete
            </button>
            <span className="plan-hl-spacer" />
            <button
              type="button"
              className="plan-btn"
              onClick={() => {
                setEditing(false);
                setDraft(comment.body);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="plan-btn plan-btn-primary"
              onClick={save}
              disabled={!valid || !dirty || !editable}
            >
              Save
            </button>
          </div>
        </>
      )}

      {replies.length > 0 && (
        <ul className="plan-comment-row-replies">
          {replies.map((r) => (
            <li key={r.eventId} className="plan-comment-row-reply">
              <div className="plan-comment-row-reply-meta">
                <Icon name="user" size={10} />
                <span>{formatRelativeTime(r.ts)}</span>
                {r.editedAt ? <span>· edited</span> : null}
              </div>
              <div className="plan-comment-row-reply-body">{r.body}</div>
            </li>
          ))}
        </ul>
      )}

      {replyOpen && (
        <div className="plan-comment-row-reply-compose">
          <textarea
            autoFocus
            className="plan-comment-row-edit"
            placeholder="Reply…"
            rows={2}
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submitReply();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setReplyOpen(false);
                setReplyDraft("");
              }
            }}
          />
          <div className="plan-comment-row-actions">
            <span className="plan-hl-spacer" />
            <button
              type="button"
              className="plan-btn"
              onClick={() => {
                setReplyOpen(false);
                setReplyDraft("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="plan-btn plan-btn-primary"
              onClick={submitReply}
              disabled={!replyDraft.trim() || locked}
            >
              Reply
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="plan-comment-row-foot">
          {editable && (
            <button
              type="button"
              className="plan-comment-row-edit-btn"
              onClick={() => setEditing(true)}
            >
              <Icon name="edit" size={10} />
              Edit
            </button>
          )}
          {!locked && (
            <button
              type="button"
              className="plan-comment-row-edit-btn"
              onClick={() => setReplyOpen((v) => !v)}
            >
              <Icon name="dots" size={10} />
              Reply
            </button>
          )}
          {!locked && !isResolvedAuto && (
            <button
              type="button"
              className="plan-comment-row-edit-btn"
              onClick={toggleResolve}
            >
              <Icon name={isResolvedManual ? "refresh" : "check"} size={10} />
              {isResolvedManual ? "Reopen" : "Resolve"}
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="plan-comment-row-delete-btn"
              onClick={remove}
            >
              <Icon name="x" size={10} />
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}

