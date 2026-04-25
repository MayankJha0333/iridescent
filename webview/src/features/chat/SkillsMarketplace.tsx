// ─────────────────────────────────────────────────────────────
// Skills Marketplace modal — browseable catalog of skills and
// MCP servers users can add to Iridescent. Static catalog mirrors
// the official Anthropic / Claude Code MCP & skills directory.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { send } from "../../lib/rpc";
import { Icon, IconName } from "../../design/icons";

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  category: "MCP" | "Skill" | "Integration";
  publisher: string;
  icon: IconName;
  url: string;
  /** Suggested install command — surfaced as a hint when the user clicks Add. */
  install?: string;
}

const CATALOG: ReadonlyArray<MarketplaceSkill> = [
  {
    id: "github",
    name: "GitHub",
    description: "Browse repos, manage issues and pull requests, run actions.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "git",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    install: "claude mcp add github"
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Drive a real browser to click, type, screenshot, and assert.",
    category: "MCP",
    publisher: "Microsoft",
    icon: "eye",
    url: "https://github.com/microsoft/playwright-mcp",
    install: "claude mcp add playwright"
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Sandboxed access to a directory tree outside the workspace.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "folder",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    install: "claude mcp add filesystem"
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Read-only schema introspection and parameterised queries.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "layers",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    install: "claude mcp add postgres"
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge graph that survives across sessions.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "book",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    install: "claude mcp add memory"
  },
  {
    id: "linear",
    name: "Linear",
    description: "Triage and update Linear issues, projects, and cycles.",
    category: "MCP",
    publisher: "Linear",
    icon: "bolt",
    url: "https://linear.app/changelog/2024-09-mcp",
    install: "claude mcp add linear"
  },
  {
    id: "notion",
    name: "Notion",
    description: "Search, read, and edit Notion pages and databases.",
    category: "MCP",
    publisher: "Notion",
    icon: "book",
    url: "https://developers.notion.com/docs/mcp",
    install: "claude mcp add notion"
  },
  {
    id: "slack",
    name: "Slack",
    description: "Read channels, post messages, manage threads.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "cloud",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    install: "claude mcp add slack"
  },
  {
    id: "figma",
    name: "Figma",
    description: "Read frames, components, and assets from a Figma file.",
    category: "MCP",
    publisher: "Community",
    icon: "edit",
    url: "https://github.com/GLips/Figma-Context-MCP",
    install: "claude mcp add figma"
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via Brave's privacy-first index.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "search",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    install: "claude mcp add brave-search"
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Headless Chrome automation for scraping and PDFs.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "play",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    install: "claude mcp add puppeteer"
  },
  {
    id: "git",
    name: "Git",
    description: "Inspect history, branches, diffs, and blame.",
    category: "MCP",
    publisher: "Anthropic",
    icon: "branch",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    install: "claude mcp add git"
  },
  {
    id: "skill-pdf",
    name: "PDF",
    description: "Read text, fill forms, and split PDFs.",
    category: "Skill",
    publisher: "Anthropic",
    icon: "file",
    url: "https://code.claude.com/docs/en/skills"
  },
  {
    id: "skill-xlsx",
    name: "Spreadsheets",
    description: "Open, edit, compute, and chart .xlsx files.",
    category: "Skill",
    publisher: "Anthropic",
    icon: "layers",
    url: "https://code.claude.com/docs/en/skills"
  },
  {
    id: "skill-docx",
    name: "Word documents",
    description: "Create and edit .docx files with proper formatting.",
    category: "Skill",
    publisher: "Anthropic",
    icon: "file",
    url: "https://code.claude.com/docs/en/skills"
  }
];

const CATEGORIES: ReadonlyArray<{ key: MarketplaceSkill["category"] | "All"; label: string }> = [
  { key: "All", label: "All" },
  { key: "MCP", label: "MCP servers" },
  { key: "Skill", label: "Skills" },
  { key: "Integration", label: "Integrations" }
];

export interface SkillsMarketplaceProps {
  open: boolean;
  installed: ReadonlySet<string>;
  onClose: () => void;
  onInstall: (skill: MarketplaceSkill) => void;
}

export function SkillsMarketplace({
  open,
  installed,
  onClose,
  onInstall
}: SkillsMarketplaceProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<MarketplaceSkill["category"] | "All">("All");

  // Lock body scroll while the modal is open + close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((s) => {
      if (tab !== "All" && s.category !== tab) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.publisher.toLowerCase().includes(q)
      );
    });
  }, [query, tab]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal market"
        role="dialog"
        aria-label="Skills marketplace"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="market-head">
          <div className="market-head-titles">
            <span className="market-eyebrow">Marketplace</span>
            <h2 className="market-title">Skills & MCP servers</h2>
            <p className="market-sub">
              Extend Iridescent with capabilities from the Anthropic directory.
            </p>
          </div>
          <button
            type="button"
            className="market-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="market-toolbar">
          <div className="market-search">
            <Icon name="search" size={13} />
            <input
              type="text"
              placeholder="Search skills, e.g. github, postgres, figma…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              spellCheck={false}
            />
          </div>
          <div className="market-tabs" role="tablist">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={tab === c.key}
                className={`market-tab${tab === c.key ? " active" : ""}`}
                onClick={() => setTab(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="market-grid">
          {filtered.length === 0 ? (
            <div className="market-empty">
              <Icon name="search" size={20} />
              <span>No matches for "{query}".</span>
            </div>
          ) : (
            filtered.map((s) => (
              <MarketCard
                key={s.id}
                skill={s}
                installed={installed.has(s.id)}
                onInstall={() => onInstall(s)}
              />
            ))
          )}
        </div>

        <footer className="market-foot">
          <span>Backed by the open-source MCP ecosystem.</span>
          <button
            type="button"
            className="inline-btn"
            onClick={() =>
              send({
                type: "openExternal",
                url: "https://github.com/modelcontextprotocol/servers"
              })
            }
          >
            Browse all on GitHub ↗
          </button>
        </footer>
      </div>
    </div>
  );
}

function MarketCard({
  skill,
  installed,
  onInstall
}: {
  skill: MarketplaceSkill;
  installed: boolean;
  onInstall: () => void;
}) {
  return (
    <article className={`market-card${installed ? " installed" : ""}`}>
      <div className="market-card-head">
        <span className="market-card-icon">
          <Icon name={skill.icon} size={14} />
        </span>
        <div className="market-card-titles">
          <span className="market-card-name">{skill.name}</span>
          <span className="market-card-pub">
            <span className="market-card-cat">{skill.category}</span>
            <span className="market-card-dot" />
            {skill.publisher}
          </span>
        </div>
      </div>
      <p className="market-card-desc">{skill.description}</p>
      <div className="market-card-actions">
        <button
          type="button"
          className="market-card-btn ghost"
          onClick={() => send({ type: "openExternal", url: skill.url })}
        >
          <Icon name="book" size={11} />
          Docs
        </button>
        {installed ? (
          <span className="market-card-installed">
            <Icon name="check" size={11} />
            Added
          </span>
        ) : (
          <button type="button" className="market-card-btn primary" onClick={onInstall}>
            <Icon name="plus" size={11} />
            Add
          </button>
        )}
      </div>
    </article>
  );
}
