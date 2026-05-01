// ─────────────────────────────────────────────────────────────
// Compact Plan Card — the chat-stream representation of a plan
// revision. Shows only the title and a short prose preview plus
// "Proceed" and "Open" actions. Clicking "Open" mounts a
// PlanFullView with the full markdown, task tree, comments, and
// question cards. Clicking "Proceed" sends an approval prompt
// so the agent moves out of plan mode and starts executing.
//
// All persistent state (comments, answers, revisions, rewind
// anchors) lives in the timeline events; this component is a
// pure projection of the matching PlanRevisionView.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Icon } from "../../design/icons";
import { Chip } from "../../design/primitives";
import { send } from "../../lib/rpc";
import { unresolvedComments } from "./foldPlanState";
import { extractPlanSummary } from "./summary";
import type { PlanRevisionView } from "./types";

interface Props {
  view: PlanRevisionView;
  /** The previous revision in chronological order, used for diffing. */
  previous?: PlanRevisionView;
  /** This is the latest revision — input controls are live. */
  isLatest: boolean;
  /** Index in the revision list, 1-based. */
  ordinal: number;
}

export function PlanCard({ view, isLatest, ordinal }: Props) {
  const summary = useMemo(() => extractPlanSummary(view.meta.body), [view.meta.body]);
  const pending = unresolvedComments(view).length;
  const branched = !!view.meta.parentRevisionId;
  const taskCount = view.meta.tasks.length;
  const completed = view.meta.tasks.filter((t) => t.status === "completed").length;

  const proceed = () => {
    send({
      type: "prompt",
      text: "Plan approved — proceed with the implementation."
    });
  };

  const openInEditor = () => {
    // Open as a real editor tab — the artifact view lives in the main
    // editor area, not inline in the chat. Matches the Antigravity feel
    // where the plan is a first-class document the user navigates.
    send({ type: "planOpenInEditor", revisionId: view.meta.revisionId });
  };

  return (
    <div className={`plan-mini${!isLatest ? " locked" : ""}${branched ? " branched" : ""}`}>
      <div className="plan-mini-head">
        <span className="plan-mini-icon" aria-hidden>
          <Icon name="file" size={14} />
        </span>
        <span className="plan-mini-title">{summary.title}</span>
        {ordinal > 1 && (
          <Chip tone="info" title="Plan revision">
            rev {ordinal}
          </Chip>
        )}
        {branched && (
          <Chip tone="info" title="Branched after a rewind">
            branched
          </Chip>
        )}
        {!isLatest && <Chip tone="default">superseded</Chip>}
      </div>

      <p className="plan-mini-preview">{summary.preview}</p>

      {(taskCount > 0 || pending > 0) && (
        <div className="plan-mini-meta">
          {taskCount > 0 && (
            <span className="plan-mini-stat">
              <Icon name="check" size={10} />
              {completed}/{taskCount} task{taskCount !== 1 ? "s" : ""}
            </span>
          )}
          {pending > 0 && (
            <span className="plan-mini-stat plan-mini-stat-warn">
              <Icon name="at" size={10} />
              {pending} unresolved comment{pending !== 1 ? "s" : ""}
            </span>
          )}
          {view.questions.length > view.answers.length && (
            <span className="plan-mini-stat plan-mini-stat-accent">
              <Icon name="bolt" size={10} />
              needs answer
            </span>
          )}
        </div>
      )}

      <div className="plan-mini-actions">
        <button
          type="button"
          className="plan-btn plan-btn-success"
          onClick={proceed}
          disabled={!isLatest}
        >
          Proceed
        </button>
        <button type="button" className="plan-btn" onClick={openInEditor}>
          <Icon name="arrow" size={11} />
          Open in editor
        </button>
      </div>
    </div>
  );
}
