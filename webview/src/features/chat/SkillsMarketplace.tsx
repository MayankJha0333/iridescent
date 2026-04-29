// ─────────────────────────────────────────────────────────────
// Skills Marketplace modal — fetches the live catalog from
// claude-plugins.dev/api/skills and lets the user install any
// skill at user-scope (~/.claude/skills/) or project-scope
// (<workspace>/.claude/skills/). Already-installed skills show
// a scope badge so the user can see where each one lives.
//
// Pagination is server-side (the API has 49k+ entries; we ask
// for 24 at a time and load more on demand). Search hits the
// API's `q` parameter for relevance ranking rather than
// filtering client-side.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { send, onMessage, MarketplaceSkill } from "../../lib/rpc";
import { Icon, IconName } from "../../design/icons";

const PAGE_SIZE = 24;

export type InstallScope = "user" | "project";

export interface InstalledMatch {
  /** "user" | "project" — which directory the matching SKILL.md lives in. */
  source: "user" | "project";
  /** Human-readable name from the SKILL.md frontmatter (falls back to id). */
  displayName: string;
  description: string;
}

export interface SkillsMarketplaceProps {
  open: boolean;
  /**
   * Discovered skills from disk (passed down from SkillsPicker → here).
   * Keyed by skill `id` (which is the directory name == marketplace
   * skill `name`). Used to render "Installed (User|Project)" badges and
   * swap Install for Uninstall.
   */
  installed: ReadonlyMap<string, InstalledMatch>;
  onClose: () => void;
}

interface MarketState {
  status: "idle" | "loading" | "loadingMore" | "ready" | "error";
  skills: MarketplaceSkill[];
  total: number;
  offset: number;
  error?: string;
}

export function SkillsMarketplace({
  open,
  installed,
  onClose
}: SkillsMarketplaceProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "installed">("all");
  const [state, setState] = useState<MarketState>({
    status: "idle",
    skills: [],
    total: 0,
    offset: 0
  });
  const [busyName, setBusyName] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Subscribe to marketplace responses + install results.
  useEffect(() => {
    if (!open) return;
    return onMessage((m) => {
      if (m.type === "marketplaceList") {
        setState((prev) => ({
          status: "ready",
          // If offset is 0 we replace; otherwise we're paginating.
          skills: m.offset === 0 ? m.skills : [...prev.skills, ...m.skills],
          total: m.total,
          offset: m.offset + m.skills.length
        }));
      } else if (m.type === "marketplaceError") {
        setState((prev) => ({ ...prev, status: "error", error: m.message }));
      } else if (m.type === "marketplaceInstallResult") {
        setBusyName(null);
        const scopeLabel = m.scope === "user" ? "globally" : "for this workspace";
        if (m.ok) {
          if (m.action === "uninstall") {
            setToast({ ok: true, text: `Removed ${m.name} (${scopeLabel}).` });
          } else {
            setToast({
              ok: true,
              text: `Installed ${m.name} ${scopeLabel}${
                m.filesWritten ? ` · ${m.filesWritten} files` : ""
              }.`
            });
          }
        } else {
          const verb = m.action === "uninstall" ? "remove" : "install";
          setToast({
            ok: false,
            text: `Couldn't ${verb} ${m.name}: ${m.error ?? "unknown error"}.`
          });
        }
        // Auto-clear after a few seconds.
        window.setTimeout(() => setToast(null), 4000);
      }
    });
  }, [open]);

  // Initial fetch + refetch on query change (debounced).
  // We deliberately keep the previous `skills` visible while the new
  // batch loads — clearing them would cause the modal/grid to collapse
  // and re-expand on every keystroke.
  useEffect(() => {
    if (!open) return;
    setState((s) => ({ ...s, status: "loading" }));
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      send({
        type: "requestMarketplace",
        offset: 0,
        limit: PAGE_SIZE,
        query: query || undefined
      });
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  // Lock Esc + click-outside while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadMore = () => {
    setState((s) => ({ ...s, status: "loadingMore" }));
    send({
      type: "requestMarketplace",
      offset: state.offset,
      limit: PAGE_SIZE,
      query: query || undefined
    });
  };

  const install = (s: MarketplaceSkill, scope: InstallScope) => {
    setBusyName(s.name);
    send({
      type: "installMarketplaceSkill",
      target: {
        name: s.name,
        repoOwner: s.repoOwner,
        repoName: s.repoName,
        directoryPath: s.directoryPath
      },
      scope
    });
  };

  const uninstall = (name: string, scope: InstallScope) => {
    setBusyName(name);
    send({ type: "uninstallMarketplaceSkill", name, scope });
  };

  // Installed tab pulls directly from the on-disk installed map so the user
  // always sees their installed skills here, even if they haven't scrolled
  // through the (49k+ entry) marketplace far enough to hit the matching row.
  // Must be declared above the `if (!open) return null` early return so the
  // hook order stays stable across renders.
  const installedEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Array<{
      name: string;
      displayName: string;
      description: string;
      source: "user" | "project";
    }> = [];
    installed.forEach((meta, name) => {
      if (
        q &&
        !name.toLowerCase().includes(q) &&
        !meta.displayName.toLowerCase().includes(q) &&
        !meta.description.toLowerCase().includes(q)
      ) {
        return;
      }
      rows.push({ name, ...meta });
    });
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return rows;
  }, [installed, query]);

  if (!open) return null;

  const isSearching = state.status === "loading" && state.skills.length > 0;
  const hasMore = tab === "all" && state.skills.length < state.total;

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
            <h2 className="market-title">Claude Code Skills</h2>
            <p className="market-sub">
              Browse and install skills from{" "}
              <span className="market-link">claude-plugins.dev</span>.
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
              placeholder="Search skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            {isSearching ? (
              <span className="market-search-spinner" aria-label="Searching" />
            ) : state.total > 0 && state.status === "ready" ? (
              <span className="market-search-count">
                {state.skills.length} of {state.total.toLocaleString()}
              </span>
            ) : null}
          </div>
          <div className="market-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "all"}
              className={`market-tab${tab === "all" ? " active" : ""}`}
              onClick={() => setTab("all")}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "installed"}
              className={`market-tab${tab === "installed" ? " active" : ""}`}
              onClick={() => setTab("installed")}
              disabled={installed.size === 0}
              title={
                installed.size === 0
                  ? "No skills installed yet"
                  : `${installed.size} installed`
              }
            >
              Installed
              {installed.size > 0 && (
                <span className="market-tab-count">{installed.size}</span>
              )}
            </button>
          </div>
        </div>

        <div
          className={`market-grid${isSearching && tab === "all" ? " searching" : ""}`}
          aria-busy={state.status === "loading"}
        >
          {tab === "installed" ? (
            installedEntries.length === 0 ? (
              <div className="market-empty">
                <Icon name="search" size={20} />
                <span>
                  {installed.size === 0
                    ? "Nothing installed yet. Install a skill from the All tab."
                    : `No installed skills match "${query}".`}
                </span>
              </div>
            ) : (
              installedEntries.map((row) => (
                <InstalledCard
                  key={row.name}
                  name={row.name}
                  displayName={row.displayName}
                  description={row.description}
                  source={row.source}
                  busy={busyName === row.name}
                  onUninstall={() => uninstall(row.name, row.source)}
                />
              ))
            )
          ) : state.status === "loading" && state.skills.length === 0 ? (
            <div className="market-empty">
              <span className="market-spinner-lg" />
              <span>Loading skills…</span>
            </div>
          ) : state.status === "error" ? (
            <div className="market-empty">
              <Icon name="x" size={20} />
              <span>Couldn't load: {state.error ?? "network error"}</span>
            </div>
          ) : state.skills.length === 0 ? (
            <div className="market-empty">
              <Icon name="search" size={20} />
              <span>No skills match {query ? `"${query}"` : "your filter"}.</span>
            </div>
          ) : (
            <>
              {state.skills.map((s) => (
                <MarketCard
                  key={s.id}
                  skill={s}
                  installed={installed.get(s.name) ?? null}
                  busy={busyName === s.name}
                  onInstall={(scope) => install(s, scope)}
                  onUninstall={(scope) => uninstall(s.name, scope)}
                />
              ))}
              {hasMore && (
                <div className="market-load-more">
                  <button
                    type="button"
                    className="market-card-btn ghost"
                    onClick={loadMore}
                    disabled={state.status === "loadingMore"}
                  >
                    {state.status === "loadingMore"
                      ? "Loading…"
                      : `Load ${Math.min(PAGE_SIZE, state.total - state.skills.length)} more`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {toast && (
          <div className={`market-toast${toast.ok ? " ok" : " err"}`}>
            <Icon name={toast.ok ? "check" : "x"} size={11} />
            <span>{toast.text}</span>
          </div>
        )}

        <footer className="market-foot">
          <span>Powered by claude-plugins.dev</span>
          <button
            type="button"
            className="inline-btn"
            onClick={() =>
              send({
                type: "openExternal",
                url: "https://claude-plugins.dev/skills"
              })
            }
          >
            Browse all ↗
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────

function MarketCard({
  skill,
  installed,
  busy,
  onInstall,
  onUninstall
}: {
  skill: MarketplaceSkill;
  installed: InstalledMatch | null;
  busy: boolean;
  onInstall: (scope: InstallScope) => void;
  onUninstall: (scope: InstallScope) => void;
}) {
  const icon = iconFor(skill.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <article className={`market-card${installed ? " installed" : ""}`}>
      <div className="market-card-head">
        <span className="market-card-icon">
          <Icon name={icon} size={14} />
        </span>
        <div className="market-card-titles">
          <span className="market-card-name">{skill.name}</span>
          <span className="market-card-pub">
            <span className="market-card-cat">@{skill.author}</span>
            {skill.installs > 0 && (
              <>
                <span className="market-card-dot" />
                {formatCount(skill.installs)} installs
              </>
            )}
            {skill.stars > 0 && (
              <>
                <span className="market-card-dot" />
                ★ {formatCount(skill.stars)}
              </>
            )}
          </span>
        </div>
      </div>
      <p className="market-card-desc">{truncate(skill.description, 220)}</p>
      <div className="market-card-actions">
        <button
          type="button"
          className="market-card-btn ghost"
          onClick={() =>
            send({ type: "openExternal", url: skill.sourceUrl })
          }
          title={skill.sourceUrl}
        >
          <Icon name="book" size={11} />
          Source
        </button>
        {installed ? (
          <>
            <span
              className={`market-card-installed scope-${installed.source}`}
              title={`Installed at ${installed.source} scope`}
            >
              <Icon name="check" size={11} />
              {installed.source === "user" ? "Installed · User" : "Installed · Project"}
            </span>
            <button
              type="button"
              className="market-card-btn danger"
              onClick={() => onUninstall(installed.source)}
              disabled={busy}
              title={`Uninstall (${installed.source} scope)`}
            >
              {busy ? "Working…" : "Uninstall"}
            </button>
          </>
        ) : (
          <div className="market-card-install-split" ref={menuRef}>
            <button
              type="button"
              className="market-card-btn primary split-main"
              onClick={() => onInstall("project")}
              disabled={busy}
              title="Install for this workspace"
            >
              {busy ? "Working…" : "Install"}
            </button>
            <button
              type="button"
              className="market-card-btn primary split-toggle"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More install options"
            >
              <Icon name="chevronD" size={9} />
            </button>
            {menuOpen && (
              <div className="market-card-install-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="market-card-install-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onInstall("project");
                  }}
                >
                  <span className="mim-title">Install for this workspace</span>
                  <span className="mim-sub">
                    Only available while you're working in this project.
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="market-card-install-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onInstall("user");
                  }}
                >
                  <span className="mim-title">Install globally</span>
                  <span className="mim-sub">
                    Available across every workspace you open.
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Installed-only card ────────────────────────────────────
// Rendered in the "Installed" tab. Sources its data from the on-disk
// SKILL.md (passed via the `installed` map), so it's available even when
// the marketplace API hasn't paged that far yet.

function InstalledCard({
  name,
  displayName,
  description,
  source,
  busy,
  onUninstall
}: {
  name: string;
  displayName: string;
  description: string;
  source: "user" | "project";
  busy: boolean;
  onUninstall: () => void;
}) {
  const icon = iconFor(name);
  return (
    <article className="market-card installed">
      <div className="market-card-head">
        <span className="market-card-icon">
          <Icon name={icon} size={14} />
        </span>
        <div className="market-card-titles">
          <span className="market-card-name">{displayName}</span>
          <span className="market-card-pub">
            <span className="market-card-cat">
              {source === "user" ? "Global" : "This workspace"}
            </span>
          </span>
        </div>
      </div>
      <p className="market-card-desc">
        {description ? truncate(description, 220) : "Installed skill — no description provided."}
      </p>
      <div className="market-card-actions">
        <span
          className={`market-card-installed scope-${source}`}
          title={`Installed ${source === "user" ? "globally" : "for this workspace"}`}
        >
          <Icon name="check" size={11} />
          {source === "user" ? "Global" : "Workspace"}
        </span>
        <button
          type="button"
          className="market-card-btn danger"
          onClick={onUninstall}
          disabled={busy}
        >
          {busy ? "Working…" : "Uninstall"}
        </button>
      </div>
    </article>
  );
}

// ── Helpers ────────────────────────────────────────────────

function iconFor(name: string): IconName {
  const n = name.toLowerCase();
  if (/web|browser|playwright|test/.test(n)) return "eye";
  if (/pdf|doc|file|download/.test(n)) return "file";
  if (/sql|postgres|db|database/.test(n)) return "layers";
  if (/git|github|branch/.test(n)) return "branch";
  if (/edit|write|create/.test(n)) return "edit";
  if (/grep|search|find/.test(n)) return "search";
  if (/design|ui|ux|frontend/.test(n)) return "edit";
  if (/architect/.test(n)) return "layers";
  return "bolt";
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

/**
 * Re-export so SkillsPicker can build the `installed` map without
 * pulling in marketplace.ts directly.
 */
export type { MarketplaceSkill };
