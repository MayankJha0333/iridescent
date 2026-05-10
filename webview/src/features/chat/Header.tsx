// ─────────────────────────────────────────────────────────────
// Slim session header — Forge ForgeSessionHeader. The model and
// permission-mode pickers live in the Composer, per the Forge
// design. The header carries identity + global session actions.
// ─────────────────────────────────────────────────────────────

import { motion } from "framer-motion";
import { Icon } from "../../design/icons";
import { IconButton, Chip } from "../../design/primitives";
import { send, AuthMode, ConventionsSource } from "../../lib/rpc";
import { findMode } from "./constants";
import type { PermissionMode } from "../../lib/rpc";
import { ConventionsStatusPill } from "./ConventionsStatusPill";

interface HeaderProps {
  authMode: AuthMode | null;
  permissionMode: PermissionMode;
  busy: boolean;
  conventions: {
    source: ConventionsSource | null;
    path: string | null;
    relativePath: string | null;
  };
  onOpenHistory: () => void;
}

export function Header({ authMode, permissionMode, busy, conventions, onOpenHistory }: HeaderProps) {
  const mode = findMode(permissionMode);
  const authLabel = authMode === "subscription" ? "subscription" : "api key";
  return (
    <header className="flex items-center justify-between gap-2 px-3 py-[9px] border-b border-b1 bg-s1 min-h-[44px] flex-shrink-0">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <div
          className="w-[22px] h-[22px] rounded-[7px] inline-flex items-center justify-center text-white flex-shrink-0"
          style={{
            background:
              "conic-gradient(from 180deg, var(--accent), var(--accent-glow), var(--accent))",
            boxShadow: "0 1px 8px var(--accent-shadow)"
          }}
          aria-hidden
        >
          <Icon name="sparkle" size={11} />
        </div>
        <span className="font-bold text-[13px] tracking-[-0.2px] text-t1 flex-shrink-0">
          Iridescent
        </span>
        <Chip tone={authMode === "subscription" ? "accent" : "info"} title={authLabel}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {authLabel}
        </Chip>
        <Chip tone="default" title={mode.note}>
          <Icon name={mode.icon} size={10} />
          {mode.short}
        </Chip>
        <ConventionsStatusPill
          source={conventions.source}
          path={conventions.path}
          relativePath={conventions.relativePath}
        />
        {busy && (
          <Chip tone="accent" pulse title="Streaming">
            <motion.span
              className="inline-block w-2.5 h-2.5 rounded-full border-[1.5px] border-current border-r-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            streaming
          </Chip>
        )}
      </div>

      <div className="flex gap-0.5 flex-shrink-0">
        <IconButton icon="history" title="Chat history" size={28} onClick={onOpenHistory} />
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
