const COLORS = [
  "#f59e0b", // Amber/Gold
  "#10b981", // Emerald
  "#ef4444", // Ruby/Red
  "#3b82f6", // Festive Blue
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#38bdf8", // Sky Blue
  "#fbbf24", // Yellow
];

const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 17 + 7) % 100}%`,
  delay: `${((i * 13) % 25) * 0.08}s`,
  duration: `${2.2 + ((i * 7) % 15) * 0.1}s`,
  color: COLORS[i % COLORS.length],
  size: `${7 + (i % 4) * 3}px`,
  shape: i % 3 === 0 ? "circle" : i % 3 === 1 ? "rect" : "strip",
  rotation: `${(i * 37) % 360}deg`,
}));

/**
 * Decorative confetti burst. CSS-only and pointer-events:none so it never intercepts
 * clicks. Hidden entirely under prefers-reduced-motion.
 */
export function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="confetti-burst pointer-events-none fixed inset-0 z-20 overflow-hidden"
      data-testid="confetti-burst"
    >
      {PARTICLES.map((particle, i) => (
        <span
          className="confetti-piece"
          key={i}
          style={{
            left: particle.left,
            width: particle.shape === "strip" ? "4px" : particle.size,
            height: particle.shape === "strip" ? particle.size : particle.size,
            backgroundColor: particle.color,
            borderRadius:
              particle.shape === "circle" ? "50%" : particle.shape === "rect" ? "2px" : "1px",
            animationDelay: particle.delay,
            animationDuration: particle.duration,
            transform: `rotate(${particle.rotation})`,
          }}
        />
      ))}
    </div>
  );
}
