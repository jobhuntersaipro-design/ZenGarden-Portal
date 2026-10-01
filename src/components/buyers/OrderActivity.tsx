import { ActivityHeatmap } from "@/components/arc/activity-heatmap/activity-heatmap";

/**
 * A year of this buyer's purchase orders, one square per day, as Arc's
 * activity heatmap. The order trend above follows the page's range; this does
 * not, because the question it answers — how regularly do they order — needs
 * the whole year to read.
 */
export function OrderActivity({
  days,
}: {
  days: { date: string; count: number }[];
}) {
  return (
    <section className="min-w-0 rounded-xl bg-surface p-xl">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Order activity
      </p>
      <h2 className="mb-md font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
        The last 12 months
      </h2>
      <ActivityHeatmap
        days={days}
        label="Purchase orders per day, last 12 months"
        period="the last 12 months"
        unit={{ one: "purchase order", other: "purchase orders" }}
        weekStartsOn={1}
        locale="en-GB"
      />
    </section>
  );
}
