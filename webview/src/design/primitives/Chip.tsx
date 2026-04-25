import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

export type ChipTone = "default" | "accent" | "success" | "warn" | "error" | "info" | "danger";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChipTone;
  active?: boolean;
  interactive?: boolean;
  pulse?: boolean;
  children: ReactNode;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { tone = "default", active, interactive, pulse, children, className = "", ...rest },
  ref
) {
  const cls = [
    "chip",
    `chip-${tone}`,
    active ? "active" : "",
    interactive ? "interactive" : "",
    pulse ? "chip-busy" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  if (!interactive) {
    // Render as static span when not clickable.
    return (
      <span ref={ref as never} className={cls}>
        {children}
      </span>
    );
  }

  return (
    <button ref={ref} type="button" className={cls} {...rest}>
      {children}
    </button>
  );
});
