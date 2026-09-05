import type { BuyerStatusClass } from "@/lib/analytics/buyer-status";

/**
 * Shared status tokens (00-master.md §4). "New" is neutral, not blue: blue
 * means a process in flight and a new buyer is a standing fact — and on a
 * roster whose job is "who needs me today", only the three above it earn a
 * colour.
 */
const TONE: Record<BuyerStatusClass, { label: string; tone: string }> = {
  lapsed: { label: "Lapsed", tone: "text-accent-red" },
  "at-risk": { label: "At risk", tone: "text-brand-amber" },
  new: { label: "New", tone: "text-ink-secondary" },
  active: { label: "Active", tone: "text-accent-green" },
};

export function BuyerStatusBadge({ status }: { status: BuyerStatusClass }) {
  const { label, tone } = TONE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${tone}`}
    >
      {label}
    </span>
  );
}

/**
 * Any count of one or more is red; zero is a neutral dash. No amber tier: the
 * number only counts items already past their interval, so there is nothing to
 * warn about in advance and an amber step would imply a distinction the data
 * does not make.
 */
export function OverdueCount({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-ink-secondary">—</span>;
  }
  return <span className="tabular-nums text-accent-red">{count}</span>;
}
