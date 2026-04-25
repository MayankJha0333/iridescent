// ─────────────────────────────────────────────────────────────
// Model picker. Mirrors Claude Code's `/model` picker layout —
// aliases first (subscription only), then pinned versions, then
// 1M-context variants. The catalog comes from the extension via
// the `models` RPC, which gates aliases to Claude Code CLI mode.
// We don't expose a freeform "custom model" field; per the docs
// custom IDs are added via `ANTHROPIC_CUSTOM_MODEL_OPTION` env
// vars at the host level, not at runtime in the webview.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../design/icons";
import type { ModelInfo, ModelGroup } from "../../lib/rpc";

export interface ModelPickerProps {
  models: ReadonlyArray<ModelInfo>;
  value: string;
  onSelect: (id: string) => void;
}

interface GroupSpec {
  key: ModelGroup;
  title: string;
  hint?: string;
}

const GROUP_ORDER: ReadonlyArray<GroupSpec> = [
  { key: "alias",   title: "Recommended", hint: "Tracks the latest Claude release for your plan." },
  { key: "version", title: "Versions",    hint: "Lock to an exact release." }
];

export function ModelPicker({ models, value, onSelect }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<ModelGroup, ModelInfo[]>();
    for (const m of models) {
      const arr = map.get(m.group) ?? [];
      arr.push(m);
      map.set(m.group, arr);
    }
    return map;
  }, [models]);

  const current =
    models.find((m) => m.value === value) ??
    ({
      value,
      label: shortLabel(value),
      note: "active",
      supportsTools: true,
      group: "version"
    } satisfies ModelInfo);

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="picker model-picker" ref={ref}>
      <button
        type="button"
        className="cmp-model"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model"
        title={`Model: ${current.label}`}
      >
        <span className="cmp-model-name">{current.label}</span>
        <Icon name="chevronD" size={9} />
      </button>

      {open && (
        <div
          className="dropdown dropdown-right dropdown-above model-dropdown"
          role="listbox"
        >
          <div className="model-head">
            <span className="model-title">Model</span>
            <span className="model-sub">
              From the official Claude Code model catalog.
            </span>
          </div>

          <div className="model-scroll">
            {GROUP_ORDER.map((spec) => {
              const items = grouped.get(spec.key);
              if (!items || items.length === 0) return null;
              return (
                <ModelGroupRow
                  key={spec.key}
                  title={spec.title}
                  hint={spec.hint}
                >
                  {items.map((m) => (
                    <ModelRow
                      key={m.value}
                      id={m.value}
                      label={m.label}
                      note={m.note}
                      selected={m.value === value}
                      showId={spec.key === "version"}
                      onSelect={() => pick(m.value)}
                    />
                  ))}
                </ModelGroupRow>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelGroupRow({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="model-group">
      <div className="model-group-title">
        <span>{title}</span>
        {hint && <span className="model-group-hint">{hint}</span>}
      </div>
      <div className="model-group-list">{children}</div>
    </div>
  );
}

function ModelRow({
  id,
  label,
  note,
  selected,
  showId,
  onSelect
}: {
  id: string;
  label: string;
  note?: string;
  selected: boolean;
  showId: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`model-row${selected ? " selected" : ""}`}
      onClick={onSelect}
    >
      <span className="model-row-radio" aria-hidden>
        <span className="model-row-radio-dot" />
      </span>
      <span className="model-row-body">
        <span className="model-row-label">{label}</span>
        {note && <span className="model-row-note">{note}</span>}
        {showId && id !== label && <span className="model-row-id">{id}</span>}
      </span>
    </button>
  );
}

function shortLabel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "").replace(/-latest$/, "");
}
