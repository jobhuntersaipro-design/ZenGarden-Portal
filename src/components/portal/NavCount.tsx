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
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-xxs text-[length:var(--text-caption)] font-semibold tabular-nums text-canvas ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** "Purchase Orders, 3 need review" — the link's name when there is a count. */
export const withCountLabel = (label: string, count: number) =>
  count > 0 ? `${label}, ${count} ${count === 1 ? "needs" : "need"} review` : label;
