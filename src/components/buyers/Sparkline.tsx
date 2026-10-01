import { Sparkline as ArcSparkline } from "@/components/arc/sparkline/sparkline";

/**
 * A buyer's monthly totals as Arc's sparkline, 60×24 in the roster cell.
 *
 * Scaled to its own maximum — this is a shape, not a comparison between
 * buyers, and a shared scale would flatten every small buyer to a straight
 * line. Arc always draws a caption; here it is kept for screen readers only,
 * because the row already names the buyer and its total.
 */
export function Sparkline({
  points,
  label = "Monthly order value",
  muted = false,
}: {
  points: number[];
  label?: string;
  muted?: boolean;
}) {
  const flat = points.length < 2 || Math.max(...points, 0) === 0;
  return (
    <span
      className={`block w-15 [&_figcaption]:sr-only ${muted || flat ? "opacity-50" : ""}`}
    >
      <ArcSparkline
        data={flat ? [0, 0] : points}
        label={label}
        width={60}
        height={24}
        interactive={false}
        tone="accent"
      />
    </span>
  );
}
