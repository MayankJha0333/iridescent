// ─────────────────────────────────────────────────────────────
// Task tree for a plan revision. Flat list (CLI's TodoWrite is
// not nested), but each row gets an expandable comment thread.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon, IconName } from "../../design/icons";
import { Chip } from "../../design/primitives";
import { PlanCommentThread } from "./PlanCommentThread";
import type { PlanCommentMeta, PlanTask } from "./types";

interface Props {
  revisionId: string;
  tasks: PlanTask[];
  comments: Array<PlanCommentMeta & { eventId: string; ts: number }>;
  locked: boolean;
}

export function PlanTaskTree({ revisionId, tasks, comments, locked }: Props) {
  if (tasks.length === 0) {
    return <div className="plan-tasks-empty">No tasks defined in this revision.</div>;
  }

  return (
    <ol className="plan-tasks">
      {tasks.map((t, i) => (
        <PlanTaskRow
          key={t.id}
          index={i + 1}
          task={t}
          revisionId={revisionId}
          comments={comments}
          locked={locked}
        />
      ))}
    </ol>
  );
}

interface RowProps {
  index: number;
  task: PlanTask;
  revisionId: string;
  comments: Props["comments"];
  locked: boolean;
}

function PlanTaskRow({ index, task, revisionId, comments, locked }: RowProps) {
  const [open, setOpen] = useState(false);
  const taskComments = comments.filter((c) => c.taskId === task.id);
  const hasComments = taskComments.length > 0;
  const status = task.status;

  return (
    <li className={`plan-task plan-task-${status}`}>
      <div className="plan-task-row">
        <span className={`plan-task-glyph plan-task-glyph-${status}`} aria-hidden>
          <Icon name={statusIcon(status)} size={11} />
        </span>
        <span className="plan-task-index">{index}.</span>
        <span className="plan-task-content">
          {status === "in_progress" ? task.activeForm : task.content}
        </span>
        <Chip tone={statusTone(status)}>{statusLabel(status)}</Chip>
        <button
          type="button"
          className={`plan-task-comment-btn${hasComments ? " has-comments" : ""}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={hasComments ? `${taskComments.length} comment(s)` : "Add a comment"}
        >
          <Icon name="at" size={11} />
          {hasComments && <span className="plan-task-comment-count">{taskComments.length}</span>}
        </button>
      </div>
      {open && (
        <PlanCommentThread
          revisionId={revisionId}
          taskId={task.id}
          comments={taskComments}
          locked={locked}
        />
      )}
    </li>
  );
}

function statusIcon(s: PlanTask["status"]): IconName {
  if (s === "completed") return "check";
  if (s === "in_progress") return "bolt";
  return "dots";
}

function statusTone(s: PlanTask["status"]) {
  if (s === "completed") return "success" as const;
  if (s === "in_progress") return "accent" as const;
  return "default" as const;
}

function statusLabel(s: PlanTask["status"]): string {
  if (s === "completed") return "done";
  if (s === "in_progress") return "active";
  return "pending";
}
