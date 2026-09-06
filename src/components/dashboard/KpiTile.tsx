import type { ReactNode } from "react";
import { formatMYR } from "@/lib/money";

/**
 * A KPI tile. The value is whatever the server computed, and it does not move
 * afterwards.
 *
 * These tiles used to count up over 900 ms — server-rendering the real figure
 * first, so a screenshot at t=0 was correct, then animating to it. The
 * 2026-09-06 review caught that animation and filed it as the "laggy /
 * unresponsive" complaint: Dashboard read 13 POs / RM 254k and then 38 POs /
 * RM 737k, both of them 34% of the final figures, which is one frame of an
 * ease-out cubic and not a data refetch at all. Buyers 2 → 11 and Products
 * 11 → 12 were the same hook on other tiles.
 *
 * The brief's rule is that no headline number may look final and then change
 * (G1), and a count-up cannot satisfy it — the intermediate frames are
 * indistinguishable from a silent revision. So the animation is gone. This is
 * a deliberate departure from the canvas and from 00-master.md §4 "Numbers
 * render final, then animate"; what survives is the half of that rule that
 * mattered, which is that the first paint is the true value.
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
  return <>{formatMYR(value.toFixed(2))}</>;
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
  return <>{`${value.toFixed(decimals)}${suffix}`}</>;
}
