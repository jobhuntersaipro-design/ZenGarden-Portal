import type { ReactNode } from "react";
import type { StagePoint } from "@/lib/analytics/fulfillment";
import { StackedStageChart } from "@/components/dashboard/StackedStageChart";

/**
 * The second chart card: where each period's confirmed orders stand today.
 * The stage bar with its counted, linked legend renders as `children` under
 * the chart, so the six stage counts live in one place and each is the way
 * into the rows it counts.
 */
export function StageCard({
  points,
  openCount,
  children,
}: {
  points: StagePoint[];
  openCount: number;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface p-xl">
      <div>
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Order stage
        </p>
        <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
          {openCount === 0
            ? "Every order delivered"
            : `${openCount} ${openCount === 1 ? "order" : "orders"} still open`}
        </h2>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          Where each period&apos;s orders stand today · hover a bar for the split
        </p>
      </div>

      <div className="mt-lg">
        <StackedStageChart points={points} />
      </div>

      {children ? (
        <div className="mt-lg border-t border-hairline pt-lg">{children}</div>
      ) : null}
    </section>
  );
}
