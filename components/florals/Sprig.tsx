export function Sprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 200"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M60 200 C 60 150, 54 110, 60 60"
        stroke="var(--sea-mid)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {[
        { y: 158, dir: -1 },
        { y: 126, dir: 1 },
        { y: 96, dir: -1 },
        { y: 70, dir: 1 },
      ].map(({ y, dir }, i) => (
        <ellipse
          key={i}
          cx={60 + dir * 17}
          cy={y}
          rx="17"
          ry="7"
          transform={`rotate(${dir * -22} ${60 + dir * 17} ${y})`}
          fill="var(--sea-far)"
          fillOpacity="0.75"
        />
      ))}
      <circle cx="60" cy="52" r="11" fill="var(--sky-mid)" />
      <circle cx="60" cy="52" r="5" fill="var(--sun-warm)" />
    </svg>
  );
}
