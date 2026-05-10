import { motion } from "framer-motion";
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
    <motion.div
      className="m-auto text-center px-2 pt-4 pb-6 w-full max-w-[460px] flex flex-col items-center"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <Orb size={72} />
      <div className="text-[22px] font-extrabold tracking-[-0.5px] mb-1.5 leading-[1.2] text-t1">
        What are we building?
      </div>
      <div className="text-[13px] text-t3 leading-[1.55] mb-5">
        Mention files with <Kbd>@</Kbd> · pick a mode for the kind of help you need
      </div>
      {GROUPS.map((g) => (
        <section key={g.label} className="w-full mb-3.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.5px] uppercase bg-accent-soft text-accent">
              {g.label}
            </span>
            <div className="flex-1 h-px bg-b1" />
          </div>
          <div className="flex flex-col gap-1.5">
            {g.items.map((s) => (
              <Suggestion key={s.title} item={s} />
            ))}
          </div>
        </section>
      ))}
    </motion.div>
  );
}

function Suggestion({ item }: { item: SuggestionItem }) {
  return (
    <button
      type="button"
      className="group flex items-center gap-3 px-3 py-2.5 rounded-[10px] border border-b1 bg-s1 cursor-pointer text-left font-[inherit] text-t1 transition-all duration-150 hover:border-accent-mid hover:bg-accent-soft hover:translate-x-1"
      onClick={() => send({ type: "prompt", text: item.prompt })}
    >
      <span className="w-[30px] h-[30px] rounded-lg inline-flex items-center justify-center flex-shrink-0 bg-s2 text-accent transition-all duration-150 group-hover:bg-accent group-hover:text-white group-hover:shadow-[0_2px_12px_var(--accent-shadow)]">
        <Icon name={item.icon} size={14} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-t1 block">{item.title}</span>
        <span className="text-[11.5px] text-t3 mt-0.5 block">{item.sub}</span>
      </span>
      <Icon
        name="arrow"
        size={14}
        className="flex-shrink-0 text-t4 transition-all duration-150 group-hover:text-accent group-hover:translate-x-0.5"
      />
    </button>
  );
}
