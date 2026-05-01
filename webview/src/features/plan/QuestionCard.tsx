// ─────────────────────────────────────────────────────────────
// Interactive Question Card. Renders one card per
// AskUserQuestion tool_use; supports radio (single-select),
// multi-select (checkboxes), and a free-text "Other" input.
// On submit we both record the answer in the timeline and feed
// it back to the model as the next user turn.
//
// Once answered the card switches to a read-only summary so
// rewinding back to this point preserves what was chosen.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Icon } from "../../design/icons";
import { send } from "../../lib/rpc";
import type { PlanAnswerMeta, PlanQuestionMeta } from "./types";

interface Props {
  question: PlanQuestionMeta & { eventId: string; ts: number };
  answer?: PlanAnswerMeta & { eventId: string; ts: number };
  /** Disable inputs (locked once a newer revision lands or after answer). */
  locked: boolean;
}

export function QuestionCard({ question, answer, locked }: Props) {
  const [draft, setDraft] = useState<Array<{ choice: string; note?: string }>>(
    () => question.questions.map(() => ({ choice: "" }))
  );

  const isAnswered = !!answer;
  const disabled = isAnswered || locked;
  const allFilled = draft.every((d) => d.choice.trim() !== "");

  const submit = () => {
    if (!allFilled || disabled) return;
    send({
      type: "planAnswer",
      questionId: question.questionId,
      toolUseId: question.toolUseId,
      answers: draft
    });
  };

  return (
    <div className={`plan-question${isAnswered ? " answered" : ""}`}>
      <div className="plan-question-head">
        <Icon name="bolt" size={12} />
        <span className="plan-question-title">
          {isAnswered ? "Answered" : "Needs your input"}
        </span>
      </div>
      <ol className="plan-question-list">
        {question.questions.map((q, i) => {
          const recorded = answer?.answers[i];
          const value = isAnswered ? recorded?.choice ?? "" : draft[i].choice;
          const noteValue = isAnswered ? recorded?.note ?? "" : draft[i].note ?? "";
          return (
            <li key={i} className="plan-question-item">
              <div className="plan-question-prompt">{q.question}</div>
              <div className="plan-question-options">
                {q.options.map((opt) => (
                  <label
                    key={opt.label}
                    className={`plan-question-option${value === opt.label ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`q-${question.questionId}-${i}`}
                      value={opt.label}
                      checked={value === opt.label}
                      disabled={disabled}
                      onChange={() =>
                        setDraft((cur) => cur.map((d, idx) => (idx === i ? { ...d, choice: opt.label } : d)))
                      }
                    />
                    <span className="plan-question-option-body">
                      <span className="plan-question-option-label">{opt.label}</span>
                      {opt.description && (
                        <span className="plan-question-option-desc">{opt.description}</span>
                      )}
                    </span>
                  </label>
                ))}
                <label className={`plan-question-option${value === "__other" ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name={`q-${question.questionId}-${i}`}
                    value="__other"
                    checked={value === "__other"}
                    disabled={disabled}
                    onChange={() =>
                      setDraft((cur) => cur.map((d, idx) => (idx === i ? { ...d, choice: "__other" } : d)))
                    }
                  />
                  <span className="plan-question-option-body">
                    <span className="plan-question-option-label">Other</span>
                    <input
                      type="text"
                      className="plan-question-other"
                      placeholder="Describe in your own words…"
                      disabled={disabled || value !== "__other"}
                      value={noteValue}
                      onChange={(e) =>
                        setDraft((cur) =>
                          cur.map((d, idx) => (idx === i ? { ...d, note: e.target.value } : d))
                        )
                      }
                    />
                  </span>
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      {!isAnswered && (
        <div className="plan-question-actions">
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            onClick={submit}
            disabled={!allFilled || disabled}
          >
            Submit answer
          </button>
        </div>
      )}
      {isAnswered && (
        <div className="plan-question-summary">
          Answer recorded — the agent has continued.
        </div>
      )}
    </div>
  );
}
