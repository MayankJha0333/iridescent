import { ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { Icon, IconName } from "../icons";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  note?: string;
  icon?: IconName;
  danger?: boolean;
}

export interface DropdownProps<T extends string = string> {
  options: ReadonlyArray<DropdownOption<T>>;
  value: T;
  onSelect: (v: T) => void;
  align?: "left" | "center" | "right";
  /** What renders inside the trigger (the chip/button content). */
  trigger: (state: { open: boolean; option: DropdownOption<T> | undefined }) => ReactNode;
  triggerClassName?: string;
  /** Position the menu above the trigger instead of below. */
  placement?: "below" | "above";
  ariaLabel?: string;
}

export function Dropdown<T extends string = string>({
  options,
  value,
  onSelect,
  align = "center",
  trigger,
  triggerClassName = "",
  placement = "below",
  ariaLabel
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, open, () => setOpen(false));

  const current = options.find((o) => o.value === value);

  return (
    <div className="picker" ref={ref}>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {trigger({ open, option: current })}
      </button>
      {open && (
        <div
          role="listbox"
          className={`dropdown dropdown-${align} dropdown-${placement}`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`dropdown-item ${opt.value === value ? "active" : ""} ${opt.danger ? "danger" : ""}`}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
            >
              {opt.icon && (
                <span className="di-icon">
                  <Icon name={opt.icon} size={13} />
                </span>
              )}
              <span className="di-main">{opt.label}</span>
              {opt.note && <span className="di-note">{opt.note}</span>}
              {opt.value === value && <span className="di-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}
