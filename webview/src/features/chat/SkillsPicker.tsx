// ─────────────────────────────────────────────────────────────
// Skills picker. Surfaces the connected provider's tools/skills
// (Read/Write/Bash/Glob/Grep/WebFetch/Task/MCP/…) and shows their
// enabled state. Toggleable skills (added from the marketplace)
// can be flipped on/off; built-in tools are read-only.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, IconName } from "../../design/icons";
import { send, SkillInfo } from "../../lib/rpc";
import { SkillsMarketplace, MarketplaceSkill } from "./SkillsMarketplace";

const ADDED_KEY = "iridescent.addedSkills.v1";

interface AddedSkill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  publisher: string;
}

function loadAdded(): AddedSkill[] {
  try {
    const raw = localStorage.getItem(ADDED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddedSkill[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAdded(skills: AddedSkill[]) {
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify(skills));
  } catch {
    /* webview storage might be sandboxed — ignore */
  }
}

export interface SkillsPickerProps {
  skills: ReadonlyArray<SkillInfo>;
}

export function SkillsPicker({ skills }: SkillsPickerProps) {
  const [open, setOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [added, setAdded] = useState<AddedSkill[]>(() => loadAdded());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !marketOpen) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, marketOpen]);

  useEffect(() => {
    saveAdded(added);
  }, [added]);

  const installSkill = (skill: MarketplaceSkill) => {
    setAdded((prev) =>
      prev.some((s) => s.id === skill.id)
        ? prev
        : [
            ...prev,
            {
              id: skill.id,
              name: skill.name,
              description: skill.description,
              publisher: skill.publisher,
              enabled: true
            }
          ]
    );
  };

  const removeSkill = (id: string) => {
    setAdded((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleSkill = (id: string) => {
    setAdded((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  // Count enabled across every category we surface — extension-provided
  // (built-ins, CLI, discovered, integrations) honor their own `enabled`
  // flag, marketplace adds carry their own boolean.
  const enabledExtras = added.filter((s) => s.enabled).length;
  const enabledExtension = skills.filter((s) => s.enabled).length;
  const totalEnabled = enabledExtras + enabledExtension;
  const totalCount = skills.length + added.length;

  const grouped = useMemo(
    () => ({
      tool: skills.filter((s) => s.category === "tool"),
      // CLI-native skills (Glob/Grep/Edit/WebFetch/Task) carry external=true
      // but no `source`. Filesystem-discovered skills (~/.claude/skills,
      // <ws>/.claude/skills) carry `source` so we can split them out.
      cli: skills.filter((s) => s.category === "skill" && !s.source),
      user: skills.filter((s) => s.source === "user"),
      project: skills.filter((s) => s.source === "project"),
      integration: skills.filter((s) => s.category === "integration")
    }),
    [skills]
  );

  const installedIds = useMemo(() => new Set(added.map((s) => s.id)), [added]);

  return (
    <>
      <div className="picker skills-picker" ref={ref}>
        <button
          type="button"
          className="cmp-skills"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={`${totalEnabled} of ${totalCount} skills enabled`}
        >
          <Icon name="bolt" size={11} />
          <span>Skills</span>
          <span className="cmp-skills-count">
            {totalEnabled}/{totalCount}
          </span>
          <Icon name="chevronD" size={9} />
        </button>

        {open && (
          <div className="dropdown dropdown-left dropdown-above skills-dropdown" role="dialog">
            <div className="skills-head">
              <span className="skills-title">Skills</span>
              <span className="skills-sub">
                Tools and capabilities Iridescent can use this session.
              </span>
            </div>

            <div className="skills-scroll">
              {grouped.tool.length > 0 && (
                <SkillSection title="Built-in tools">
                  {grouped.tool.map((s) => (
                    <SkillRow key={s.id} skill={s} />
                  ))}
                </SkillSection>
              )}
              {grouped.cli.length > 0 && (
                <SkillSection title="Claude Code agent">
                  {grouped.cli.map((s) => (
                    <SkillRow key={s.id} skill={s} />
                  ))}
                </SkillSection>
              )}
              {grouped.project.length > 0 && (
                <SkillSection title="Project skills">
                  {grouped.project.map((s) => (
                    <DiscoveredRow key={s.id} skill={s} />
                  ))}
                </SkillSection>
              )}
              {grouped.user.length > 0 && (
                <SkillSection title="Your skills">
                  {grouped.user.map((s) => (
                    <DiscoveredRow key={s.id} skill={s} />
                  ))}
                </SkillSection>
              )}
              {added.length > 0 && (
                <SkillSection title="Added from marketplace">
                  {added.map((s) => (
                    <ToggleableRow
                      key={s.id}
                      skill={s}
                      onToggle={() => toggleSkill(s.id)}
                      onRemove={() => removeSkill(s.id)}
                    />
                  ))}
                </SkillSection>
              )}
              {grouped.integration.length > 0 && added.length === 0 && (
                <SkillSection title="Integrations">
                  {grouped.integration.map((s) => (
                    <SkillRow key={s.id} skill={s} />
                  ))}
                </SkillSection>
              )}
            </div>

            <div className="skills-foot">
              <button
                type="button"
                className="skills-add-btn"
                onClick={() => setMarketOpen(true)}
              >
                <Icon name="plus" size={11} />
                Add skills
              </button>
              <span className="skills-foot-hint">{totalEnabled} enabled</span>
            </div>
          </div>
        )}
      </div>

      <SkillsMarketplace
        open={marketOpen}
        installed={installedIds}
        onClose={() => setMarketOpen(false)}
        onInstall={installSkill}
      />
    </>
  );
}

function SkillSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="skills-section">
      <div className="skills-section-title">{title}</div>
      <div className="skills-list">{children}</div>
    </div>
  );
}

function SkillRow({ skill }: { skill: SkillInfo }) {
  const icon = iconFor(skill.id);
  return (
    <div className={`skill-row${skill.enabled ? " enabled" : ""}`}>
      <span className="skill-row-icon">
        <Icon name={icon} size={12} />
      </span>
      <div className="skill-row-body">
        <div className="skill-row-name">
          {skill.name}
          {skill.external && <span className="skill-row-tag">CLI</span>}
        </div>
        <div className="skill-row-desc">{skill.description}</div>
      </div>
      <span className={`skill-row-state${skill.enabled ? " on" : ""}`}>
        {skill.enabled ? <Icon name="check" size={11} /> : <Icon name="x" size={11} />}
      </span>
    </div>
  );
}

/**
 * Filesystem-discovered skill row — Read-only metadata (name, description,
 * source tag) plus a Switch that flips enabled state via the setSkillEnabled
 * RPC. No remove button: the user manages the underlying SKILL.md file
 * outside the extension.
 */
function DiscoveredRow({ skill }: { skill: SkillInfo }) {
  const icon = iconFor(skill.id);
  return (
    <div className={`skill-row toggleable${skill.enabled ? " enabled" : ""}`}>
      <span className="skill-row-icon">
        <Icon name={icon} size={12} />
      </span>
      <div className="skill-row-body">
        <div className="skill-row-name">
          {skill.name}
          {skill.source && (
            <span className="skill-row-tag market">
              {skill.source === "user" ? "User" : "Project"}
            </span>
          )}
        </div>
        <div className="skill-row-desc">{skill.description}</div>
      </div>
      <div className="skill-row-controls">
        <Switch
          checked={skill.enabled}
          onChange={() =>
            send({ type: "setSkillEnabled", id: skill.id, enabled: !skill.enabled })
          }
          label={skill.name}
        />
      </div>
    </div>
  );
}

function ToggleableRow({
  skill,
  onToggle,
  onRemove
}: {
  skill: AddedSkill;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const icon = iconFor(skill.id);
  return (
    <div className={`skill-row toggleable${skill.enabled ? " enabled" : ""}`}>
      <span className="skill-row-icon">
        <Icon name={icon} size={12} />
      </span>
      <div className="skill-row-body">
        <div className="skill-row-name">
          {skill.name}
          <span className="skill-row-tag market">{skill.publisher}</span>
        </div>
        <div className="skill-row-desc">{skill.description}</div>
      </div>
      <div className="skill-row-controls">
        <Switch checked={skill.enabled} onChange={onToggle} label={skill.name} />
        <button
          type="button"
          className="skill-row-remove"
          onClick={onRemove}
          title={`Remove ${skill.name}`}
          aria-label={`Remove ${skill.name}`}
        >
          <Icon name="x" size={11} />
        </button>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      className={`switch${checked ? " on" : ""}`}
      onClick={onChange}
    >
      <span className="switch-knob" />
    </button>
  );
}

function iconFor(id: string): IconName {
  switch (id) {
    case "fs_read":
    case "Read":
      return "file";
    case "fs_write":
    case "Write":
    case "Edit":
      return "edit";
    case "bash":
      return "terminal";
    case "Glob":
      return "folder";
    case "Grep":
      return "search";
    case "WebFetch":
      return "cloud";
    case "Task":
      return "layers";
    case "mcp":
      return "git";
    case "github":
    case "git":
      return "branch";
    case "postgres":
      return "layers";
    case "linear":
    case "notion":
      return "book";
    case "slack":
      return "cloud";
    case "playwright":
    case "puppeteer":
      return "eye";
    case "filesystem":
      return "folder";
    case "memory":
      return "book";
    case "brave-search":
      return "search";
    case "figma":
      return "edit";
    default:
      return "code";
  }
}
