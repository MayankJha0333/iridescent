import { ReactElement, RefObject, useEffect, useRef, useState } from "react";
import { send } from "../rpc";

interface Props {
  mode: string;
  model: string;
  permissionMode: string;
  busy: boolean;
}

const MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7", note: "best reasoning" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "balanced" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fastest" }
];

const PERM_MODES: {
  id: string;
  label: string;
  note: string;
  icon: () => ReactElement;
  danger?: boolean;
}[] = [
  {
    id: "default",
    label: "Ask",
    note: "prompt before actions",
    icon: () => (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    )
  },
  {
    id: "auto",
    label: "Auto-accept",
    note: "edits run without asking",
    icon: () => (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  },
  {
    id: "plan",
    label: "Plan",
    note: "read-only, draft plan",
    icon: () => (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
    )
  },
  {
    id: "bypass",
    label: "Bypass",
    note: "⚠ skip all approvals",
    danger: true,
    icon: () => (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.69 14a6.9 6.9 0 00.31-2V5l-8-3-3.16 1.18" />
        <path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 005.62-4.38" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
];

export function Header({ mode, model, permissionMode, busy }: Props) {
  return (
    <header className="hdr">
      <div className="hdr-left">
        <span className="hdr-logo">✦</span>
        <span className="hdr-title">Iridescent</span>
      </div>
      <div className="hdr-mid">
        <span className={`chip ${mode === "subscription" ? "chip-sub" : "chip-api"}`} title={mode}>
          <span className="chip-dot" />
          {mode === "subscription" ? "subscription" : "api key"}
        </span>
        <ModelPicker model={model} />
        <PermissionPicker mode={permissionMode} />
        {busy && (
          <span className="chip chip-busy" title="Streaming">
            <span className="spinner" />
            streaming
          </span>
        )}
      </div>
      <div className="hdr-right">
        <button className="icon-btn" title="New chat" onClick={() => send({ type: "newSession" })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
        <button className="icon-btn" title="Logout" onClick={() => send({ type: "authReset" })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function ModelPicker({ model }: { model: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, open, () => setOpen(false));
  const current = MODELS.find((m) => m.id === model);
  return (
    <div className="picker" ref={ref}>
      <button
        className={`chip chip-model ${open ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Change model"
      >
        {current?.label ?? shortModel(model)}
        <Caret />
      </button>
      {open && (
        <div className="dropdown">
          {MODELS.map((m) => (
            <button
              key={m.id}
              className={`dropdown-item ${m.id === model ? "active" : ""}`}
              onClick={() => {
                send({ type: "setModel", model: m.id });
                setOpen(false);
              }}
            >
              <span className="di-main">{m.label}</span>
              <span className="di-note">{m.note}</span>
              {m.id === model && <span className="di-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionPicker({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, open, () => setOpen(false));
  const current = PERM_MODES.find((p) => p.id === mode) ?? PERM_MODES[0];
  const Icon = current.icon;
  return (
    <div className="picker" ref={ref}>
      <button
        className={`chip chip-perm ${mode === "bypass" ? "chip-danger" : ""} ${open ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={`Permission: ${current.label}`}
      >
        <Icon />
        {current.label}
        <Caret />
      </button>
      {open && (
        <div className="dropdown">
          {PERM_MODES.map((p) => {
            const ItemIcon = p.icon;
            return (
              <button
                key={p.id}
                className={`dropdown-item ${p.id === mode ? "active" : ""} ${p.danger ? "danger" : ""}`}
                onClick={() => {
                  send({ type: "setPermissionMode", mode: p.id });
                  setOpen(false);
                }}
              >
                <span className="di-icon">
                  <ItemIcon />
                </span>
                <span className="di-main">{p.label}</span>
                <span className="di-note">{p.note}</span>
                {p.id === mode && <span className="di-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: 4 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function useOutsideClose(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, ref, close]);
}

function shortModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "").replace(/-latest$/, "");
}
