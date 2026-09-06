import type { ReactNode } from "react";
import { CountUp } from "@/components/portal/CountUp";

/**
 * A KPI tile.
 *
 * These tiles counted up over 900 ms until 2026-09-06, when the review filed
 * the animation as the "laggy / unresponsive" complaint: Dashboard read 13 POs
 * / RM 254k and then 38 POs / RM 737k, both of them 34% of the final figures,
 * which is one frame of an ease-out cubic and not a data refetch at all. The
 * animation was cut and the tiles rendered their server value only.
 *
 * It is back, at 2s, by request on the same day — with the rule that made the
 * old one unsafe fixed rather than repeated. The server figure is the initial
 * state, so the HTML and the first paint are always the true number and a
 * static capture of the markup cannot be caught at zero; the count runs after
 * mount as an enhancement, continues from the frame on screen when the range
 * changes instead of restarting at nothing, and does not run at all under
 * `prefers-reduced-motion`. See `useCountUp`.
 */
export function KpiTile({
  label,
  value,
  caption,
  wide = false,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  caption: ReactNode;
  wide?: boolean;
  /**
   * A step down to `heading-md`. Four money tiles across a row cannot hold a
   * full MYR figure at display size, and "RM 741,941.12" broken over two lines
   * is not a number any more.
   */
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-hairline bg-canvas p-md ${wide ? "sm:col-span-2" : ""}`}
    >
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {label}
      </p>
      <p
        className={`mt-xxs font-display font-[650] text-ink tabular-nums ${
          compact
            ? "text-[length:var(--text-heading-md)] tracking-[-0.91px]"
            : "text-[length:var(--text-display-md)] tracking-[-1.36px]"
        }`}
      >
        {value}
      </p>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-secondary">
        {caption}
      </p>
    </div>
  );
}

/** Money is never abbreviated in a KPI — `RM 1.2M` is banned here. */
export function KpiMoney({ value }: { value: number }) {
  return <CountUp value={value} format="money" />;
}

export function KpiNumber({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  return <CountUp value={value} decimals={decimals} suffix={suffix} />;
}
