// ─────────────────────────────────────────────────────────────
// Banner — shown after 3 turns in a workspace with no conventions
// file detected. Three actions: Generate (opens command), Not now
// (hides for this session), or Don't ask again (workspace-scoped).
// ─────────────────────────────────────────────────────────────

import { send } from "../../lib/rpc";

interface ConventionsBannerProps {
  onHideForSession: () => void;
}

export function ConventionsBanner({ onHideForSession }: ConventionsBannerProps) {
  return (
    <div className="conventions-banner" role="status">
      <div className="conventions-banner-text">
        <strong>Iridescent works better with project conventions.</strong>
        <span>
          {" "}
          Generate a CLAUDE.md so the model knows your project's structure,
          style, and canonical examples.
        </span>
      </div>
      <div className="conventions-banner-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            send({ type: "generateConventions" });
            onHideForSession();
          }}
        >
          Generate
        </button>
        <button type="button" className="btn-ghost" onClick={onHideForSession}>
          Not now
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            send({ type: "dismissConventionsBanner" });
            onHideForSession();
          }}
        >
          Don't ask for this workspace
        </button>
      </div>
    </div>
  );
}
