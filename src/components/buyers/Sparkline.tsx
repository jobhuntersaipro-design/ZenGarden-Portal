/**
 * 60×24 inline SVG, scaled to its own maximum — this is a shape, not a
 * comparison between buyers, and a shared scale would flatten every small
 * buyer to a straight line.
 */
export function Sparkline({
  points,
  muted = false,
}: {
  points: number[];
  muted?: boolean;
}) {
  const width = 60;
  const height = 24;
  const max = Math.max(...points, 0);

  if (points.length < 2 || max === 0) {
    return (
      <span aria-hidden className="block h-6 w-15 text-ink-disabled">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <line
            x1={0}
            y1={height - 1}
            x2={width}
            y2={height - 1}
            stroke="currentColor"
            strokeWidth={2}
          />
        </svg>
      </span>
    );
  }

  const step = width / (points.length - 1);
  const d = points
    .map((value, index) => {
      const x = index * step;
      // 2px inset top and bottom so the stroke is never clipped.
      const y = height - 2 - (value / max) * (height - 4);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <span
      aria-hidden
      className={`block ${muted ? "text-ink-disabled" : "text-ink"}`}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
