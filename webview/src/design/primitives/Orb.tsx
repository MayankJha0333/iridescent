// ─────────────────────────────────────────────────────────────
// Animated brand orb — conic-gradient ring + counter-rotating
// inner glow. Used in the empty state and the auth hero.
// ─────────────────────────────────────────────────────────────

import { motion } from "framer-motion";

export interface OrbProps {
  size?: number;
  /** Adds an outer halo glow behind the orb. */
  halo?: boolean;
}

export function Orb({ size = 72, halo = true }: OrbProps) {
  return (
    <div
      className="relative mb-[22px] text-[0]"
      style={{ width: size, height: size }}
    >
      {halo && (
        <div
          className="pointer-events-none absolute -inset-[22px] rounded-full blur-[10px]"
          style={{
            background:
              "radial-gradient(circle, var(--accent-shadow), transparent 70%)"
          }}
        />
      )}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 180deg, var(--accent), var(--accent-glow), var(--accent))",
          filter: "blur(0.5px)",
          boxShadow:
            "0 0 60px var(--accent-shadow), 0 0 120px var(--accent-soft)"
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-[3px] rounded-full bg-s0" />
      <motion.div
        className="absolute inset-[6px] rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, var(--accent) 0%, transparent 25%, var(--accent-glow) 50%, transparent 75%, var(--accent) 100%)",
          filter: "blur(6px)"
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <motion.span
      className="relative inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "conic-gradient(from 180deg, var(--accent), var(--accent-glow), var(--accent))",
        boxShadow: "0 0 30px var(--accent-shadow)"
      }}
      role="status"
      aria-label="Loading"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
    >
      <span className="absolute inset-[3px] rounded-full bg-s0" aria-hidden />
    </motion.span>
  );
}
