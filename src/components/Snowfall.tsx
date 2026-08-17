const FLAKES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 8) * 1.4}s`,
  duration: `${9 + (i % 5) * 2}s`,
  size: `${6 + (i % 3) * 3}px`,
}));

/**
 * Decorative snow. CSS-only and pointer-events:none so it can never intercept
 * a click on the card grid. Hidden entirely under prefers-reduced-motion.
 */
export function Snowfall() {
  return (
    <div aria-hidden="true" className="snowfall">
      {FLAKES.map((flake, i) => (
        <span
          className="snowflake"
          key={i}
          style={{
            left: flake.left,
            width: flake.size,
            height: flake.size,
            animationDelay: flake.delay,
            animationDuration: flake.duration,
          }}
        />
      ))}
    </div>
  );
}
