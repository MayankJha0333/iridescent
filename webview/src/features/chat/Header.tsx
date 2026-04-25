// ─────────────────────────────────────────────────────────────
// Slim session header — Forge ForgeSessionHeader. The model and
// permission-mode pickers live in the Composer, per the Forge
// design. The header carries identity + global session actions.
// ─────────────────────────────────────────────────────────────

import { Icon } from "../../design/icons";
import { IconButton } from "../../design/primitives";
import { send, AuthMode } from "../../lib/rpc";
import { findMode } from "./constants";
import type { PermissionMode } from "../../lib/rpc";

interface HeaderProps {
  authMode: AuthMode | null;
  permissionMode: PermissionMode;
  busy: boolean;
}

export function Header({ authMode, permissionMode, busy }: HeaderProps) {
  const mode = findMode(permissionMode);
  const authLabel = authMode === "subscription" ? "subscription" : "api key";
  return (
    <header className="hdr">
      <div className="hdr-left">
        <div className="hdr-logo" aria-hidden>
          <Icon name="sparkle" size={11} />
        </div>
        <span className="hdr-title">Iridescent</span>
        <span
          className={`chip chip-${authMode === "subscription" ? "sub" : "api"}`}
          title={authLabel}
        >
          <span className="chip-dot" />
          {authLabel}
        </span>
        <span className="chip chip-mode-pill" title={mode.note}>
          <Icon name={mode.icon} size={10} />
          {mode.short}
        </span>
        {busy && (
          <span className="chip chip-busy" title="Streaming">
            <span className="spinner" />
            streaming
          </span>
        )}
      </div>

      <div className="hdr-right">
        <IconButton
          icon="plus"
          title="New chat"
          size={28}
          onClick={() => send({ type: "newSession" })}
        />
        <IconButton
          icon="logout"
          title="Logout"
          size={28}
          onClick={() => send({ type: "authReset" })}
        />
      </div>
    </header>
  );
}
