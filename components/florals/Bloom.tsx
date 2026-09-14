const PETALS = 6;

export function Bloom({
  progress,
  label,
  size = 64,
}: {
  /** 0..1. Values outside are clamped. */
  progress: number;
  /** Omit for decoration; provide for a real progress indicator. */
  label?: string;
  size?: number;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const filled = p * PETALS;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: PETALS }, (_, i) => {
        // Each petal fills in turn, the last one partially.
        const fill = Math.max(0, Math.min(1, filled - i));
        return (
          <ellipse
            key={i}
            cx="50"
            cy="27"
            rx="11"
            ry="21"
            transform={`rotate(${(360 / PETALS) * i} 50 50)`}
            fill="var(--sea-mid)"
            fillOpacity={0.18 + fill * 0.72}
            stroke="var(--sea-near)"
            strokeOpacity={0.35}
            strokeWidth="1"
          />
        );
      })}
      <circle cx="50" cy="50" r="9" fill="var(--sun-warm)" />
    </svg>
  );
}
