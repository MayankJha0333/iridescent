import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";
import { motion } from "framer-motion";

export type ChipTone = "default" | "accent" | "success" | "warn" | "error" | "info" | "danger";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChipTone;
  active?: boolean;
  interactive?: boolean;
  pulse?: boolean;
  children: ReactNode;
}

const BASE =
  "inline-flex items-center gap-[5px] px-2 py-[3px] rounded-md text-[11px] font-semibold tracking-[0.1px] tabular-nums whitespace-nowrap font-[inherit] transition-colors duration-[120ms] ease-out border";

const TONES: Record<ChipTone, string> = {
  default: "text-t3 bg-s2 border-b1",
  accent: "text-accent-glow bg-accent-soft border-accent-mid",
  success: "text-ok bg-ok-soft border-[rgba(52,211,153,0.32)]",
  warn: "text-warn bg-warn-soft border-[rgba(251,191,36,0.32)]",
  error: "text-err bg-err-soft border-[rgba(248,113,113,0.35)]",
  info: "text-info bg-info-soft border-[rgba(96,165,250,0.32)]",
  danger: "text-err bg-err-soft border-[rgba(248,113,113,0.35)]"
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { tone = "default", active, interactive, pulse, children, className = "", ...rest },
  ref
) {
  const cls = [
    BASE,
    TONES[tone],
    active ? "ring-1 ring-accent-mid" : "",
    interactive ? "cursor-pointer hover:brightness-110" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const content = pulse ? (
    <motion.span
      animate={{ opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className="inline-flex items-center gap-[5px]"
    >
      {children}
    </motion.span>
  ) : (
    children
  );

  if (!interactive) {
    return (
      <span ref={ref as never} className={cls}>
        {content}
      </span>
    );
  }

  return (
    <button ref={ref} type="button" className={cls} {...rest}>
      {content}
    </button>
  );
});
