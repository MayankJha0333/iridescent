// ─────────────────────────────────────────────────────────────
// Inline suggestion shown above the chat composer when the task
// classifier picked a task type with a known marketplace skill
// recommendation and that skill isn't installed yet.
// ─────────────────────────────────────────────────────────────

import { send } from "../../lib/rpc";

interface SkillSuggestionProps {
  skillId: string;
  skillName: string;
  reason: string;
  taskType: string;
  onDismiss: () => void;
}

export function SkillSuggestion({
  skillId,
  skillName,
  reason,
  taskType,
  onDismiss
}: SkillSuggestionProps) {
  const handleView = (): void => {
    // Marketplace page deep-link — user reads the skill description then
    // installs from the SkillsPicker via the existing flow.
    send({
      type: "openExternal",
      url: `https://claude-plugins.dev/skills?q=${encodeURIComponent(skillName)}`
    });
    onDismiss();
  };

  return (
    <div className="skill-suggestion" role="status">
      <div className="skill-suggestion-text">
        <span className="skill-suggestion-tag">{taskType}</span>
        Detected — <strong>{skillName}</strong> recommended for {reason}.
      </div>
      <div className="skill-suggestion-actions">
        <button type="button" className="btn-primary" onClick={handleView}>
          View skill
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            send({ type: "dismissSkillSuggestion", skillId });
            onDismiss();
          }}
        >
          Don't suggest again
        </button>
        <button type="button" className="btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
