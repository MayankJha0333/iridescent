import { send } from "../../lib/rpc";
import { Icon, IconName } from "../../design/icons";
import { Kbd, Orb } from "../../design/primitives";

interface SuggestionItem {
  icon: IconName;
  title: string;
  sub: string;
  prompt: string;
}

interface SuggestionGroup {
  label: string;
  items: SuggestionItem[];
}

const GROUPS: ReadonlyArray<SuggestionGroup> = [
  {
    label: "Ask",
    items: [
      {
        icon: "book",
        title: "Explain this codebase",
        sub: "Walk through architecture and key symbols",
        prompt: "Explain this codebase"
      },
      {
        icon: "search",
        title: "Find and fix a bug",
        sub: "Search for the issue, then patch it",
        prompt: "Find and fix a bug"
      }
    ]
  },
  {
    label: "Code",
    items: [
      {
        icon: "edit",
        title: "Refactor for clarity",
        sub: "Extract helpers, preserve behavior",
        prompt: "Refactor for clarity"
      },
      {
        icon: "bolt",
        title: "Write tests for the selected file",
        sub: "Match existing test patterns",
        prompt: "Write tests for the selected file"
      }
    ]
  }
];

export function EmptyState() {
  return (
    <div className="empty">
      <Orb size={72} />
      <div className="empty-title">What are we building?</div>
      <div className="empty-sub">
        Mention files with <Kbd>@</Kbd> · pick a mode for the kind of help you need
      </div>
      {GROUPS.map((g) => (
        <section key={g.label} className="empty-section">
          <div className="empty-section-head">
            <span className="empty-section-badge">{g.label}</span>
            <div className="empty-section-line" />
          </div>
          <div className="empty-suggestions">
            {g.items.map((s) => (
              <Suggestion key={s.title} item={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Suggestion({ item }: { item: SuggestionItem }) {
  return (
    <button
      type="button"
      className="suggestion"
      onClick={() => send({ type: "prompt", text: item.prompt, attachments: [] })}
    >
      <span className="suggestion-icon">
        <Icon name={item.icon} size={14} />
      </span>
      <span className="suggestion-body">
        <span className="suggestion-title">{item.title}</span>
        <span className="suggestion-sub">{item.sub}</span>
      </span>
      <Icon name="arrow" size={14} className="suggestion-arrow" />
    </button>
  );
}
