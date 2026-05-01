// ─────────────────────────────────────────────────────────────
// One plan step rendered as a self-contained card. The same
// component handles three visual densities controlled by `mode`:
//
//   "active"    — the step the agent is currently waiting on.
//                 Full controls: Open file ↗, Skip, Modify, Accept.
//   "completed" — read-only summary for steps already accepted /
//                 completed. Tasks tree shows them collapsed.
//   "upcoming"  — preview-only with reduced opacity; clicking
//                 "Open file" still works so the user can sneak
//                 ahead and read the source.
//
// File refs are rendered as clickable chips that fire
// planOpenFileRef → vscode.window.showTextDocument on the
// extension host. Comments tied to this step (taskId === task.id)
// surface as a count chip on the row; clicking it doesn't open
// the modal popover — that lives in the editor decorations and
// the chat-side comments list.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon, IconName } from "../../design/icons";
import { Chip } from "../../design/primitives";
import { send } from "../../lib/rpc";
import type { PlanCommentMeta, PlanTask, PlanTaskFileRef } from "./types";

interface Props {
  task: PlanTask;
  index: number;
  total: number;
  revisionId: string;
  mode: "active" | "completed" | "upcoming";
  /** All comments on this revision (used to show a count for this task). */
  comments: PlanCommentMeta[];
  /** Disable controls when the revision is superseded. */
  locked: boolean;
}

export function PlanStepCard({
  task,
  index,
  total,
  revisionId,
  mode,
  comments,
  locked
}: Props) {
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyDraft, setModifyDraft] = useState("");

  const stepComments = comments.filter((c) => c.taskId === task.id && !c.deleted);
  const status = task.status;
  const fileRefs = task.fileRefs ?? [];

  const accept = () => {
    if (locked || mode !== "active") return;
    send({ type: "planAcceptStep", revisionId, taskId: task.id });
  };
  const skip = () => {
    if (locked || mode !== "active") return;
    send({ type: "planSkipStep", revisionId, taskId: task.id });
  };
  const submitModify = () => {
    const instr = modifyDraft.trim();
    if (!instr || locked || mode !== "active") return;
    send({ type: "planModifyStep", revisionId, taskId: task.id, instruction: instr });
    setModifyDraft("");
    setModifyOpen(false);
  };

  return (
    <div className={`plan-step plan-step-${mode} plan-step-status-${status}`}>
      <div className="plan-step-row">
        <span className={`plan-step-glyph plan-step-glyph-${status}`} aria-hidden>
          <Icon name={statusIcon(status)} size={11} />
        </span>
        <span className="plan-step-num">
          Step {index + 1}/{total}
        </span>
        <span className="plan-step-status-chip">
          <Chip tone={statusTone(status)}>{statusLabel(status)}</Chip>
        </span>
        {stepComments.length > 0 && (
          <span className="plan-step-comments-chip" title="Comments on this step">
            <Icon name="at" size={10} />
            {stepComments.length}
          </span>
        )}
      </div>

      <div className="plan-step-content">
        {mode === "completed" && status === "in_progress" ? task.activeForm : task.content}
      </div>

      {fileRefs.length > 0 && (
        <div className="plan-step-files">
          {fileRefs.map((ref, i) => (
            <FileRefChip key={`${ref.path}:${ref.startLine}:${i}`} ref={ref} />
          ))}
        </div>
      )}

      {mode === "active" && !locked && (
        <>
          {modifyOpen ? (
            <div className="plan-step-modify">
              <textarea
                autoFocus
                className="plan-step-modify-input"
                rows={3}
                placeholder="What should change about this step?"
                value={modifyDraft}
                onChange={(e) => setModifyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    submitModify();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setModifyOpen(false);
                    setModifyDraft("");
                  }
                }}
              />
              <div className="plan-step-modify-actions">
                <button
                  type="button"
                  className="plan-btn"
                  onClick={() => {
                    setModifyOpen(false);
                    setModifyDraft("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="plan-btn plan-btn-primary"
                  onClick={submitModify}
                  disabled={!modifyDraft.trim()}
                >
                  Submit modification
                </button>
              </div>
            </div>
          ) : (
            <div className="plan-step-actions">
              <button
                type="button"
                className="plan-step-action plan-step-action-skip"
                onClick={skip}
                title="Skip this step (don't execute it)"
              >
                <Icon name="x" size={10} />
                Skip
              </button>
              <button
                type="button"
                className="plan-step-action plan-step-action-modify"
                onClick={() => setModifyOpen(true)}
                title="Suggest a change to this step"
              >
                <Icon name="edit" size={10} />
                Modify
              </button>
              <span className="plan-step-action-spacer" />
              <button
                type="button"
                className="plan-step-action plan-step-action-accept"
                onClick={accept}
                title="Approve and execute this step"
              >
                <Icon name="check" size={10} />
                Accept &amp; continue
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FileRefChip({ ref }: { ref: PlanTaskFileRef }) {
  const label = ref.label || ref.path;
  const range =
    ref.startLine === ref.endLine ? `:${ref.startLine}` : `:${ref.startLine}-${ref.endLine}`;
  return (
    <button
      type="button"
      className="plan-step-file"
      title={`Open ${ref.path}${range}`}
      onClick={() =>
        send({
          type: "planOpenFileRef",
          path: ref.path,
          startLine: ref.startLine,
          endLine: ref.endLine
        })
      }
    >
      <Icon name="file" size={10} />
      <span className="plan-step-file-label">{label}</span>
      {ref.startLine !== 1 || ref.endLine !== 1 ? (
        <span className="plan-step-file-range">{range}</span>
      ) : null}
    </button>
  );
}

function statusIcon(s: PlanTask["status"]): IconName {
  switch (s) {
    case "completed":
      return "check";
    case "accepted":
      return "check";
    case "in_progress":
      return "bolt";
    case "skipped":
      return "x";
    default:
      return "dots";
  }
}

function statusTone(s: PlanTask["status"]) {
  switch (s) {
    case "completed":
    case "accepted":
      return "success" as const;
    case "in_progress":
      return "accent" as const;
    case "skipped":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function statusLabel(s: PlanTask["status"]): string {
  switch (s) {
    case "completed":
      return "done";
    case "accepted":
      return "accepted";
    case "in_progress":
      return "running";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}
