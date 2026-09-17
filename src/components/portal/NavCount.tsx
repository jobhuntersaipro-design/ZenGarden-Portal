/**
 * The number beside Purchase Orders in the sidebar and on the phone's Orders
 * tab (Phase 46): how many orders are waiting on the team — the review queue
 * at the top of /purchase-orders, counted by the same query.
 *
 * The dark pill — ink with canvas text, the primary button's colours — at the
 * user's choice over amber and over the soft grey `badge-pill`, which all but
 * vanished on the selected sidebar row, itself `surface-soft`. Also beside the
 * review queue's heading, so the number reads the same in both places.
 * Hidden from assistive technology in the nav, where the link's own name
 * carries the count in words. Nothing renders at zero, because an empty inbox
 * is not news.
 */
export function NavCount({
  count,
  attention = false,
  className = "relative",
}: {
  count: number;
  /**
   * A faint ring fades outward every few seconds, so a waiting order is seen
   * from any page. The nav passes it; the queue's own heading does not — the
   * reader is already looking at the rows.
   */
  attention?: boolean;
  /** Must position the pill (`relative` or `absolute`): the ring sits in it. */
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      // Keyed by the number, so a change remounts the pill and replays its
      // pop; the same number across a navigation stays still.
      key={count}
      aria-hidden
      className={`inline-flex h-5 min-w-5 animate-count-pop items-center justify-center rounded-full bg-ink px-xxs text-[length:var(--text-caption)] font-semibold tabular-nums text-canvas ${className}`}
    >
      {attention ? (
        <span className="pointer-events-none absolute inset-0 animate-count-ping rounded-full bg-ink" />
      ) : null}
      {/* Positioned so it paints above the ring, which is positioned too. */}
      <span className="relative">{count > 99 ? "99+" : count}</span>
    </span>
  );
}

/** "Purchase Orders, 3 need review" — the link's name when there is a count. */
export const withCountLabel = (label: string, count: number) =>
  count > 0 ? `${label}, ${count} ${count === 1 ? "needs" : "need"} review` : label;
