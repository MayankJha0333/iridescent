// ─────────────────────────────────────────────────────────────
// Animated brand orb — conic-gradient ring + counter-rotating
// inner glow. Used in the empty state and the auth hero.
// ─────────────────────────────────────────────────────────────

export interface OrbProps {
  size?: number;
  /** Adds an outer halo glow behind the orb. */
  halo?: boolean;
}

export function Orb({ size = 72, halo = true }: OrbProps) {
  return (
    <div className="orb" style={{ width: size, height: size }}>
      {halo && <div className="orb-halo" />}
      <div className="orb-ring" />
      <div className="orb-core" />
      <div className="orb-inner" />
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="orb-spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
